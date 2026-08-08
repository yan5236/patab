/**
 * clock —— 时钟小组件的纯逻辑工具（便于单测）
 *
 * 集中：类型常量、默认/清洗配置（持久化数据兼容）、
 * 秒表与计时器的时长格式化、计时器输入夹紧。
 * 运行状态只存时间戳与累计值，显示值由组件按间隔重算。
 */
import type {
  ClockConfig,
  ClockType,
  StopwatchLap,
  StopwatchState,
  TimerState,
} from '@/types'

/** 支持的时钟类型（顺序即类型选择弹窗的展示顺序） */
export const CLOCK_TYPES: readonly ClockType[] = ['time', 'stopwatch', 'timer']

/** 计时器可设定的最大时长 99:59:59（毫秒） */
export const MAX_TIMER_MS = (99 * 3600 + 59 * 60 + 59) * 1000

/** 默认秒表状态（未开始、无计次） */
export function defaultStopwatchState(): StopwatchState {
  return { startedAt: null, accumulatedMs: 0, running: false, laps: [] }
}

/** 默认计时器状态（未设定、未开始） */
export function defaultTimerState(): TimerState {
  return { durationMs: 0, endsAt: null, remainingMs: 0, running: false, finished: false }
}

/** 创建指定类型的时钟配置（运行状态全部为初始值） */
export function defaultClockConfig(type: ClockType): ClockConfig {
  return { type, stopwatch: defaultStopwatchState(), timer: defaultTimerState() }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** 清洗计次记录，丢弃缺字段的脏条目 */
function sanitizeLaps(value: unknown): StopwatchLap[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item): item is StopwatchLap =>
        isRecord(item) &&
        typeof item.total === 'number' &&
        Number.isFinite(item.total) &&
        typeof item.delta === 'number' &&
        Number.isFinite(item.delta),
    )
    .map((item) => ({ total: item.total, delta: item.delta }))
}

/**
 * 清洗时钟小组件配置（持久化数据兼容）：
 * 类型缺失或非法时回落 'time'；运行状态字段逐个数位校验，
 * 运行中但时间戳脏污时降级为暂停，避免刷新后计时爆炸。
 */
export function sanitizeClockConfig(value: unknown): ClockConfig {
  const raw = isRecord(value) ? value : {}
  const type = CLOCK_TYPES.includes(raw.type as ClockType) ? (raw.type as ClockType) : 'time'

  const rawStopwatch = isRecord(raw.stopwatch) ? raw.stopwatch : {}
  const stopwatch: StopwatchState = {
    startedAt: null,
    accumulatedMs: Math.max(0, finiteNumber(rawStopwatch.accumulatedMs, 0)),
    running: rawStopwatch.running === true,
    laps: sanitizeLaps(rawStopwatch.laps),
  }
  const startedAt = finiteNumber(rawStopwatch.startedAt, NaN)
  if (stopwatch.running && Number.isFinite(startedAt)) {
    stopwatch.startedAt = startedAt
  } else {
    stopwatch.running = false
  }

  const rawTimer = isRecord(raw.timer) ? raw.timer : {}
  const timer: TimerState = {
    durationMs: Math.min(Math.max(0, finiteNumber(rawTimer.durationMs, 0)), MAX_TIMER_MS),
    endsAt: null,
    remainingMs: Math.max(0, finiteNumber(rawTimer.remainingMs, 0)),
    running: rawTimer.running === true,
    finished: rawTimer.finished === true,
  }
  const endsAt = finiteNumber(rawTimer.endsAt, NaN)
  if (timer.running && Number.isFinite(endsAt)) {
    timer.endsAt = endsAt
  } else {
    timer.running = false
  }

  return { type, stopwatch, timer }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 秒表显示：mm:ss.cs；满 1 小时加小时前缀 hh:mm:ss.cs */
export function formatStopwatchMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  const cs = Math.floor((total % 1000) / 10)
  const s = Math.floor(total / 1000) % 60
  const m = Math.floor(total / 60000) % 60
  const h = Math.floor(total / 3600000)
  const base = `${pad(m)}:${pad(s)}.${pad(cs)}`
  return h > 0 ? `${pad(h)}:${base}` : base
}

/** 计时器剩余时间显示：mm:ss；满 1 小时加小时前缀 hh:mm:ss（向上取整，避免最后一秒提前归零） */
export function formatCountdownMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const s = totalSeconds % 60
  const m = Math.floor(totalSeconds / 60) % 60
  const h = Math.floor(totalSeconds / 3600)
  const base = `${pad(m)}:${pad(s)}`
  return h > 0 ? `${pad(h)}:${base}` : base
}

/** 夹紧计时器输入（小时 0-99，分钟 / 秒 0-59；非法输入归零） */
export function clampTimerPart(value: unknown, max: number): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(Math.floor(n), max)
}

/** 把时 / 分 / 秒输入换算为毫秒总时长（已按各自上限夹紧） */
export function timerPartsToMs(hours: unknown, minutes: unknown, seconds: unknown): number {
  const h = clampTimerPart(hours, 99)
  const m = clampTimerPart(minutes, 59)
  const s = clampTimerPart(seconds, 59)
  return (h * 3600 + m * 60 + s) * 1000
}
