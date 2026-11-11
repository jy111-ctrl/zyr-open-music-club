/**
 * 音频指纹（迷你 Shazam）
 *
 * 流程：解码 → 重采样到 11.025kHz → STFT → 提取二维局部峰值（常数图）
 *      → 峰值两两配对生成 (f1, f2, Δt) 哈希 → 查询时按时间偏移投票。
 */
import { fft } from './fft.ts'

export const SAMPLE_RATE = 11025
const FFT_SIZE = 1024
const HOP = 256
const MIN_HZ = 100
const MAX_HZ = 4000
const PEAK_FLOOR_DB = -52
const PEAK_REL_DB = 22
const NEIGHBOR_FRAMES = 4
const NEIGHBOR_BINS = 8
const FAN_OUT = 5
const FREQ_QUANT = 2 // 频率量化步长，吸收细微频移
const MAX_PAIR_FRAMES = 43 // ≈1s
const MIN_PAIR_FRAMES = 4 // 避免密集段产生过短的 Δt

export type Peak = { t: number; f: number; mag: number }
export type HashPair = { h: number; t: number }

export type MatchResult = {
  songId: string
  votes: number
  offsetFrames: number
  confidence: number
}

/** 把任意采样率的单声道音频线性重采样到 11.025kHz */
export function resampleLinear(input: Float32Array, from: number, to = SAMPLE_RATE): Float32Array {
  if (from === to) return input
  const ratio = from / to
  const length = Math.floor(input.length / ratio)
  const out = new Float32Array(length)
  for (let i = 0; i < length; i += 1) {
    const pos = i * ratio
    const left = Math.floor(pos)
    const frac = pos - left
    const a = input[left] ?? 0
    const b = input[left + 1] ?? a
    out[i] = a + (b - a) * frac
  }
  return out
}

/** 解码音频文件为单声道、11.025kHz */
export async function decodeToMono(buffer: ArrayBuffer): Promise<Float32Array> {
  const ctx = new AudioContext()
  try {
    const decoded = await ctx.decodeAudioData(buffer.slice(0))
    const frames = decoded.length
    const mono = new Float32Array(frames)
    for (let c = 0; c < decoded.numberOfChannels; c += 1) {
      const data = decoded.getChannelData(c)
      for (let i = 0; i < frames; i += 1) mono[i] += data[i]
    }
    if (decoded.numberOfChannels > 1) for (let i = 0; i < frames; i += 1) mono[i] /= decoded.numberOfChannels
    return resampleLinear(mono, decoded.sampleRate)
  } finally {
    void ctx.close().catch(() => undefined)
  }
}

/** 计算 dB 幅度谱图（frames × bins） */
function spectrogram(mono: Float32Array): { data: Float32Array; frames: number; bins: number } {
  const bins = FFT_SIZE / 2
  const frames = Math.max(1, Math.floor((mono.length - FFT_SIZE) / HOP) + 1)
  const data = new Float32Array(frames * bins)
  const win = new Float32Array(FFT_SIZE)
  for (let i = 0; i < FFT_SIZE; i += 1) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1))
  const re = new Float32Array(FFT_SIZE)
  const im = new Float32Array(FFT_SIZE)
  for (let f = 0; f < frames; f += 1) {
    const offset = f * HOP
    for (let i = 0; i < FFT_SIZE; i += 1) {
      re[i] = (mono[offset + i] ?? 0) * win[i]
      im[i] = 0
    }
    fft(re, im)
    for (let b = 0; b < bins; b += 1) {
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]) + 1e-9
      data[f * bins + b] = 20 * Math.log10(mag)
    }
  }
  return { data, frames, bins }
}

