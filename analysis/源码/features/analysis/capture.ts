/**
 * 真实音频指标采集（零侵入）
 *
 * 上游 player-core 已经对 <audio> 调用了 createMediaElementSource，
 * 浏览器不允许对同一元素再建一个 MediaElementSource。
 * 这里改用 HTMLMediaElement.captureStream()：把正在播放的音频"抓"成一条
 * MediaStream，再用 createMediaStreamSource 接我们自己的 AnalyserNode。
 *
 * 于是我们拿到了原始时域/频域数据，可以自己算：
 *   - 真实 RMS → dBFS、峰值、动态范围 DR（P95−P10）
 *   - 线性 FFT → chroma → 调性（Krumhansl 模板相关）
 *
 * 不支持 captureStream 的浏览器（如 Firefox）会自动降级：
 * readMetrics() 返回 null，界面回退到上游 bands 的近似值。
 */

export type AudioMetrics = {
  /** 瞬时响度，dBFS（-100 表示静音） */
  dbfs: number
  /** 峰值（线性 0..1） */
  peak: number
  /** 动态范围：近 30 秒短时 RMS 的 P95 − P10（dB） */
  dr: number
  /** 低频能量 0..1（40–200Hz，用于节拍包络） */
  low: number
  /** 是否可用（captureStream 成功） */
  ready: boolean
}

const QUIET: AudioMetrics = { dbfs: -100, peak: 0, dr: 0, low: 0, ready: false }

const DR_WINDOW_MS = 30_000
const PITCH_CLASSES = 12

type MetricsSource = {
  read(now: number): AudioMetrics
}

class CaptureMetrics implements MetricsSource {
  private audio: HTMLAudioElement | null = null
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private timeData: Float32Array<ArrayBuffer> | null = null
  private freqData: Uint8Array<ArrayBuffer> | null = null
  private failed = false
  private rmsHistory: { t: number; v: number }[] = []
  private metrics: AudioMetrics = { ...QUIET }

  register(audio: HTMLAudioElement) {
    if (this.audio === audio) return
    this.audio = audio
    audio.addEventListener('playing', () => this.ensureGraph(), { passive: true })
    audio.addEventListener('loadedmetadata', () => this.ensureGraph(), { passive: true })
  }

