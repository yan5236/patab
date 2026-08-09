/** CLI 对外输出的固定报告码；不会输出绝对路径、密钥或底层工具异常。 */
export type WidgetCliReportCode =
  | 'API_INCOMPATIBLE'
  | 'BUILD_FAILED'
  | 'CHECK_FAILED'
  | 'INTEGRITY_FAILED'
  | 'INVALID_PACKAGE'
  | 'MANIFEST_INVALID'
  | 'SIGNATURE_INVALID'
  | 'TYPE_CHECK_FAILED'

/** 命令校验失败时使用的稳定错误；verbose 模式外不应把 cause 输出到终端。 */
export class WidgetCliError extends Error {
  /** 创建携带稳定码与安全消息的 CLI 错误。 */
  constructor(readonly code: WidgetCliReportCode, message: string) {
    super(message)
    this.name = 'WidgetCliError'
  }
}

/** 描述 check 与 inspect 的机器可读最小报告，方便 npm/pnpm 脚本在不解析人类文本时判断结果。 */
export interface WidgetCliReport {
  readonly ok: boolean
  readonly code: 'OK' | WidgetCliReportCode
  readonly message: string
}

/** 创建成功报告；成功文本不含工作目录，避免路径被默认日志收集。 */
export function createWidgetCliSuccess(message: string): WidgetCliReport {
  return { ok: true, code: 'OK', message }
}

/** 将已知 CLI 错误映射为稳定报告，其它异常压缩为通用构建失败。 */
export function toWidgetCliReport(error: unknown): WidgetCliReport {
  if (error instanceof WidgetCliError) return { ok: false, code: error.code, message: error.message }
  return { ok: false, code: 'BUILD_FAILED', message: '组件工具链执行失败。' }
}

/** 以单行 JSON 输出报告，确保 Windows 与 Linux 上的 shell 都可以稳定消费。 */
export function printWidgetCliReport(report: WidgetCliReport): void {
  process.stdout.write(`${JSON.stringify(report)}\n`)
}
