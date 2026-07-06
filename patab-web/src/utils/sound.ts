/**
 * sound —— Web Audio API 合成提示音
 * 不依赖外部音频文件，避免增加产物体积与网络请求。
 */

/** 合成一个短促的“叮”声 */
export function playDing() {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return
    const ctx = new AudioContextCtor()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(1200, ctx.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15)

    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15)

    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 0.16)

    // 播放结束后关闭上下文，避免资源泄漏
    setTimeout(() => ctx.close(), 200)
  } catch {
    // 浏览器限制或 AudioContext 不可用时静默失败
  }
}
