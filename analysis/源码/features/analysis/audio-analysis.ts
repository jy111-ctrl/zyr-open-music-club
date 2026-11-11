/**
 * 实时声纹数据源（复用上游 player-core 的 AnalyserNode）
 *
 * 上游已经在 player-core 里为播放器 <audio> 建立了唯一的 AudioContext 与
 * AnalyserNode，并通过 readAudioBands() 暴露归一化后的频段数据。
 * 浏览器不允许对同一媒体元素创建第二个 MediaElementSource，
 * 所以这里不再自建音频链路，只做"取数 → 整形 → 订阅"。
 */
import { readAudioBands } from './bands.ts'
import { readAudioMetrics, readSpectrumRows } from './capture.ts'

export type AnalysisFrame = {
  /** 32 根频谱柱，0..255（供播放器条使用） */
  bars: Uint8Array<ArrayBuffer>
  /** 128 行频段能量，0..255（供瀑布图使用） */
  spectrum: Uint8Array<ArrayBuffer>
  /** 响度代理值 0..1 */
  rms: number
  /** 峰值代理值 0..1 */
  peak: number
  /** 真实响度 dBFS（captureStream 不可用时为近似值） */
  dbfs: number
  /** 动态范围 dB */
  dr: number
  /** 实时 BPM 估计 */
  bpm: number | null
  /** 是否正在出声 */
  active: boolean
}

type Listener = (frame: AnalysisFrame) => void

const BAR_COUNT = 32
const SPECTRUM_ROWS = 128
const BPM_WINDOW_MS = 6000
const BPM_MIN = 60
const BPM_MAX = 180

class LiveAnalysis {
  private listeners = new Set<Listener>()
  private readonly bars: Uint8Array<ArrayBuffer> = new Uint8Array(BAR_COUNT)
  private readonly spectrum: Uint8Array<ArrayBuffer> = new Uint8Array(SPECTRUM_ROWS)
  private envelope: { t: number; v: number }[] = []
  private lastSampleAt = 0
  private bpm: number | null = null
  private bpmHistory: number[] = []
  private smoothedDb = -100
  private drHistory: { t: number; v: number }[] = []
  private frame: AnalysisFrame = {
    bars: this.bars,
    spectrum: this.spectrum,
    rms: 0,
    peak: 0,
    dbfs: -100,
    dr: 0,
    bpm: null,
    active: false,
  }

  constructor() {
    const tick = () => {
      requestAnimationFrame(tick)
      this.sample()
    }
    requestAnimationFrame(tick)
  }