/** 提取二维局部峰值（常数图），并按密度上限筛选 */
export function findPeaks(mono: Float32Array): Peak[] {
  const { data, frames, bins } = spectrogram(mono)
  const binHz = SAMPLE_RATE / FFT_SIZE
  const fromBin = Math.max(1, Math.round(MIN_HZ / binHz))
  const toBin = Math.min(bins - 1, Math.round(MAX_HZ / binHz))

  const candidates: Peak[] = []
  for (let f = 0; f < frames; f += 1) {
    let frameMax = -Infinity
    for (let b = fromBin; b < toBin; b += 1) frameMax = Math.max(frameMax, data[f * bins + b])
    const threshold = Math.max(PEAK_FLOOR_DB, frameMax - PEAK_REL_DB)
    for (let b = fromBin; b < toBin; b += 1) {
      const v = data[f * bins + b]
      if (v < threshold) continue
      if (v <= data[f * bins + b - 1] || v < data[f * bins + b + 1]) continue
      candidates.push({ t: f, f: b, mag: v })
    }
  }
  // 按幅度降序做邻域抑制，得到稀疏常数图
  candidates.sort((a, b) => b.mag - a.mag)
  const kept: Peak[] = []
  for (const peak of candidates) {
    let ok = true
    for (let i = kept.length - 1; i >= 0 && i >= kept.length - 400; i -= 1) {
      const other = kept[i]
      if (Math.abs(other.t - peak.t) <= NEIGHBOR_FRAMES && Math.abs(other.f - peak.f) <= NEIGHBOR_BINS) { ok = false; break }
    }
    if (ok) kept.push(peak)
    if (kept.length > 6000) break
  }
  // 每秒峰值上限，避免密集段把哈希表撑爆
  const framesPerSecond = SAMPLE_RATE / HOP
  const perSecond = new Map<number, number>()
  const limited: Peak[] = []
  // 按强度优先，保证建库与查询在同一段音频上保留同一批峰
  const byStrength = [...kept].sort((a, b) => b.mag - a.mag)
  for (const peak of byStrength) {
    const second = Math.floor(peak.t / framesPerSecond)
    const count = perSecond.get(second) ?? 0
    if (count >= 30) continue
    perSecond.set(second, count + 1)
    limited.push(peak)
  }
  limited.sort((a, b) => a.t - b.t)
  return limited
}

/** 峰值两两配对生成哈希 */
export function hashPeaks(peaks: Peak[]): HashPair[] {
  const hashes: HashPair[] = []
  for (let i = 0; i < peaks.length; i += 1) {
    const a = peaks[i]
    let paired = 0
    for (let j = i + 1; j < peaks.length && paired < FAN_OUT; j += 1) {
      const b = peaks[j]
      const dt = b.t - a.t
      if (dt <= 0) continue
      if (dt > MAX_PAIR_FRAMES) break
      if (dt < MIN_PAIR_FRAMES) continue
      const dtq = (dt / 2) | 0 // 量化到 2 帧，吸收 ±1 帧抖动
      const h = (((a.f / FREQ_QUANT) | 0) << 20) | ((((b.f / FREQ_QUANT) | 0)) << 9) | dtq
      hashes.push({ h, t: a.t })
      paired += 1
    }
  }
  return hashes
}

export function fingerprintMono(mono: Float32Array): HashPair[] {
  return hashPeaks(findPeaks(mono))
}

/** 带中间结果的版本，便于界面展示峰值与哈希统计 */
export function fingerprintMonoDetailed(mono: Float32Array): { peaks: Peak[]; hashes: HashPair[] } {
  const peaks = findPeaks(mono)
  return { peaks, hashes: hashPeaks(peaks) }
}

/** 索引：哈希 → [{songId, t}] */
export type Index = Map<number, { songId: string; t: number }[]>

export function buildIndex(songs: { id: string; hashes: HashPair[] }[]): Index {
  const index: Index = new Map()
  for (const song of songs) {
    for (const { h, t } of song.hashes) {
      let list = index.get(h)
      if (!list) { list = []; index.set(h, list) }
      list.push({ songId: song.id, t })
    }
  }
  return index
}

export type DetailedMatch = {
  best: MatchResult | null
  /** 得票最高的前 5 个 (歌曲, 偏移) 候选 */
  candidates: { songId: string; votes: number; offsetFrames: number; offsetSec: number }[]
  /** 查询哈希总数 */
  queryHashes: number
  /** 命中索引的查询哈希数（不论偏移） */
  queryHits: number
  /** 参与投票的偏移分布（按偏移秒数取整分箱） */
  distribution: { offsetSec: number; votes: number }[]
}

