import type { MusicBands } from '../../rhine/archive-play-motion'

/** 上游 player-core 已经为 <audio> 建立了唯一的 AudioContext 与 AnalyserNode。
 *  浏览器不允许对同一个媒体元素创建两个 MediaElementSource，
 *  所以这里只做"登记 + 取数"，不再自建音频链路。 */
export type MeterBands = MusicBands & { rms?: number; peak?: number }
export type AudioBandsSource = { read(now: number): MeterBands }

let source: AudioBandsSource | null = null

export function registerAudioBands(next: AudioBandsSource) {
  source = next
}

export function readAudioBands(now: number): MeterBands | null {
  if (!source) return null
  try {
    return source.read(now)
  } catch {
    return null
  }
}
