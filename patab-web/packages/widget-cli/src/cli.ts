import { resolve } from 'node:path'

import { generateWidgetKeyPair } from './keys.js'
import { checkWidgetProject, inspectWidgetPackage, packWidgetProject } from './packageCommands.js'
import { loadWidgetProject } from './project.js'
import { printWidgetCliReport, toWidgetCliReport, WidgetCliError } from './report.js'
import { startWidgetSimulator } from './simulator.js'
import { buildWidgetSurfaces } from './surfaceBuild.js'

/** 命令行选项只支持阶段 11 已承诺的最小集合，刻意不提供 --force 或绕过安全校验的隐蔽开关。 */
interface ParsedCliArguments {
  readonly command?: string
  readonly positionals: readonly string[]
  readonly root: string
  readonly outputPath?: string
  readonly signPrivateKeyPath?: string
  readonly keyOutputPath?: string
  readonly host?: string
  readonly port?: number
}

/** 读取一个需要值的 option；缺值立即报错，避免把下一个命令或私钥路径错当作空参数。 */
function readOptionValue(argumentsList: readonly string[], index: number, option: string): string {
  const value = argumentsList[index + 1]
  if (!value || value.startsWith('--')) throw new WidgetCliError('CHECK_FAILED', `${option} 缺少参数。`)
  return value
}

/** 解析命令和明确允许的 option，未知参数与 --force 会被拒绝而不是被未来逻辑静默忽略。 */
function parseCliArguments(argumentsList: readonly string[]): ParsedCliArguments {
  let command: string | undefined
  const positionals: string[] = []
  let root = process.cwd()
  let outputPath: string | undefined
  let signPrivateKeyPath: string | undefined
  let keyOutputPath: string | undefined
  let host: string | undefined
  let port: number | undefined
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]!
    if (!argument.startsWith('--')) {
      if (!command) command = argument
      else positionals.push(argument)
      continue
    }
    if (argument === '--root') root = readOptionValue(argumentsList, index++, '--root')
    else if (argument === '--out') outputPath = readOptionValue(argumentsList, index++, '--out')
    else if (argument === '--sign') signPrivateKeyPath = readOptionValue(argumentsList, index++, '--sign')
    else if (argument === '--key-out') keyOutputPath = readOptionValue(argumentsList, index++, '--key-out')
    else if (argument === '--host') host = readOptionValue(argumentsList, index++, '--host')
    else if (argument === '--port') {
      const parsedPort = Number(readOptionValue(argumentsList, index++, '--port'))
      if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) throw new WidgetCliError('CHECK_FAILED', '端口必须是 1 到 65535 的整数。')
      port = parsedPort
    } else throw new WidgetCliError('CHECK_FAILED', '命令包含不支持或不安全的参数。')
  }
  return { command, positionals, root: resolve(root), outputPath, signPrivateKeyPath, keyOutputPath, host, port }
}

/** 输出固定简短帮助，所有实际校验仍以命令执行为准，避免文档文本成为可绕过的第二套规则。 */
function printHelp(): void {
  process.stdout.write('patab-widget <dev|check|build|pack|inspect|keygen> [--root 目录] [--out 文件] [--sign 私钥]\n')
}

/** 在 SIGINT/SIGTERM 中关闭 Vite server，确保 HMR websocket、监听端口和 sandbox 模拟器不会残留。 */
async function waitForSimulatorShutdown(server: Awaited<ReturnType<typeof startWidgetSimulator>>): Promise<void> {
  await new Promise<void>((resolveShutdown) => {
    const close = (): void => {
      process.off('SIGINT', close)
      process.off('SIGTERM', close)
      void server.close().finally(resolveShutdown)
    }
    process.once('SIGINT', close)
    process.once('SIGTERM', close)
  })
}

/**
 * 执行 patab-widget 子命令并返回适合 shell 的退出码。
 *
 * 所有 check/pack/inspect 失败统一通过稳定 JSON 报告和非零返回值表达，避免输出原始 Vite、ZIP、私钥或 Node 异常。
 */
export async function runPatabWidgetCli(argumentsList: readonly string[]): Promise<number> {
  let parsed: ParsedCliArguments
  try {
    parsed = parseCliArguments(argumentsList)
    if (!parsed.command || parsed.command === 'help') {
      printHelp()
      return parsed.command ? 0 : 1
    }
    if (parsed.command === 'dev') {
      const server = await startWidgetSimulator({ root: parsed.root, host: parsed.host, port: parsed.port })
      process.stdout.write(`模拟器已启动：${server.resolvedUrls?.local[0] ?? '本地开发地址'}${'__patab_widget_simulator__'}\n`)
      await waitForSimulatorShutdown(server)
      return 0
    }
    if (parsed.command === 'check') {
      const summary = await checkWidgetProject(parsed.root)
      printWidgetCliReport({ ok: true, code: 'OK', message: `组件校验通过：${summary.componentId}@${summary.version}` })
      return 0
    }
    if (parsed.command === 'build') {
      const project = await loadWidgetProject(parsed.root)
      const surfaces = await buildWidgetSurfaces(project)
      printWidgetCliReport({ ok: true, code: 'OK', message: `已构建 ${surfaces.length} 个自包含 surface。` })
      return 0
    }
    if (parsed.command === 'inspect') {
      const archive = parsed.positionals[0]
      if (!archive || parsed.positionals.length !== 1) throw new WidgetCliError('CHECK_FAILED', 'inspect 需要一个 ZIP 文件参数。')
      const summary = await inspectWidgetPackage(archive)
      printWidgetCliReport({ ok: true, code: 'OK', message: `组件包检查通过：${summary.componentId}@${summary.version}` })
      return 0
    }
    if (parsed.command === 'pack') {
      if (parsed.positionals.length !== 0) throw new WidgetCliError('CHECK_FAILED', 'pack 不接受额外位置参数。')
      const result = await packWidgetProject({
        root: parsed.root,
        outputPath: parsed.outputPath,
        ...(parsed.signPrivateKeyPath ? { signPrivateKeyPath: resolve(parsed.root, parsed.signPrivateKeyPath) } : {}),
      })
      printWidgetCliReport({ ok: true, code: 'OK', message: `组件包已生成：${result.fileName}${result.summary.signed ? '（已签名）' : '（未签名）'}` })
      return 0
    }
    if (parsed.command === 'keygen') {
      if (parsed.positionals.length !== 0) throw new WidgetCliError('CHECK_FAILED', 'keygen 不接受额外位置参数。')
      const project = await loadWidgetProject(parsed.root)
      const pair = await generateWidgetKeyPair({
        projectRoot: project.root,
        manifest: project.manifest,
        ...(parsed.keyOutputPath ? { outputPath: resolve(project.root, parsed.keyOutputPath) } : {}),
      })
      process.stdout.write(`${JSON.stringify({ ok: true, publicKeyBase64: pair.publicKeyBase64, privateKeyPath: pair.privateKeyPath, warning: '私钥位于项目外，请勿提交版本控制。' })}\n`)
      return 0
    }
    throw new WidgetCliError('CHECK_FAILED', '未知 patab-widget 命令。')
  } catch (error) {
    printWidgetCliReport(toWidgetCliReport(error))
    return 1
  }
}