/** 带解释信息的匹配：返回候选、命中率与投票分布 */
export function matchDetailed(query: HashPair[], index: Index): DetailedMatch {
  const votes = new Map<string, number>()
  let queryHits = 0
  for (const { h, t } of query) {
    const hits = index.get(h)
    if (!hits || !hits.length) continue
    queryHits += 1
    for (const hit of hits) {
      const key = `${hit.songId}|${hit.t - t}`
      votes.set(key, (votes.get(key) ?? 0) + 1)
    }
  }
  const candidates: DetailedMatch['candidates'] = []
  const byOffset = new Map<number, number>()
  for (const [key, count] of votes) {
    const [songId, offsetText] = key.split('|')
    const offsetFrames = Number(offsetText)
    candidates.push({ songId, votes: count, offsetFrames, offsetSec: (offsetFrames * 256) / SAMPLE_RATE })
    const bucket = Math.round(((offsetFrames * 256) / SAMPLE_RATE) * 2) / 2
    byOffset.set(bucket, (byOffset.get(bucket) ?? 0) + count)
  }
  candidates.sort((a, b) => b.votes - a.votes)
  const top = candidates.slice(0, 5)
  const best = top.length
    ? (() => {
        const t = top[0]
        return { songId: t.songId, votes: t.votes, offsetFrames: t.offsetFrames, confidence: Math.min(1, t.votes / Math.sqrt(Math.max(1, query.length)) / 6) }
      })()
    : null
  const distribution = [...byOffset.entries()]
    .map(([offsetSec, v]) => ({ offsetSec, votes: v }))
    .sort((a, b) => a.offsetSec - b.offsetSec)
  return { best, candidates: top, queryHashes: query.length, queryHits, distribution }
}

/** 查询：按 (songId, 时间偏移) 投票 */
export function match(query: HashPair[], index: Index): MatchResult | null {
  if (!query.length) return null
  const votes = new Map<string, number>()
  for (const { h, t } of query) {
    const hits = index.get(h)
    if (!hits) continue
    for (const hit of hits) {
      const offset = hit.t - t
      const key = `${hit.songId}|${offset}`
      votes.set(key, (votes.get(key) ?? 0) + 1)
    }
  }
  let best: MatchResult | null = null
  for (const [key, count] of votes) {
    const [songId, offsetText] = key.split('|')
    if (!best || count > best.votes) {
      const score = count / Math.sqrt(query.length)
      best = { songId, votes: count, offsetFrames: Number(offsetText), confidence: Math.min(1, score / 6) }
    }
  }
  return best
}

/** 供界面展示的参数快照 */
export const PARAMS = {
  sampleRate: SAMPLE_RATE,
  fftSize: FFT_SIZE,
  hop: HOP,
  minHz: MIN_HZ,
  maxHz: MAX_HZ,
  peakFloorDb: PEAK_FLOOR_DB,
  peakRelDb: PEAK_REL_DB,
  neighborFrames: NEIGHBOR_FRAMES,
  neighborBins: NEIGHBOR_BINS,
  fanOut: FAN_OUT,
  maxPairFrames: MAX_PAIR_FRAMES,
  minPairFrames: MIN_PAIR_FRAMES,
  freqQuant: FREQ_QUANT,
  maxPeaksPerSecond: 30,
}

/** 计算 chroma 序列（约 5.38 帧/秒，12 维/帧），供旋律通道使用 */
export function chromaFrames(mono: Float32Array): { data: number[]; fps: number } {
  const N = 2048
  const HOP = 512
  const frames = Math.max(1, Math.floor((mono.length - N) / HOP) + 1)
  const raw = new Float32Array(frames * 12)
  const win = new Float32Array(N)
  for (let i = 0; i < N; i += 1) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))
  const re = new Float32Array(N)
  const im = new Float32Array(N)
  const binHz = SAMPLE_RATE / N
  const lo = Math.round(65 / binHz)
  const hi = Math.round(2000 / binHz)
  for (let f = 0; f < frames; f += 1) {
    const off = f * HOP
    for (let i = 0; i < N; i += 1) { re[i] = (mono[off + i] ?? 0) * win[i]; im[i] = 0 }
    fft(re, im)
    const acc = new Float64Array(12)
    for (let b = lo; b < hi; b += 1) {
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b])
      if (mag <= 0) continue
      const pc = ((Math.round(12 * Math.log2((b * binHz) / 440)) + 9) % 12 + 12) % 12
      acc[pc] += mag * mag
    }
    let sum = 0
    for (let p = 0; p < 12; p += 1) { acc[p] = Math.sqrt(acc[p]); sum += acc[p] }
    for (let p = 0; p < 12; p += 1) raw[f * 12 + p] = sum > 0 ? acc[p] / sum : 0
  }
  const out: number[] = []
  for (let f = 0; f + 4 <= frames; f += 4) {
    const v = new Array<number>(12).fill(0)
    for (let k = 0; k < 4; k += 1) for (let p = 0; p < 12; p += 1) v[p] += raw[(f + k) * 12 + p]
    let n = 0
    for (let p = 0; p < 12; p += 1) n += v[p] * v[p]
    n = Math.sqrt(n) || 1
    for (let p = 0; p < 12; p += 1) out.push(Number((v[p] / n).toFixed(4)))
  }
  return { data: out, fps: SAMPLE_RATE / HOP / 4 }
}
