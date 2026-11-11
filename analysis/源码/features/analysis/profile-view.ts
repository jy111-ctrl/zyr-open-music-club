/**
 * 声纹档案视图：整曲波形 + 整曲频谱热力图 + 指标 + 分段 BPM + 导出 PNG
 *
 * 与实时声纹互不影响：实时用 AnalyserNode，档案走"下载 → decodeAudioData → 离线计算"。
 */
import { analyzeCurrentTrack, type AudioProfile } from './profile.ts'

const STYLE_ID = 'omc-profile-style'
const ROOT_SELECTOR = '.omc-profile'

const CSS = `
.omc-profile {
  position: fixed; inset: 0; z-index: 130;
  display: grid; place-items: center;
  background: rgba(23, 25, 21, .42);
  backdrop-filter: blur(3px);
}
.omc-profile[hidden] { display: none; }
.omc-profile__card {
  width: min(880px, 94vw); max-height: 92vh; overflow: auto;
  background: var(--color-surface-01, #f1efea);
  border: 1px solid var(--hairline, #b9b5ab);
  padding: 18px 22px 16px;
  display: grid; gap: 14px;
  box-shadow: 0 28px 70px rgba(23, 25, 21, .22);
}
.omc-profile__card header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.omc-profile__card h3 { margin: 0; font-size: 1.05rem; letter-spacing: -.01em; }
.omc-profile__card h3 em { font-style: normal; font-size: .58rem; letter-spacing: .16em; opacity: .5; margin-left: 6px; }
.omc-profile__card header p { margin: 4px 0 0; font-size: .58rem; letter-spacing: .1em; opacity: .6; }
.omc-profile__close { border: 0; background: transparent; color: inherit; font: inherit; font-size: 1rem; padding: 4px 6px; cursor: pointer; opacity: .55; }
.omc-profile__close:hover { opacity: 1; color: var(--color-accent-20, #a9783f); }
.omc-profile__status { margin: 0; font-size: .6rem; letter-spacing: .1em; opacity: .65; min-height: 1.2em; }
.omc-profile__wave { width: 100%; height: 96px; display: block; border: 1px solid var(--color-border-19, #ddd9cf); }
.omc-profile__switch { display: flex; gap: 8px; }
.omc-profile__switch button {
  padding: 6px 12px; border: 1px solid var(--hairline, #b9b5ab);
  background: transparent; color: inherit; font: inherit;
  font-size: .58rem; letter-spacing: .12em; cursor: pointer;
}
.omc-profile__switch button.is-active {
  border-color: var(--color-accent-20, #a9783f);
  color: var(--color-accent-20, #a9783f);
  background: rgba(169, 120, 63, .08);
}
.omc-profile__spec { width: 100%; height: 220px; display: block; border: 1px solid var(--color-border-19, #ddd9cf); }
.omc-profile__metrics { display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-end; }
.omc-profile__metric { display: grid; gap: 2px; }
.omc-profile__metric small { font-size: .52rem; letter-spacing: .16em; opacity: .62; }
.omc-profile__metric strong { font-size: 1.15rem; font-weight: 650; font-variant-numeric: tabular-nums; }
.omc-profile__metric strong em { font-style: normal; font-size: .56rem; margin-left: 3px; opacity: .6; }
.omc-profile__segs { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-end; }
.omc-profile__seg { display: grid; gap: 2px; justify-items: center; min-width: 44px; }
.omc-profile__seg i { display: block; width: 100%; background: var(--color-accent-20, #a9783f); opacity: .5; }
.omc-profile__seg b { font-size: .56rem; font-variant-numeric: tabular-nums; }
.omc-profile__seg small { font-size: .46rem; opacity: .5; }
.omc-profile__card footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: .56rem; letter-spacing: .06em; opacity: .62; }
.omc-profile__actions { display: flex; gap: 10px; }
.omc-profile__btn {
  padding: 7px 14px; border: 1px solid var(--hairline, #b9b5ab);
  background: transparent; color: inherit; font: inherit; font-size: .6rem; letter-spacing: .12em; cursor: pointer;
}
.omc-profile__btn:hover { border-color: var(--color-accent-20, #a9783f); color: var(--color-accent-20, #a9783f); }
.omc-profile__btn[disabled] { opacity: .4; cursor: default; }
`

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

function accent() {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-accent-20').trim() || '#a9783f'
}

