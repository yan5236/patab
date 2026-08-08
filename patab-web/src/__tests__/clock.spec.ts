/**
 * clock 工具单元测试
 * 覆盖时长格式化、计时器输入夹紧和持久化配置清洗。
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_TIMER_MS,
  clampTimerPart,
  defaultClockConfig,
  formatCountdownMs,
  formatStopwatchMs,
  sanitizeClockConfig,
  timerPartsToMs,
} from '@/utils/clock'

describe('formatStopwatchMs', () => {
  it('0 显示为 00:00.00', () => {
    expect(formatStopwatchMs(0)).toBe('00:00.00')
  })

  it('mm:ss.cs，厘秒向下取整', () => {
    expect(formatStopwatchMs(61234)).toBe('01:01.23')
    expect(formatStopwatchMs(61239)).toBe('01:01.23')
  })

  it('满 1 小时加小时前缀', () => {
    expect(formatStopwatchMs(3600000)).toBe('01:00:00.00')
    expect(formatStopwatchMs(3661234)).toBe('01:01:01.23')
  })

  it('负数归零', () => {
    expect(formatStopwatchMs(-5)).toBe('00:00.00')
  })
})

describe('formatCountdownMs', () => {
  it('0 显示为 00:00', () => {
    expect(formatCountdownMs(0)).toBe('00:00')
  })

  it('不足 1 秒向上取整，避免提前归零', () => {
    expect(formatCountdownMs(500)).toBe('00:01')
    expect(formatCountdownMs(61000)).toBe('01:01')
  })

  it('满 1 小时加小时前缀', () => {
    expect(formatCountdownMs(3600000)).toBe('01:00:00')
  })
})

describe('clampTimerPart / timerPartsToMs', () => {
  it('负数与非法输入归零，超过上限夹紧', () => {
    expect(clampTimerPart(-5, 59)).toBe(0)
    expect(clampTimerPart(70, 59)).toBe(59)
    expect(clampTimerPart('abc', 59)).toBe(0)
    expect(clampTimerPart(12.9, 99)).toBe(12)
  })

  it('时分秒换算为毫秒并按各自上限夹紧', () => {
    expect(timerPartsToMs(1, 2, 3)).toBe((3600 + 120 + 3) * 1000)
    expect(timerPartsToMs(100, 99, 99)).toBe(MAX_TIMER_MS)
  })
})

describe('defaultClockConfig', () => {
  it('按类型生成初始配置，运行状态全部为初始值', () => {
    const config = defaultClockConfig('stopwatch')
    expect(config.type).toBe('stopwatch')
    expect(config.stopwatch).toEqual({
      startedAt: null,
      accumulatedMs: 0,
      running: false,
      laps: [],
    })
    expect(config.timer).toEqual({
      durationMs: 0,
      endsAt: null,
      remainingMs: 0,
      running: false,
      finished: false,
    })
  })
})

describe('sanitizeClockConfig', () => {
  it('缺失或非法类型回落 time', () => {
    expect(sanitizeClockConfig(undefined).type).toBe('time')
    expect(sanitizeClockConfig(null).type).toBe('time')
    expect(sanitizeClockConfig({ type: 'bad' }).type).toBe('time')
    expect(sanitizeClockConfig({ type: 'timer' }).type).toBe('timer')
  })

  it('运行中的秒表保留 startedAt，脏污时降级为暂停', () => {
    const valid = sanitizeClockConfig({
      type: 'stopwatch',
      stopwatch: { startedAt: 1000, accumulatedMs: 500, running: true, laps: [] },
    })
    expect(valid.stopwatch.running).toBe(true)
    expect(valid.stopwatch.startedAt).toBe(1000)

    const dirty = sanitizeClockConfig({
      type: 'stopwatch',
      stopwatch: { startedAt: null, accumulatedMs: 500, running: true, laps: [] },
    })
    expect(dirty.stopwatch.running).toBe(false)
    expect(dirty.stopwatch.accumulatedMs).toBe(500)
  })

  it('计次记录丢弃缺字段的脏条目', () => {
    const config = sanitizeClockConfig({
      type: 'stopwatch',
      stopwatch: {
        running: false,
        laps: [{ total: 100, delta: 100 }, { total: 'bad' }, null, { total: 300, delta: 200 }],
      },
    })
    expect(config.stopwatch.laps).toEqual([
      { total: 100, delta: 100 },
      { total: 300, delta: 200 },
    ])
  })

  it('运行中的计时器保留 endsAt，时长夹紧到 99:59:59', () => {
    const config = sanitizeClockConfig({
      type: 'timer',
      timer: { durationMs: MAX_TIMER_MS + 1000, endsAt: 1234, remainingMs: 0, running: true, finished: false },
    })
    expect(config.timer.durationMs).toBe(MAX_TIMER_MS)
    expect(config.timer.running).toBe(true)
    expect(config.timer.endsAt).toBe(1234)

    const dirty = sanitizeClockConfig({
      type: 'timer',
      timer: { durationMs: 1000, endsAt: 'bad', remainingMs: 0, running: true, finished: true },
    })
    expect(dirty.timer.running).toBe(false)
    expect(dirty.timer.endsAt).toBeNull()
    expect(dirty.timer.finished).toBe(true)
  })
})
