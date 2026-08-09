import { describe, expect, it } from 'vitest'

import {
  beginCustomComponentBoot,
  completeCustomComponentBoot,
  recoverInterruptedCustomComponentBoot,
} from './customComponentSafetyState'

/** 创建轻量内存 storage，验证安全状态机不依赖真实浏览器 localStorage。 */
function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

/** 覆盖未清理启动标记的累计、安全模式阈值和正常完成后的计数重置。 */
describe('自定义组件启动安全状态机', () => {
  /** 验证连续三次遗留 pending 时先进入安全模式，整个恢复路径不需要创建 iframe。 */
  it('第三次未完成启动时开启全局安全模式', () => {
    const storage = createStorage()
    beginCustomComponentBoot(storage, 1)
    expect(recoverInterruptedCustomComponentBoot(storage)).toMatchObject({
      bootPending: false,
      consecutiveIncompleteBoots: 1,
      globalSafeMode: false,
    })
    beginCustomComponentBoot(storage, 2)
    expect(recoverInterruptedCustomComponentBoot(storage)).toMatchObject({ consecutiveIncompleteBoots: 2, globalSafeMode: false })
    beginCustomComponentBoot(storage, 3)
    expect(recoverInterruptedCustomComponentBoot(storage)).toMatchObject({ consecutiveIncompleteBoots: 3, globalSafeMode: true })
  })

  /** 验证全部初始实例健康或隔离后清除 pending，并重置下次崩溃检测的连续计数。 */
  it('正常完成启动会清理 pending 与连续累计', () => {
    const storage = createStorage()
    beginCustomComponentBoot(storage, 1)
    const recovered = recoverInterruptedCustomComponentBoot(storage)
    expect(recovered.consecutiveIncompleteBoots).toBe(1)
    beginCustomComponentBoot(storage, 2)
    expect(completeCustomComponentBoot(storage)).toMatchObject({
      bootPending: false,
      consecutiveIncompleteBoots: 0,
      globalSafeMode: false,
    })
  })
})
