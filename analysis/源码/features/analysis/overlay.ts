/**
 * 实时声纹：播放器条内的微型频谱 + 居中弹窗
 *
 * 布局原则（避免影响其它功能）：
 *  - 频谱条只占播放器条自身的顶部 20px，不向页面扩展，不遮挡专辑详情等页面
 *  - 指标放居中弹窗，主动点开才出现，点遮罩 / ✕ / Esc 立即关闭
 *  - 不再使用贴边常驻面板
 */
import { analysis, type AnalysisFrame } from './audio-analysis.ts'
import { openProfileView } from './profile-view.ts'

const STYLE_ID = 'omc-analysis-style'
const ROOT_CLASS = 'omc-analysis'
const MODAL_CLASS = 'omc-analysis-modal'

const CSS = `
.global-player .omc-analysis {
  position: absolute; inset: 0; z-index: 2; pointer-events: none;
}
.global-player:not(.is-visible) .omc-analysis { display: none; }
.omc-analysis__strip {
  position: absolute; top: 0; left: 3.2%; right: 3.2%;
  height: 20px; display: flex; align-items: center; gap: 8px;
  pointer-events: auto; cursor: pointer;
  opacity: .9; transition: opacity .2s ease;
}
.omc-analysis__strip:hover { opacity: 1; }
.omc-analysis.is-idle .omc-analysis__strip { opacity: .28; }
.omc-analysis__canvas { flex: 1; height: 16px; display: block; }
.omc-analysis__label {
  flex: none; font-size: .5rem; letter-spacing: .16em;
  color: var(--color-text-67, #77756d);
}
.omc-analysis__label b { color: var(--color-accent-20, #a9783f); font-weight: 600; font-variant-numeric: tabular-nums; }

.${MODAL_CLASS} {
  position: fixed; inset: 0; z-index: 120;
  display: grid; place-items: center;
  background: rgba(23, 25, 21, .28);
  backdrop-filter: blur(2px);
}
.${MODAL_CLASS}[hidden] { display: none; }
.omc-analysis__card {
  width: min(520px, 92vw);
  background: var(--color-surface-01, #f1efea);
  border: 1px solid var(--hairline, #b9b5ab);
  padding: 18px 20px 16px;
  display: grid; gap: 14px;
  box-shadow: 0 24px 60px rgba(23, 25, 21, .18);
}
.omc-analysis__card header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.omc-analysis__card h3 { margin: 0; font-size: 1rem; letter-spacing: -.01em; }
.omc-analysis__card header p { margin: 4px 0 0; font-size: .58rem; letter-spacing: .12em; opacity: .6; }
.omc-analysis__close {
  border: 0; background: transparent; color: inherit; font: inherit;
  font-size: 1rem; line-height: 1; padding: 4px 6px; cursor: pointer; opacity: .55;
}
.omc-analysis__close:hover { opacity: 1; color: var(--color-accent-20, #a9783f); }
.omc-analysis__big { width: 100%; height: 92px; display: block; }
.omc-analysis__map {
  width: 100%; height: 128px; display: block;
  background: linear-gradient(to bottom, var(--color-surface-02, #e8e5df), var(--color-surface-01, #f1efea));
  border: 1px solid var(--color-border-19, #ddd9cf);
}
.omc-analysis__axis { display: flex; justify-content: space-between; font-size: .5rem; letter-spacing: .14em; opacity: .5; }
.omc-analysis__mapwrap { position: relative; }
.omc-analysis__ticks { position: absolute; inset: 0; pointer-events: none; }
.omc-analysis__tick {
  position: absolute; left: 0; right: 0; height: 0;
  border-top: 1px dashed var(--color-border-19, #d7d2c7);
}
.omc-analysis__tick span {
  position: absolute; left: 6px; top: -8px;
  padding: 1px 5px;
  font-size: .48rem; letter-spacing: .1em; line-height: 1.3;
  color: var(--color-text-67, #77756d);
  background: var(--color-surface-01, #f1efea);
}
.omc-analysis__rows { display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-end; }
.omc-analysis__metric { display: grid; gap: 2px; }
.omc-analysis__metric small { font-size: .52rem; letter-spacing: .16em; opacity: .62; }
.omc-analysis__metric strong { font-size: 1.1rem; font-weight: 650; font-variant-numeric: tabular-nums; }
.omc-analysis__metric strong em { font-style: normal; font-size: .56rem; margin-left: 3px; opacity: .6; }
.omc-analysis__meter { width: 140px; height: 3px; margin-top: 4px; background: var(--color-border-19, #ddd9cf); overflow: hidden; }
.omc-analysis__meter i { display: block; height: 100%; width: 0; background: var(--color-accent-20, #a9783f); }
.omc-analysis__card footer { font-size: .54rem; letter-spacing: .08em; opacity: .55; }
`

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