  private ensureGraph() {
    if (this.context || this.failed || !this.audio) return
    try {
      const media = this.audio as HTMLAudioElement & { captureStream?: () => MediaStream }
      if (typeof media.captureStream !== 'function') {
        console.log('[omc-cap] captureStream 不存在')
        this.failed = true
        return
      }
      const stream = media.captureStream()
      console.log('[omc-cap] stream tracks:', stream ? stream.getTracks().map((t) => t.kind).join(',') : 'null')
      if (!stream || !stream.getAudioTracks().length) {
        console.log('[omc-cap] 没有音频轨道，回退')
        this.failed = true
        return
      }
      const Ctor = window.AudioContext
      this.context = new Ctor()
      this.source = this.context.createMediaStreamSource(stream)
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = 2048
      this.analyser.smoothingTimeConstant = 0
      this.source.connect(this.analyser)
      // 必须有通往 destination 的下行路径，分析节点才会被持续驱动；
      // 用 0 增益汇点，避免把抓到的声音再放一遍造成回声。
      const sink = this.context.createGain()
      sink.gain.value = 0
      this.analyser.connect(sink)
      sink.connect(this.context.destination)
      this.timeData = new Float32Array(this.analyser.fftSize)
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount)
      console.log('[omc-cap] 链路建立成功, state=', this.context.state)
    } catch (error) {
      console.log('[omc-cap] 建立失败:', String(error))
      this.failed = true
      this.context = null
      this.analyser = null
    }
  }

  /** 绝对 dB 频谱：40Hz–10kHz 对数分带，按 -85..-5 dB 映射到 0..255
   *  与上游按帧归一化的 bands.spectrum 不同，这里保留真实的强弱层次。 */
  readSpectrumRows(rows: number): Uint8Array<ArrayBuffer> | null {
    const analyser = this.analyser
    const freq = this.freqData
    const context = this.context
    if (!analyser || !freq || !context) return null
    analyser.getByteFrequencyData(freq)

    if (!this.rowsBuffer || this.rowsBuffer.length !== rows) {
      this.rowsBuffer = new Uint8Array(rows)
    }
    const out = this.rowsBuffer
    const nyquist = context.sampleRate / 2
    const binCount = freq.length
    const MIN_DB = -85
    const MAX_DB = -5

    for (let row = 0; row < rows; row += 1) {
      const fromHz = 40 * Math.pow(10000 / 40, row / rows)
      const toHz = 40 * Math.pow(10000 / 40, (row + 1) / rows)
      const fromBin = Math.max(1, Math.floor((fromHz / nyquist) * binCount))
      const toBin = Math.min(binCount, Math.max(fromBin + 1, Math.ceil((toHz / nyquist) * binCount)))
      let maxByte = 0
      for (let bin = fromBin; bin < toBin; bin += 1) {
        if (freq[bin] > maxByte) maxByte = freq[bin]
      }
      // Chromium: byte 0 ↔ minDecibels(-100dB)，255 ↔ maxDecibels(-30dB)
      const db = -100 + (maxByte / 255) * 70
      const normalized = (db - MIN_DB) / (MAX_DB - MIN_DB)
      out[row] = Math.round(Math.max(0, Math.min(1, normalized)) * 255)
    }
    return out
  }

  private rowsBuffer: Uint8Array<ArrayBuffer> | null = null

  get ready(): boolean {
    return Boolean(this.analyser && this.context)
  }

  read(now: number): AudioMetrics {
    const analyser = this.analyser
    if (!analyser || !this.timeData || !this.freqData || !this.context) {
      return { ...QUIET, ready: false }
    }
    if (this.context.state === 'suspended') void this.context.resume()

    analyser.getFloatTimeDomainData(this.timeData)
    let sumSq = 0
    let peak = 0
    for (let i = 0; i < this.timeData.length; i += 1) {
      const v = this.timeData[i]
      sumSq += v * v
      const abs = v < 0 ? -v : v
      if (abs > peak) peak = abs
    }
    const rms = Math.sqrt(sumSq / this.timeData.length)
    const dbfs = rms > 1e-6 ? 20 * Math.log10(rms) : -100
    if (!(this as unknown as { logged?: boolean }).logged && rms > 0) {
      ;(this as unknown as { logged?: boolean }).logged = true
      console.log('[omc-cap] 首个有效样本 rms=', rms.toFixed(4), 'peak=', peak.toFixed(4), 'dbfs=', dbfs.toFixed(1))
    }

    // 动态范围：近 30 秒的短时 RMS 分位数差
    const last = this.rmsHistory.at(-1)
    if (!last || now - last.t > 100) {
      this.rmsHistory.push({ t: now, v: dbfs })
      const cutoff = now - DR_WINDOW_MS
      while (this.rmsHistory.length && this.rmsHistory[0].t < cutoff) this.rmsHistory.shift()
    }
    let dr = 0
    if (this.rmsHistory.length > 20) {
      // 低于 -60dB 视为静音/底噪，不参与动态范围计算，否则静音段会把 DR 拉爆
      const values = this.rmsHistory.map((p) => p.v).filter((v) => v > -60).sort((a, b) => a - b)
      if (values.length > 10) {
        const p10 = values[Math.floor(values.length * 0.1)]
        const p95 = values[Math.floor(values.length * 0.95)]
        dr = Math.min(30, Math.max(0, p95 - p10))
      }
    }


    // 低频能量：40–200Hz 的平均幅度，作为节拍包络
    analyser.getByteFrequencyData(this.freqData)
    const binHz = this.context.sampleRate / analyser.fftSize
    const lowEnd = Math.max(1, Math.floor(200 / binHz))
    let lowSum = 0
    for (let i = 1; i <= lowEnd; i += 1) lowSum += this.freqData[i]
    const low = Math.min(1, lowSum / Math.max(1, lowEnd) / 255)

    this.metrics = {
      dbfs,
      peak,
      dr,
      low,
      ready: true,
    }
    return this.metrics
  }


}

const capture = new CaptureMetrics()

/** 播放器创建 <audio> 后调用一次（player-core 里一行） */
export function registerAudioElement(audio: HTMLAudioElement) {
  capture.register(audio)
}

export function getAudioElement(): HTMLAudioElement | null {
  return (capture as unknown as { audio: HTMLAudioElement | null }).audio
}

export function readSpectrumRows(rows: number): Uint8Array<ArrayBuffer> | null {
  return capture.readSpectrumRows(rows)
}

export function readAudioMetrics(now: number): AudioMetrics {
  return capture.read(now)
}

export function captureSupported(): boolean {
  return capture.ready
}
