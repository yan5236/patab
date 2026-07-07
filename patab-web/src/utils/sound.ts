/**
 * sound —— Web Audio API 合成提示音
 * 不依赖外部音频文件，避免增加产物体积与网络请求。
 */

/** 合成一个清脆的“叮”声 */
export function playDing() {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return
    const ctx = new AudioContextCtor()

    // 主音：中高频正弦波，明亮稳定
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1760, ctx.currentTime)

    // 泛音：更高八度的微弱正弦波，增加金属感与清脆度
    const harmonic = ctx.createOscillator()
    const harmonicGain = ctx.createGain()
    harmonic.type = 'sine'
    harmonic.frequency.setValueAtTime(3520, ctx.currentTime)
    harmonicGain.gain.setValueAtTime(0.0001, ctx.currentTime)
    harmonicGain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.01)
    harmonicGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)

    // 包络：快速起振、较长衰减，模拟小铃铛
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)

    osc.connect(gain)
    harmonic.connect(harmonicGain)
    harmonicGain.connect(ctx.destination)
    gain.connect(ctx.destination)

    osc.start()
    harmonic.start()
    osc.stop(ctx.currentTime + 0.42)
    harmonic.stop(ctx.currentTime + 0.42)

    // 播放结束后关闭上下文，避免资源泄漏
    setTimeout(() => ctx.close(), 500)
  } catch {
    // 浏览器限制或 AudioContext 不可用时静默失败
  }
}