  private sample() {
    const now = performance.now()
    // 约 30fps 取数即可，避免和场景 RAF 抢资源
    if (now - this.lastSampleAt < 32) return
    this.lastSampleAt = now

    const bands = readAudioBands(now)
    if (!bands) {
      if (this.frame.active) {
        this.frame = { bars: this.bars, spectrum: this.spectrum, rms: 0, peak: 0, dbfs: -100, dr: 0, bpm: this.bpm, active: false }
        this.emit()
      }
      return
    }

    // 频谱：优先 capture 的绝对 dB；若整列全零（跨域音源抓不到）则回退上游 spectrum
    const absolute = readSpectrumRows(SPECTRUM_ROWS)
    let usedAbsolute = false
    if (absolute) {
      for (let i = 0; i < absolute.length; i += 1) {
        if (absolute[i] > 0) { usedAbsolute = true; break }
      }
      if (usedAbsolute) this.spectrum.set(absolute)
    }
    if (!usedAbsolute) {
      const source = bands.spectrum
      if (source && source.length) {
        for (let i = 0; i < SPECTRUM_ROWS; i += 1) {
          const from = Math.floor((i / SPECTRUM_ROWS) * source.length)
          const to = Math.max(from + 1, Math.floor(((i + 1) / SPECTRUM_ROWS) * source.length))
          let max = 0
          for (let j = from; j < to; j += 1) {
            const v = source[j]
            if (v > max) max = v
          }
          this.spectrum[i] = Math.round(Math.min(1, Math.max(0, max)) * 255)
        }
      }
    }
    for (let i = 0; i < BAR_COUNT; i += 1) {
      const from = Math.floor((i / BAR_COUNT) * SPECTRUM_ROWS)
      const to = Math.max(from + 1, Math.floor(((i + 1) / BAR_COUNT) * SPECTRUM_ROWS))
      let max = 0
      for (let j = from; j < to; j += 1) {
        if (this.spectrum[j] > max) max = this.spectrum[j]
      }
      this.bars[i] = max
    }

    const metricsEarly = readAudioMetrics(now)
    if (now - (this.envelope.at(-1)?.t ?? 0) > 40) {
      this.envelope.push({ t: now, v: metricsEarly.ready ? metricsEarly.low : (bands.low || 0) })
      const cutoff = now - BPM_WINDOW_MS
      while (this.envelope.length && this.envelope[0].t < cutoff) this.envelope.shift()
    }
    const estimated = this.estimateBpm()
    if (typeof estimated === 'number') {
      // 平滑：最近 7 次估计取中位数，避免数字来回跳
      this.bpmHistory.push(estimated)
      if (this.bpmHistory.length > 7) this.bpmHistory.shift()
      const sorted = [...this.bpmHistory].sort((a, b) => a - b)
      this.bpm = sorted[Math.floor(sorted.length / 2)]
    }

    // 响度/峰值：优先上游 AnalyserNode 的时域采样（跨域音源同样有效）
    const bandsRms = typeof bands.rms === 'number' ? bands.rms : null
    const bandsPeak = typeof bands.peak === 'number' ? bands.peak : null
    const metrics = readAudioMetrics(now)
    const rmsValue = bandsRms !== null ? bandsRms : (metrics.ready ? Math.pow(10, metrics.dbfs / 20) : 0)
    const rawDb = rmsValue > 1e-6 ? 20 * Math.log10(rmsValue) : -100
    const peakValue = bandsPeak !== null ? bandsPeak : (metrics.ready ? metrics.peak : 0)
    this.smoothedDb = rawDb <= -90 ? rawDb : this.smoothedDb * 0.75 + rawDb * 0.25

    // 动态范围：近 30 秒短时响度的 P95 - P10
    if (now - (this.drHistory.at(-1)?.t ?? 0) > 100) {
      this.drHistory.push({ t: now, v: rawDb })
      const cutoff = now - 30000
      while (this.drHistory.length && this.drHistory[0].t < cutoff) this.drHistory.shift()
    }
    let dr = 0
    if (this.drHistory.length > 10) {
      const values = this.drHistory.map((p) => p.v).filter((v) => v > -60).sort((a, b) => a - b)
      if (values.length > 10) {
        const p10 = values[Math.floor(values.length * 0.1)]
        const p95 = values[Math.floor(values.length * 0.95)]
        dr = Math.min(30, Math.max(0, p95 - p10))
      }
    }

    const activity = Math.min(1, Math.max(0, bands.activity || 0))
    const active = peakValue > 0.005 || activity > 0.01

    this.frame = {
      bars: this.bars,
      spectrum: this.spectrum,
      rms: rmsValue,
      peak: peakValue,
      dbfs: this.smoothedDb,
      dr,
      bpm: this.bpm,
      active,
    }
    this.emit()
  }

  private estimateBpm(): number | null {
    const env = this.envelope
    if (env.length < 40) return this.bpm
    const values = env.map((p) => p.v)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const centered = values.map((v) => v - mean)

    const peaks: number[] = []
    for (let i = 1; i < centered.length - 1; i += 1) {
      if (centered[i] > 0 && centered[i] >= centered[i - 1] && centered[i] > centered[i + 1]) peaks.push(env[i].t)
    }
    if (peaks.length < 3) return this.bpm

    const intervals: number[] = []
    for (let i = 1; i < peaks.length; i += 1) {
      const dt = peaks[i] - peaks[i - 1]
      if (dt > 200 && dt < 2000) intervals.push(dt)
    }
    if (!intervals.length) return this.bpm

    intervals.sort((a, b) => a - b)
    const median = intervals[Math.floor(intervals.length / 2)]
    let bpm = 60000 / median
    while (bpm < BPM_MIN) bpm *= 2
    while (bpm > BPM_MAX) bpm /= 2
    if (!Number.isFinite(bpm)) return this.bpm
    return Math.round(bpm)
  }

  private emit() {
    this.frame.bars = this.bars
    this.frame.spectrum = this.spectrum
    this.listeners.forEach((listener) => listener(this.frame))
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.frame)
    return () => this.listeners.delete(listener)
  }

  get current(): AnalysisFrame {
    return this.frame
  }
}

export const analysis = new LiveAnalysis()
