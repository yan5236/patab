#!/usr/bin/env node
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

import { createWidgetProject, type WidgetTemplate } from './scaffold.js'

/** 从命令行参数读取模板值，未提供时由交互问题统一选择官方模板。 */
function readTemplate(argumentsList: readonly string[]): WidgetTemplate | undefined {
  const index = argumentsList.indexOf('--template')
  const value = index >= 0 ? argumentsList[index + 1] : undefined
  return value === 'vue-ts' || value === 'vanilla-ts' ? value : undefined
}

/** 在 TTY 中交互选择 Vue 或 Vanilla TypeScript；非 TTY 必须显式传参，避免 CI 卡住。 */
async function chooseTemplate(argumentsList: readonly string[]): Promise<WidgetTemplate> {
  const provided = readTemplate(argumentsList)
  if (provided) return provided
  if (!stdin.isTTY) throw new Error('非交互环境必须使用 --template vue-ts 或 --template vanilla-ts。')
  const readline = createInterface({ input: stdin, output: stdout })
  try {
    const answer = await readline.question('选择模板：1) vue-ts  2) vanilla-ts [1]：')
    return answer.trim() === '2' ? 'vanilla-ts' : 'vue-ts'
  } finally {
    readline.close()
  }
}

/** 执行 create-patab-widget，默认以当前目录下的项目名创建全新目录，不会写入已存在项目。 */
async function main(): Promise<void> {
  const argumentsList = process.argv.slice(2)
  const templateIndex = argumentsList.indexOf('--template')
  const name = argumentsList.find((argument, index) => !argument.startsWith('-') && index !== templateIndex + 1)
  if (!name || argumentsList.includes('--help')) {
    stdout.write('用法：create-patab-widget <项目名> [--template vue-ts|vanilla-ts]\n')
    process.exitCode = name ? 0 : 1
    return
  }
  const template = await chooseTemplate(argumentsList)
  const created = await createWidgetProject({ targetDirectory: name, name, template })
  stdout.write(`已创建 ${created.template} 组件项目。请先安装依赖，再运行 npm run check。\n`)
}

void main().catch(() => {
  process.stderr.write('创建组件项目失败。\n')
  process.exitCode = 1
})
