/**
 * 整曲声纹档案（离线分析）
 *
 * 取当前播放音轨的 URL → fetch → decodeAudioData → 一次性算出：
 *   · 波形包络（min/max 抽稀）
 *   · 整曲频谱热力图（对数频段）
 *   · 整体指标（dBFS / 峰值 / 动态范围 / 调性）
 *   · 分段 BPM（每 15 秒一段，看歌曲走向）
 *
 * 为控制内存与耗时，默认只分析前 120 秒（可在调用处覆盖）。
 * 全部在主线程分片执行，每片让出一次事件循环，避免界面卡死。
 */
import { getAudioElement } from './capture.ts'

export type AudioProfile = {
  url: string
  durationSec: number
  analyzedSec: number
  sampleRate: number
  channels: number
  /** 波形包络：长度为 buckets*2，偶数索引为 min、奇数索引为 max（-1..1） */
  peaks: Float32Array
  /** 对数频谱图：cols × rows，值 0..255 */
  spectrogram: { cols: number; rows: number; data: Uint8Array<ArrayBuffer> }
  /** Mel 频谱图（64 个 Mel 滤波器）：cols × rows，值 0..255 */
  mel: { cols: number; rows: number; data: Uint8Array<ArrayBuffer> }
  /** MFCC：每帧 13 维，frames 为 cols × 13 的量化值（0..255），mean 为均值 */
  mfcc: { cols: number; rows: number; frames: Uint8Array<ArrayBuffer>; mean: number[] }
  dbfs: number
  peak: number
  dr: number
  bpm: number | null
  /** 每段 BPM（15 秒一段），用于"歌曲走向" */
  segmentBpm: (number | null)[]
}

const MAX_ANALYZED_SEC = 120
const WAVE_BUCKETS = 900
const SPECTRO_COLS = 240
const SPECTRO_ROWS = 64
const FFT_SIZE = 1024
const MIN_HZ = 40
const MAX_HZ = 10000
const SEGMENT_SEC = 15
const MEL_BANDS = 64
const MFCC_COEFFS = 13
const MEL_FMIN = 20

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

// ---------- 简易 radix-2 FFT ----------
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len
    const wRe = Math.cos(angle)
    const wIm = Math.sin(angle)
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < len / 2; k += 1) {
        const uRe = re[i + k]
        const uIm = im[i + k]
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe
        re[i + k] = uRe + vRe
        im[i + k] = uIm + vIm
        re[i + k + len / 2] = uRe - vRe
        im[i + k + len / 2] = uIm - vIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}

function toMono(buffer: AudioBuffer, limitSec: number): Float32Array {
  const frames = Math.min(buffer.length, Math.floor(buffer.sampleRate * limitSec))
  const channels = buffer.numberOfChannels
  const mono = new Float32Array(frames)
  for (let c = 0; c < channels; c += 1) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < frames; i += 1) mono[i] += data[i]
  }
  if (channels > 1) for (let i = 0; i < frames; i += 1) mono[i] /= channels
  return mono
}

function buildPeaks(mono: Float32Array): Float32Array {
  const peaks = new Float32Array(WAVE_BUCKETS * 2)
  const step = mono.length / WAVE_BUCKETS
  for (let b = 0; b < WAVE_BUCKETS; b += 1) {
    const from = Math.floor(b * step)
    const to = Math.min(mono.length, Math.floor((b + 1) * step))
    let min = 0
    let max = 0
    for (let i = from; i < to; i += 1) {
      const v = mono[i]
      if (v < min) min = v
      if (v > max) max = v
    }
    peaks[b * 2] = min
    peaks[b * 2 + 1] = max
  }
  return peaks
}

function bandEdges(sampleRate: number): number[] {
  const edges: number[] = []
  for (let r = 0; r <= SPECTRO_ROWS; r += 1) {
    const hz = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, r / SPECTRO_ROWS)
    edges.push(Math.max(1, Math.round((hz / (sampleRate / 2)) * (FFT_SIZE / 2))))
  }
  return edges
}

