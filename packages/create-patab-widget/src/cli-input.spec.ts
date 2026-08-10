import { describe, expect, it, vi } from 'vitest'

import { resolveCreateCommandInput } from './cli-input.js'

describe('create-patab-widget 命令输入', () => {
  /** 验证无参数交互命令会依次补问项目名和模板，而不是提前打印用法并退出。 */
  it('无参数时交互收集项目名和模板', async () => {
    const askQuestion = vi.fn()
      .mockResolvedValueOnce('weather-card')
      .mockResolvedValueOnce('2')

    await expect(resolveCreateCommandInput([], askQuestion)).resolves.toEqual({
      name: 'weather-card',
      template: 'vanilla-ts',
    })
    expect(askQuestion).toHaveBeenNthCalledWith(1, '项目名称：')
    expect(askQuestion).toHaveBeenNthCalledWith(2, '选择模板：1) vue-ts  2) vanilla-ts [1]：')
  })

  /** 验证已给项目名时只补问模板，保持原有带位置参数调用方式兼容。 */
  it('保留命令行项目名并只补问模板', async () => {
    const askQuestion = vi.fn().mockResolvedValue('')

    await expect(resolveCreateCommandInput(['focus-widget'], askQuestion)).resolves.toEqual({
      name: 'focus-widget',
      template: 'vue-ts',
    })
    expect(askQuestion).toHaveBeenCalledTimes(1)
  })

  /** 验证项目名位于模板选项之后时仍能正确识别，不会把模板值误当作目录名。 */
  it('识别模板选项之后的项目名', async () => {
    await expect(resolveCreateCommandInput(
      ['--template', 'vanilla-ts', 'notes-widget'],
    )).resolves.toEqual({ name: 'notes-widget', template: 'vanilla-ts' })
  })

  /** 验证命令行参数完整时不触发任何交互，便于 CI 稳定运行。 */
  it('完整参数直接创建且不提问', async () => {
    const askQuestion = vi.fn()

    await expect(resolveCreateCommandInput(
      ['clock-widget', '--template', 'vanilla-ts'],
      askQuestion,
    )).resolves.toEqual({ name: 'clock-widget', template: 'vanilla-ts' })
    expect(askQuestion).not.toHaveBeenCalled()
  })

  /** 验证非交互环境缺少必需输入时立即失败，防止 CI 挂起等待。 */
  it('非交互环境缺少输入时拒绝等待', async () => {
    await expect(resolveCreateCommandInput([])).rejects.toThrow('非交互环境必须提供项目名和 --template。')
  })
})