function fitCanvas(canvas: HTMLCanvasElement) {
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth || 800
  const height = canvas.clientHeight || 100
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }
  return { width, height }
}

function drawWave(canvas: HTMLCanvasElement, profile: AudioProfile) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = fitCanvas(canvas)
  ctx.clearRect(0, 0, width, height)
  const mid = height / 2
  const peaks = profile.peaks
  const buckets = peaks.length / 2
  ctx.fillStyle = accent()
  for (let i = 0; i < buckets; i += 1) {
    const x = (i / buckets) * width
    const min = peaks[i * 2]
    const max = peaks[i * 2 + 1]
    const y1 = mid - max * mid * 0.95
    const y2 = mid - min * mid * 0.95
    ctx.globalAlpha = 0.85
    ctx.fillRect(x, y1, Math.max(1, width / buckets), Math.max(1, y2 - y1))
  }
  ctx.globalAlpha = 1
}

function drawSpectrogram(canvas: HTMLCanvasElement, profile: AudioProfile) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = fitCanvas(canvas)
  ctx.clearRect(0, 0, width, height)
  const { cols, rows, data } = profile.spectrogram
  const off = document.createElement('canvas')
  off.width = cols
  off.height = rows
  const offCtx = off.getContext('2d')
  if (!offCtx) return
  const image = offCtx.createImageData(cols, rows)
  const [r, g, b] = (() => {
    const hex = accent().replace('#', '')
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
  })()
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const value = data[row * cols + col] / 255
      const y = rows - 1 - row
      const idx = (y * cols + col) * 4
      image.data[idx] = r
      image.data[idx + 1] = g
      image.data[idx + 2] = b
      image.data[idx + 3] = Math.round(Math.pow(value, 1.8) * 255)
    }
  }
  offCtx.putImageData(image, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(off, 0, 0, width, height)
}

function heatmap(canvas: HTMLCanvasElement, cols: number, rows: number, data: Uint8Array, invertY = false) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = fitCanvas(canvas)
  ctx.clearRect(0, 0, width, height)
  const off = document.createElement('canvas')
  off.width = cols
  off.height = rows
  const offCtx = off.getContext('2d')
  if (!offCtx) return
  const image = offCtx.createImageData(cols, rows)
  const hex = accent().replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const value = data[row * cols + col] / 255
      const y = invertY ? row : rows - 1 - row
      const idx = (y * cols + col) * 4
      image.data[idx] = r
      image.data[idx + 1] = g
      image.data[idx + 2] = b
      image.data[idx + 3] = Math.round(Math.pow(value, 1.6) * 255)
    }
  }
  offCtx.putImageData(image, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(off, 0, 0, width, height)
}

function drawMel(canvas: HTMLCanvasElement, profile: AudioProfile) {
  heatmap(canvas, profile.mel.cols, profile.mel.rows, profile.mel.data)
}

function drawMfcc(canvas: HTMLCanvasElement, profile: AudioProfile) {
  // MFCC 每行尺度已归一化，行序 0..12，低频系数在上
  heatmap(canvas, profile.mfcc.cols, profile.mfcc.rows, profile.mfcc.frames, true)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = { width: canvas.clientWidth, height: canvas.clientHeight }
  ctx.fillStyle = 'rgba(255,255,255,.72)'
  ctx.fillRect(0, 0, 70, height)
  ctx.fillStyle = '#171915'
  ctx.font = '9px system-ui, sans-serif'
  for (let k = 0; k < profile.mfcc.rows; k += 1) {
    ctx.fillText(`c${k}`, 6, (k + 0.7) * (height / profile.mfcc.rows))
  }
}

function renderSegments(container: HTMLElement, profile: AudioProfile) {
  container.innerHTML = ''
  const values = profile.segmentBpm.filter((v): v is number => typeof v === 'number')
  const max = Math.max(120, ...values)
  profile.segmentBpm.forEach((bpm, index) => {
    const cell = document.createElement('div')
    cell.className = 'omc-profile__seg'
    const bar = document.createElement('i')
    bar.style.height = `${bpm ? Math.max(6, Math.round((bpm / max) * 46)) : 3}px`
    const label = document.createElement('b')
    label.textContent = bpm ? String(bpm) : '—'
    const time = document.createElement('small')
    time.textContent = `${index * 15}s`
    cell.append(bar, label, time)
    container.appendChild(cell)
  })
}