function hzToMel(hz: number) {
  return 2595 * Math.log10(1 + hz / 700)
}

function melToHz(mel: number) {
  return 700 * (Math.pow(10, mel / 2595) - 1)
}

/** 三角 Mel 滤波器组：按面积归一化，避免高频滤波器（更宽）占优 */
function buildMelFilters(sampleRate: number, bands: number): Float32Array[] {
  const nyquist = sampleRate / 2
  const fmax = Math.min(8000, nyquist)
  const melMin = hzToMel(MEL_FMIN)
  const melMax = hzToMel(fmax)
  const bins = FFT_SIZE / 2
  const filters: Float32Array[] = []
  const hzPoints: number[] = []
  for (let i = 0; i < bands + 2; i += 1) {
    const mel = melMin + ((melMax - melMin) * i) / (bands + 1)
    hzPoints.push(melToHz(mel))
  }
  for (let b = 0; b < bands; b += 1) {
    const filter = new Float32Array(bins)
    const left = hzPoints[b]
    const center = hzPoints[b + 1]
    const right = hzPoints[b + 2]
    let area = 0
    for (let bin = 1; bin < bins; bin += 1) {
      const hz = (bin * sampleRate) / FFT_SIZE
      if (hz < left || hz > right) continue
      const weight = hz <= center
        ? (hz - left) / Math.max(1e-9, center - left)
        : (right - hz) / Math.max(1e-9, right - center)
      filter[bin] = weight
      area += weight
    }
    if (area > 0) for (let bin = 0; bin < bins; bin += 1) filter[bin] /= area
    filters.push(filter)
  }
  return filters
}

/** DCT-II，取前 count 个系数 */
function dct(input: Float32Array, count: number): Float32Array {
  const n = input.length
  const out = new Float32Array(count)
  for (let k = 0; k < count; k += 1) {
    let sum = 0
    for (let i = 0; i < n; i += 1) sum += input[i] * Math.cos((Math.PI * k * (2 * i + 1)) / (2 * n))
    out[k] = sum * (k === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n))
  }
  return out
}

