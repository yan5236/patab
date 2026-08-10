import type { WidgetTemplate } from './scaffold.js'

/** 交互式提问函数，独立注入以便在不启动真实终端的情况下验证参数补全行为。 */
export type AskQuestion = (question: string) => Promise<string>

/** 创建项目所需的最终命令行输入。 */
export interface CreateCommandInput {
  readonly name: string
  readonly template: WidgetTemplate
}

/** 从命令行参数读取模板值，未提供或无效时交由交互问题处理。 */
function readTemplate(argumentsList: readonly string[]): WidgetTemplate | undefined {
  const index = argumentsList.indexOf('--template')
  const value = index >= 0 ? argumentsList[index + 1] : undefined
  return value === 'vue-ts' || value === 'vanilla-ts' ? value : undefined
}

/** 读取第一个位置参数，并排除 `--template` 后紧随的模板值。 */
function readProjectName(argumentsList: readonly string[]): string | undefined {
  const templateIndex = argumentsList.indexOf('--template')
  return argumentsList.find((argument, index) => (
    !argument.startsWith('-') && (templateIndex < 0 || index !== templateIndex + 1)
  ))
}

/** 将模板问题的数字或完整模板名答案收窄为官方模板，空答案保持 Vue 默认值。 */
function parseTemplateAnswer(answer: string): WidgetTemplate {
  const normalized = answer.trim()
  return normalized === '2' || normalized === 'vanilla-ts' ? 'vanilla-ts' : 'vue-ts'
}

/**
 * 补全创建命令输入。
 *
 * 命令行已提供的值保持优先；缺少项目名或模板时仅在可提问的交互终端补问，避免非交互任务永久等待。
 */
export async function resolveCreateCommandInput(
  argumentsList: readonly string[],
  askQuestion?: AskQuestion,
): Promise<CreateCommandInput> {
  const providedName = readProjectName(argumentsList)
  const providedTemplate = readTemplate(argumentsList)
  if ((!providedName || !providedTemplate) && !askQuestion) {
    throw new Error('非交互环境必须提供项目名和 --template。')
  }

  const name = providedName ?? (await askQuestion?.('项目名称：'))?.trim()
  if (!name) throw new Error('项目名称不能为空。')

  const answer = providedTemplate ? '' : await askQuestion?.('选择模板：1) vue-ts  2) vanilla-ts [1]：')
  const template = providedTemplate ?? parseTemplateAnswer(answer ?? '')
  return { name, template }
}