function fmt(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

function exportPng(profile: AudioProfile) {
  const canvas = document.createElement('canvas')
  canvas.width = 960
  canvas.height = 700
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#f1efea'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#171915'
  ctx.font = '600 22px system-ui, sans-serif'
  ctx.fillText('声纹档案 · AUDIO PROFILE', 32, 44)
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillStyle = '#77756d'
  ctx.fillText(`时长 ${fmt(profile.durationSec, 1)}s · 已分析 ${fmt(profile.analyzedSec, 0)}s · ${profile.sampleRate}Hz`, 32, 66)

  const wave = document.querySelector<HTMLCanvasElement>('.omc-profile__wave')
  const spec = document.querySelector<HTMLCanvasElement>('.omc-profile__spec')
  if (wave) ctx.drawImage(wave, 32, 86, 896, 96)
  if (spec) ctx.drawImage(spec, 32, 194, 896, 220)

  ctx.fillStyle = '#171915'
  ctx.font = '600 18px system-ui, sans-serif'
  const metrics = [
    ['BPM', profile.bpm ? String(profile.bpm) : '—'],
    ['响度', `${fmt(profile.dbfs)} dBFS`],
    ['动态范围', `${fmt(profile.dr)} dB`],
    ['峰值', `${Math.round(profile.peak * 100)}%`],
  ]
  metrics.forEach(([label, value], index) => {
    const x = 32 + index * 220
    ctx.fillStyle = '#77756d'
    ctx.font = '11px system-ui, sans-serif'
    ctx.fillText(label, x, 448)
    ctx.fillStyle = '#171915'
    ctx.font = '600 22px system-ui, sans-serif'
    ctx.fillText(value, x, 476)
  })

  ctx.fillStyle = '#77756d'
  ctx.font = '10px system-ui, sans-serif'
  ctx.fillText('分段 BPM（每 15 秒）', 32, 510)
  const values = profile.segmentBpm.filter((v): v is number => typeof v === 'number')
  const max = Math.max(120, ...values)
  profile.segmentBpm.forEach((bpm, index) => {
    const x = 32 + index * 52
    const barHeight = bpm ? Math.max(4, (bpm / max) * 90) : 2
    ctx.fillStyle = 'rgba(169,120,63,.55)'
    ctx.fillRect(x, 610 - barHeight, 34, barHeight)
    ctx.fillStyle = '#171915'
    ctx.font = '10px system-ui, sans-serif'
    ctx.fillText(bpm ? String(bpm) : '—', x + 8, 628)
  })
  ctx.fillStyle = '#77756d'
  ctx.fillText('Open Music Club · 分析在浏览器本地完成，音频不上传', 32, 676)

  canvas.toBlob((blob) => {
    if (!blob) return
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `声纹档案-${Date.now()}.png`
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 4000)
  }, 'image/png')
}