async function buildSpectral(
  mono: Float32Array,
  sampleRate: number,
  onProgress?: (ratio: number) => void,
): Promise<{ spectrogram: AudioProfile['spectrogram']; mel: AudioProfile['mel']; mfcc: AudioProfile['mfcc'] }> {
  const cols = SPECTRO_COLS
  const rows = SPECTRO_ROWS
  const sums = new Float32Array(cols * rows)
  const edges = bandEdges(sampleRate)
  const window = new Float32Array(FFT_SIZE)
  for (let i = 0; i < FFT_SIZE; i += 1) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1))
  const hop = Math.max(1, Math.floor(Math.max(1, mono.length - FFT_SIZE) / cols))

  const melFilters = buildMelFilters(sampleRate, MEL_BANDS)
  const melRaw = new Float32Array(cols * MEL_BANDS)
  const mfccFrames = new Float32Array(cols * MFCC_COEFFS)
  let globalMax = 1e-9

  for (let col = 0; col < cols; col += 1) {
    const offset = col * hop
    const re = new Float32Array(FFT_SIZE)
    const im = new Float32Array(FFT_SIZE)
    for (let i = 0; i < FFT_SIZE; i += 1) re[i] = (mono[offset + i] || 0) * window[i]
    fft(re, im)

    const mags = new Float32Array(FFT_SIZE / 2)
    for (let bin = 1; bin < mags.length; bin += 1) mags[bin] = Math.sqrt(re[bin] * re[bin] + im[bin] * im[bin])

    // 对数频谱（展示用）
    for (let row = 0; row < rows; row += 1) {
      const from = edges[row]
      const to = Math.max(from + 1, edges[row + 1])
      let max = 0
      for (let bin = from; bin < to && bin < mags.length; bin += 1) {
        if (mags[bin] > max) max = mags[bin]
      }
      sums[row * cols + col] = max
      if (max > globalMax) globalMax = max
    }

    // Mel 能量 + MFCC
    const logMel = new Float32Array(MEL_BANDS)
    for (let band = 0; band < MEL_BANDS; band += 1) {
      const filter = melFilters[band]
      let energy = 0
      for (let bin = 1; bin < mags.length; bin += 1) energy += mags[bin] * mags[bin] * filter[bin]
      const logEnergy = 10 * Math.log10(energy + 1e-12)
      melRaw[band * cols + col] = logEnergy
      logMel[band] = Math.log(energy + 1e-12)
    }
    const coeffs = dct(logMel, MFCC_COEFFS)
    for (let k = 0; k < MFCC_COEFFS; k += 1) mfccFrames[k * cols + col] = coeffs[k]

    if (col % 24 === 0) {
      onProgress?.((col / cols) * 0.8)
      await yieldToUi()
    }
  }

  // 对数频谱归一化
  const data = new Uint8Array(cols * rows)
  for (let i = 0; i < sums.length; i += 1) {
    const normalized = Math.min(1, sums[i] / globalMax)
    data[i] = Math.round(Math.pow(normalized, 0.45) * 255)
  }

  // Mel 谱：以全局最大 dB 为参考，向下 80dB 映射到 0..255（人耳可感动态范围）
  let melMax = -Infinity
  for (let i = 0; i < melRaw.length; i += 1) if (melRaw[i] > melMax) melMax = melRaw[i]
  const melData = new Uint8Array(cols * MEL_BANDS)
  for (let i = 0; i < melRaw.length; i += 1) {
    const relative = melRaw[i] - melMax
    melData[i] = Math.round(Math.max(0, Math.min(1, (relative + 80) / 80)) * 255)
  }

  // MFCC：按系数做全局归一化（各系数尺度不同，逐行归一化更适合展示）
  const mfccData = new Uint8Array(cols * MFCC_COEFFS)
  const mean: number[] = new Array(MFCC_COEFFS).fill(0)
  for (let k = 0; k < MFCC_COEFFS; k += 1) {
    let min = Infinity
    let max = -Infinity
    let sum = 0
    for (let col = 0; col < cols; col += 1) {
      const v = mfccFrames[k * cols + col]
      if (v < min) min = v
      if (v > max) max = v
      sum += v
    }
    mean[k] = sum / cols
    const range = Math.max(1e-6, max - min)
    for (let col = 0; col < cols; col += 1) {
      const v = (mfccFrames[k * cols + col] - min) / range
      mfccData[k * cols + col] = Math.round(v * 255)
    }
  }

  return {
    spectrogram: { cols, rows, data },
    mel: { cols, rows: MEL_BANDS, data: melData },
    mfcc: { cols, rows: MFCC_COEFFS, frames: mfccData, mean },
  }
}

function estimateBpmFromEnvelope(values: number[], times: number[]): number | null {
  if (values.length < 30) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const centered = values.map((v) => v - mean)
  const peaks: number[] = []
  for (let i = 1; i < centered.length - 1; i += 1) {
    if (centered[i] > 0 && centered[i] >= centered[i - 1] && centered[i] > centered[i + 1]) peaks.push(times[i])
  }
  if (peaks.length < 3) return null
  const intervals: number[] = []
  for (let i = 1; i < peaks.length; i += 1) {
    const dt = peaks[i] - peaks[i - 1]
    if (dt > 200 && dt < 2000) intervals.push(dt)
  }
  if (!intervals.length) return null
  intervals.sort((a, b) => a - b)
  let bpm = 60000 / intervals[Math.floor(intervals.length / 2)]
  while (bpm < 60) bpm *= 2
  while (bpm > 180) bpm /= 2
  return Number.isFinite(bpm) ? Math.round(bpm) : null
}