const db = (rms: number) => (rms <= 0 ? '—' : (20 * Math.log10(rms)).toFixed(1))

function paint(canvas: HTMLCanvasElement | null, frame: AnalysisFrame) {
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth || 600
  const height = canvas.clientHeight || 16
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
  }
  context.clearRect(0, 0, width, height)
  const bars = frame.bars
  const gap = 2
  const barWidth = Math.max(2, (width - gap * (bars.length - 1)) / bars.length)
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-20').trim() || '#a9783f'
  for (let i = 0; i < bars.length; i += 1) {
    const value = frame.active ? bars[i] / 255 : 0
    const barHeight = Math.max(1, value * height)
    context.globalAlpha = 0.3 + value * 0.7
    context.fillRect(i * (barWidth + gap), height - barHeight, barWidth, barHeight)
  }
  context.globalAlpha = 1
}

export function mountAnalysisOverlay() {
  if (document.querySelector(`.${ROOT_CLASS}`)) return
  ensureStyle()

  // ---- 播放器条内的微型频谱 ----
  const root = document.createElement('div')
  root.className = `${ROOT_CLASS} is-idle`
  root.dataset.omcAnalysis = ''

  const strip = document.createElement('div')
  strip.className = 'omc-analysis__strip'
  strip.setAttribute('role', 'button')
  strip.setAttribute('tabindex', '0')
  strip.setAttribute('aria-label', '打开实时声纹面板')

  const canvas = document.createElement('canvas')
  canvas.className = 'omc-analysis__canvas'

  const label = document.createElement('span')
  label.className = 'omc-analysis__label'
  label.innerHTML = '声纹 <b data-omc-bpm>—</b> BPM'

  strip.append(canvas, label)
  root.append(strip)

  // ---- 居中弹窗 ----
  const modal = document.createElement('div')
  modal.className = MODAL_CLASS
  modal.hidden = true
  modal.innerHTML = `
    <div class="omc-analysis__card" role="dialog" aria-modal="true" aria-label="实时声纹分析">
      <header>
        <div>
          <h3>实时声纹 <em style="font-style:normal;opacity:.5;font-size:.6rem;letter-spacing:.14em">LIVE ANALYSIS</em></h3>
          <p>当前播放音频的实时采样 · 网易云与本地音乐均支持</p>
        </div>
        <button type="button" class="omc-analysis__close" aria-label="关闭">✕</button>
      </header>
      <div class="omc-analysis__mapwrap">
        <canvas class="omc-analysis__map" aria-label="声谱瀑布图"></canvas>
        <div class="omc-analysis__ticks" data-ticks></div>
      </div>
      <div class="omc-analysis__axis"><span>低频</span><span>中频</span><span>高频</span></div>
      <canvas class="omc-analysis__big"></canvas>
      <div class="omc-analysis__rows">
        <div class="omc-analysis__metric"><small>实时 BPM</small><strong data-m-bpm>—<em>BPM</em></strong></div>
        <div class="omc-analysis__metric"><small>响度</small><strong data-m-rms>—<em>dBFS</em></strong></div>
        <div class="omc-analysis__metric"><small>动态范围</small><strong data-m-dr>—<em>dB</em></strong></div>
        <div class="omc-analysis__metric"><small>峰值</small><strong data-m-peak>—</strong><div class="omc-analysis__meter"><i data-m-bar></i></div></div>
        <div class="omc-analysis__metric"><small>状态</small><strong data-m-state>待播放</strong></div>
      </div>
      <footer style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <span>按 Esc 或点击遮罩关闭 · 分析在浏览器本地完成，不上传音频</span>
        <button type="button" class="omc-analysis__toggle" data-profile-open>生成整曲档案</button>
      </footer>
    </div>
  `
  document.body.appendChild(modal)

  const big = modal.querySelector('.omc-analysis__big') as HTMLCanvasElement | null
  const mapCanvas = modal.querySelector('.omc-analysis__map') as HTMLCanvasElement | null

  // 频率刻度：与引擎的分桶方式保持一致（对数刻度，低频在下）
  function renderTicks() {
    const layer = modal.querySelector('[data-ticks]')
    if (!layer) return
    // 上游的 spectrum 是 40Hz ~ 10kHz 的对数分布（见 features/player/audio-analysis.ts）
    const MIN_HZ = 40
    const MAX_HZ = 10000
    const marks = [100, 1000, 10000]
    layer.innerHTML = marks.map((hz) => {
      const ratio = Math.log(Math.max(hz, MIN_HZ) / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ)
      const percent = Math.min(97, Math.max(3, ratio * 100))
      const text = hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`
      return `<div class="omc-analysis__tick" style="bottom:${percent.toFixed(1)}%"><span>${text}</span></div>`
    }).join('')
  }
  const bpmLabel = label.querySelector('[data-omc-bpm]') as HTMLElement | null
  const mBpm = modal.querySelector('[data-m-bpm]') as HTMLElement | null
  const mRms = modal.querySelector('[data-m-rms]') as HTMLElement | null
  const mPeak = modal.querySelector('[data-m-peak]') as HTMLElement | null
  const mBar = modal.querySelector('[data-m-bar]') as HTMLElement | null
  const mState = modal.querySelector('[data-m-state]') as HTMLElement | null
  const mDr = modal.querySelector('[data-m-dr]') as HTMLElement | null

  let lastFrame: AnalysisFrame | null = null
  let peakHold = 0
  let lastPeakAt = 0

  function open() {
    modal.hidden = false
    renderTicks()
    document.addEventListener('keydown', onKey)
    if (lastFrame) render(lastFrame)
  }
  function close() {
    modal.hidden = true
    document.removeEventListener('keydown', onKey)
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') close()
  }

  strip.addEventListener('click', open)
  strip.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open() }
  })
  modal.addEventListener('click', (event) => { if (event.target === modal) close() })
  modal.querySelector('.omc-analysis__close')?.addEventListener('click', close)
  modal.querySelector('[data-profile-open]')?.addEventListener('click', () => {
    close()
    openProfileView()
  })

  // 瀑布图：每帧在右端画一列，整体左移 1px（时间轴向右滚动）
  let lastMapAt = 0
  function paintMap(frame: AnalysisFrame) {
    const context = mapCanvas?.getContext('2d')
    if (!mapCanvas || !context) return
    const now = performance.now()
    if (now - lastMapAt < 33) return
    lastMapAt = now

    const ratio = window.devicePixelRatio || 1
    const width = mapCanvas.clientWidth || 480
    const height = mapCanvas.clientHeight || 128
    if (mapCanvas.width !== Math.round(width * ratio) || mapCanvas.height !== Math.round(height * ratio)) {
      mapCanvas.width = Math.round(width * ratio)
      mapCanvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.fillStyle = '#f1efea'
      context.fillRect(0, 0, width, height)
      return
    }

    // 整体左移 1 个 CSS 像素：必须在单位变换下拷贝，
    // 否则会被 devicePixelRatio 缩放，逐帧拉伸成模糊色块。
    context.save()
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.drawImage(mapCanvas, -Math.round(ratio), 0)
    context.restore()

    const rows = frame.spectrum.length
    const rowHeight = height / rows
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-20').trim() || '#a9783f'
    context.fillStyle = accent
    for (let r = 0; r < rows; r += 1) {
      const raw = frame.active ? frame.spectrum[r] / 255 : 0
      // gamma 压缩：弱频接近透明，强频保留，避免整片糊成色块
      const value = Math.pow(raw, 1.5)
      context.globalAlpha = Math.min(1, value * 1.35)
      // 低频在下、高频在上
      context.fillRect(width - 1, height - (r + 1) * rowHeight, 1, Math.ceil(rowHeight))
    }
    context.globalAlpha = 1
  }

  function render(frame: AnalysisFrame) {
    lastFrame = frame
    root.classList.toggle('is-idle', !frame.active)
    if (bpmLabel) bpmLabel.textContent = frame.bpm ? String(frame.bpm) : '—'
    paint(canvas, frame)

    if (modal.hidden) return
    paint(big, frame)
    paintMap(frame)
    if (mBpm) mBpm.innerHTML = `${frame.bpm ?? '—'}<em>BPM</em>`
    if (mRms) mRms.innerHTML = `${frame.active && frame.dbfs > -90 ? frame.dbfs.toFixed(1) : '—'}<em>dBFS</em>`
    if (mDr) mDr.innerHTML = `${frame.dr > 0 ? frame.dr.toFixed(1) : '—'}<em>dB</em>`
    const now = performance.now()
    if (frame.peak > peakHold || now - lastPeakAt > 1200) { peakHold = frame.peak; lastPeakAt = now }
    if (mPeak) mPeak.textContent = frame.active ? `${Math.round(frame.peak * 100)}%` : '—'
    if (mBar) mBar.style.width = `${Math.min(100, Math.round(peakHold * 100))}%`
    if (mState) mState.textContent = frame.active ? '分析中' : '待播放'
  }

  analysis.subscribe(render)

  // 播放器随应用挂载，等它出现再插入
  let attempts = 0
  const timer = window.setInterval(() => {
    attempts += 1
    const player = document.querySelector('.global-player')
    if (player && !root.isConnected) {
      player.appendChild(root)
      window.clearInterval(timer)
    } else if (attempts > 120) {
      window.clearInterval(timer)
    }
  }, 250)
}