export function openProfileView() {
  ensureStyle()
  let root = document.querySelector<HTMLElement>(ROOT_SELECTOR)
  if (root) { root.hidden = false; return }

  root = document.createElement('div')
  root.className = 'omc-profile'
  root.innerHTML = `
    <div class="omc-profile__card" role="dialog" aria-modal="true" aria-label="声纹档案">
      <header>
        <div>
          <h3>声纹档案<em>AUDIO PROFILE</em></h3>
          <p>整曲波形 · 频谱热力图 · 分段 BPM · 全部在浏览器本地计算</p>
        </div>
        <button type="button" class="omc-profile__close" aria-label="关闭">✕</button>
      </header>
      <p class="omc-profile__status" data-profile-status>准备分析…</p>
      <canvas class="omc-profile__wave" data-profile-wave></canvas>
      <div class="omc-profile__switch" role="tablist" aria-label="频谱视图">
        <button type="button" data-mode="log" class="is-active">对数频谱</button>
        <button type="button" data-mode="mel">Mel 频谱</button>
        <button type="button" data-mode="mfcc">MFCC</button>
      </div>
      <canvas class="omc-profile__spec" data-profile-spec></canvas>
      <div class="omc-profile__metrics">
        <div class="omc-profile__metric"><small>BPM</small><strong data-profile-bpm>—</strong></div>
        <div class="omc-profile__metric"><small>响度</small><strong data-profile-dbfs>—<em>dBFS</em></strong></div>
        <div class="omc-profile__metric"><small>动态范围</small><strong data-profile-dr>—<em>dB</em></strong></div>
        <div class="omc-profile__metric"><small>峰值</small><strong data-profile-peak>—</strong></div>
        <div class="omc-profile__metric"><small>时长</small><strong data-profile-duration>—</strong></div>
      </div>
      <div class="omc-profile__segs" data-profile-segs></div>
      <footer>
        <span>分段 BPM（每 15 秒）· 分析前 120 秒</span>
        <div class="omc-profile__actions">
          <button type="button" class="omc-profile__btn" data-profile-export disabled>导出 PNG</button>
          <button type="button" class="omc-profile__btn" data-profile-close>关闭</button>
        </div>
      </footer>
    </div>
  `
  document.body.appendChild(root)

  const status = root.querySelector('[data-profile-status]') as HTMLElement
  const waveCanvas = root.querySelector('[data-profile-wave]') as HTMLCanvasElement
  const specCanvas = root.querySelector('[data-profile-spec]') as HTMLCanvasElement
  const segs = root.querySelector('[data-profile-segs]') as HTMLElement
  const bpmEl = root.querySelector('[data-profile-bpm]') as HTMLElement
  const dbfsEl = root.querySelector('[data-profile-dbfs]') as HTMLElement
  const drEl = root.querySelector('[data-profile-dr]') as HTMLElement
  const peakEl = root.querySelector('[data-profile-peak]') as HTMLElement
  const durationEl = root.querySelector('[data-profile-duration]') as HTMLElement
  const exportBtn = root.querySelector('[data-profile-export]') as HTMLButtonElement

  const close = () => { root!.hidden = true }
  root.addEventListener('click', (event) => { if (event.target === root) close() })
  root.querySelector('.omc-profile__close')?.addEventListener('click', close)
  root.querySelector('[data-profile-close]')?.addEventListener('click', close)
  document.addEventListener('keydown', function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape' && root && !root.hidden) {
      close()
      document.removeEventListener('keydown', onKey)
    }
  })

  let lastProfile: AudioProfile | null = null
  const modeLabel: Record<string, string> = { log: '对数频谱', mel: 'Mel 频谱', mfcc: 'MFCC' }
  const refreshStatus = () => {
    if (!lastProfile) return
    status.textContent = `已分析 ${fmt(lastProfile.analyzedSec, 0)}s / 共 ${fmt(lastProfile.durationSec, 1)}s · ${modeLabel[mode]}`
  }
  let mode: 'log' | 'mel' | 'mfcc' = 'log'
  const switchBar = root.querySelector('.omc-profile__switch') as HTMLElement

  function paint() {
    if (!lastProfile) return
    if (mode === 'log') drawSpectrogram(specCanvas, lastProfile)
    else if (mode === 'mel') drawMel(specCanvas, lastProfile)
    else drawMfcc(specCanvas, lastProfile)
  }

  switchBar.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button[data-mode]') as HTMLButtonElement | null
    if (!button) return
    const next = button.dataset.mode as 'log' | 'mel' | 'mfcc'
    if (next === mode) return
    mode = next
    switchBar.querySelectorAll('button[data-mode]').forEach((el) => {
      el.classList.toggle('is-active', (el as HTMLButtonElement).dataset.mode === next)
    })
    paint()
    refreshStatus()
  })

  status.textContent = '正在读取当前音轨…'
  analyzeCurrentTrack((ratio, label) => {
    status.textContent = `${label} ${Math.round(ratio * 100)}%`
  })
    .then((profile) => {
      if (!profile) {
        status.textContent = '没有正在播放的音频，先播放一首歌再试。'
        return
      }
      lastProfile = profile
      drawWave(waveCanvas, profile)
      paint()
      refreshStatus()
      renderSegments(segs, profile)
      bpmEl.textContent = profile.bpm ? String(profile.bpm) : '—'
      dbfsEl.innerHTML = `${fmt(profile.dbfs)}<em>dBFS</em>`
      drEl.innerHTML = `${fmt(profile.dr)}<em>dB</em>`
      peakEl.textContent = `${Math.round(profile.peak * 100)}%`
      durationEl.textContent = `${fmt(profile.durationSec, 1)}s`
      exportBtn.disabled = false
      exportBtn.onclick = () => exportPng(profile)
    })
    .catch((error) => {
      status.textContent = `分析失败：${error instanceof Error ? error.message : String(error)}`
    })
}