export async function analyzeCurrentTrack(
  onProgress?: (ratio: number, label: string) => void,
  maxSeconds = MAX_ANALYZED_SEC,
): Promise<AudioProfile | null> {
  const audio = getAudioElement()
  const url = audio?.currentSrc || ''
  if (!url) return null

  onProgress?.(0.02, '读取音频数据…')
  const response = await fetch(url)
  if (!response.ok) throw new Error('音频下载失败')
  const raw = await response.arrayBuffer()

  onProgress?.(0.12, '解码音频…')
  const ctx = new AudioContext()
  const buffer = await ctx.decodeAudioData(raw.slice(0))
  const durationSec = buffer.duration
  const analyzedSec = Math.min(durationSec, maxSeconds)

  onProgress?.(0.25, '计算波形…')
  const mono = toMono(buffer, analyzedSec)
  const peaks = buildPeaks(mono)

  onProgress?.(0.35, '计算整曲频谱…')
  const spectral = await buildSpectral(mono, buffer.sampleRate, (r) => onProgress?.(0.35 + r * 0.55, '计算整曲频谱…'))

  onProgress?.(0.92, '统计指标…')
  // 整体响度 / 峰值 / 动态范围
  let sumSq = 0
  let peak = 0
  for (let i = 0; i < mono.length; i += 1) {
    const v = mono[i]
    sumSq += v * v
    const abs = v < 0 ? -v : v
    if (abs > peak) peak = abs
  }
  const rms = Math.sqrt(sumSq / mono.length)
  const dbfs = rms > 1e-6 ? 20 * Math.log10(rms) : -100

  const frameRms: number[] = []
  const win = Math.floor(buffer.sampleRate * 0.1)
  for (let i = 0; i + win < mono.length; i += win) {
    let s = 0
    for (let j = i; j < i + win; j += 1) s += mono[j] * mono[j]
    const r = Math.sqrt(s / win)
    frameRms.push(r > 1e-6 ? 20 * Math.log10(r) : -100)
  }
  const loud = frameRms.filter((v) => v > -60).sort((a, b) => a - b)
  const dr = loud.length > 10
    ? Math.min(30, Math.max(0, loud[Math.floor(loud.length * 0.95)] - loud[Math.floor(loud.length * 0.1)]))
    : 0

  // 低频包络（用于 BPM 与分段走向）
  const envelopeValues: number[] = []
  const envelopeTimes: number[] = []
  const lowWin = Math.floor(buffer.sampleRate * 0.02)
  for (let i = 0; i + lowWin < mono.length; i += lowWin) {
    let s = 0
    for (let j = i; j < i + lowWin; j += 1) s += mono[j] * mono[j]
    envelopeValues.push(Math.sqrt(s / lowWin))
    envelopeTimes.push((i / buffer.sampleRate) * 1000)
  }

  const segmentBpm: (number | null)[] = []
  const segMs = SEGMENT_SEC * 1000
  const totalMs = analyzedSec * 1000
  for (let start = 0; start < totalMs; start += segMs) {
    const values: number[] = []
    const times: number[] = []
    for (let i = 0; i < envelopeValues.length; i += 1) {
      if (envelopeTimes[i] >= start && envelopeTimes[i] < start + segMs) {
        values.push(envelopeValues[i])
        times.push(envelopeTimes[i])
      }
    }
    segmentBpm.push(estimateBpmFromEnvelope(values, times))
  }
  const validSegments = segmentBpm.filter((v): v is number => typeof v === 'number')
  const bpm = validSegments.length
    ? Math.round(validSegments.reduce((a, b) => a + b, 0) / validSegments.length)
    : estimateBpmFromEnvelope(envelopeValues, envelopeTimes)

  ctx.close()
  onProgress?.(1, '完成')

  return {
    url,
    durationSec,
    analyzedSec,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    peaks,
    spectrogram: spectral.spectrogram,
    mel: spectral.mel,
    mfcc: spectral.mfcc,
    dbfs,
    peak,
    dr,
    bpm,
    segmentBpm,
  }
}
