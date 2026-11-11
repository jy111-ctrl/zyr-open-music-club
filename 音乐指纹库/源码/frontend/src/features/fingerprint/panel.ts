/**
 * 音乐指纹库面板（后端版）
 *
 * 前端只做两件事：把用户给的音频解码成 PCM 并算出查询哈希；
 * 指纹库存放与匹配全部由后端完成（SQLite + 投票）。
 */
import { chromaFrames, decodeToMono, fingerprintMonoDetailed, PARAMS, SAMPLE_RATE } from './fingerprint.ts'

const STYLE_ID = 'omc-fingerprint-style'

const CSS = `
.omc-fp { position: fixed; inset: 0; z-index: 140; display: grid; place-items: center; background: rgba(23,25,21,.45); backdrop-filter: blur(3px); }
.omc-fp[hidden] { display: none; }
.omc-fp__card { width: min(880px, 95vw); max-height: 92vh; overflow: auto; background: var(--color-surface-01, #f1efea); border: 1px solid var(--hairline, #b9b5ab); padding: 18px 22px; display: grid; gap: 14px; box-shadow: 0 28px 70px rgba(23,25,21,.22); }
.omc-fp__card header { display: flex; justify-content: space-between; align-items: flex-start; }
.omc-fp__card h3 { margin: 0; font-size: 1.05rem; }
.omc-fp__card h3 em { font-style: normal; font-size: .58rem; letter-spacing: .16em; opacity: .5; margin-left: 6px; }
.omc-fp__card p.sub { margin: 4px 0 0; font-size: .58rem; letter-spacing: .1em; opacity: .6; }
.omc-fp__close { border: 0; background: transparent; font-size: 1rem; cursor: pointer; opacity: .55; color: inherit; }
.omc-fp__section { border-top: 1px solid var(--color-border-19, #ddd9cf); padding-top: 12px; display: grid; gap: 8px; }
.omc-fp__section h4 { margin: 0; font-size: .72rem; letter-spacing: .12em; opacity: .75; }
.omc-fp__row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.omc-fp__btn { padding: 7px 14px; border: 1px solid var(--hairline, #b9b5ab); background: transparent; color: inherit; font: inherit; font-size: .6rem; letter-spacing: .12em; cursor: pointer; }
.omc-fp__btn:hover { border-color: var(--color-accent-20, #a9783f); color: var(--color-accent-20, #a9783f); }
.omc-fp__btn--primary { border-color: var(--color-accent-20, #a9783f); color: var(--color-accent-20, #a9783f); }
.omc-fp__status { margin: 0; font-size: .6rem; letter-spacing: .06em; opacity: .7; min-height: 1.2em; }
.omc-fp__result { padding: 12px; border: 1px dashed var(--hairline, #b9b5ab); font-size: .7rem; line-height: 1.7; }
.omc-fp__result b { color: var(--color-accent-20, #a9783f); font-size: .95rem; }
.omc-fp__meter { height: 4px; background: rgba(23,25,21,.12); margin-top: 6px; }
.omc-fp__meter i { display: block; height: 100%; background: var(--color-accent-20, #a9783f); }
.omc-fp__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.omc-fp__cell { border: 1px solid var(--color-border-19, #ddd9cf); padding: 8px 10px; }
.omc-fp__cell small { display: block; font-size: .5rem; letter-spacing: .14em; opacity: .55; margin-bottom: 3px; }
.omc-fp__cell strong { font-size: .82rem; font-variant-numeric: tabular-nums; }
.omc-fp__cell em { font-style: normal; font-size: .52rem; opacity: .55; margin-left: 3px; }
.omc-fp__chart { width: 100%; height: 110px; display: block; border: 1px solid var(--color-border-19, #ddd9cf); }
.omc-fp__cands { display: grid; gap: 4px; font-size: .58rem; }
.omc-fp__cand { display: grid; grid-template-columns: 24px 1fr 70px 70px; gap: 8px; align-items: center; padding: 3px 6px; border-bottom: 1px dotted var(--color-border-19, #ddd9cf); }
.omc-fp__cand.is-best { color: var(--color-accent-20, #a9783f); font-weight: 600; }
.omc-fp__params { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 4px 14px; font-size: .55rem; opacity: .78; }
.omc-fp__params span { display: flex; justify-content: space-between; gap: 6px; border-bottom: 1px dotted rgba(23,25,21,.12); padding: 2px 0; }
`

type ServerMatch = {
  channel?: string | null
  melody?: { threshold: { score: number; z: number }; candidates?: { title: string; score: number; z: number; transpose: number; atSec: number }[] }
  accepted: boolean
  reason: string
  threshold: number
  best: { songId: string; title: string; votes: number; offsetFrames: number; offsetSec: number; confidence: number } | null
  candidates: { songId: string; title: string; votes: number; offsetSec: number }[]
  queryHashes: number
  queryHits: number
  distribution: { offsetSec: number; votes: number }[]
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function drawDistribution(canvas: HTMLCanvasElement, distribution: { offsetSec: number; votes: number }[], peakOffset: number) {
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth || 780
  const height = canvas.clientHeight || 110
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  if (!distribution.length) return
  const maxVotes = Math.max(...distribution.map((d) => d.votes))
  const minX = Math.min(...distribution.map((d) => d.offsetSec))
  const maxX = Math.max(...distribution.map((d) => d.offsetSec))
  const span = Math.max(1, maxX - minX)
  const barW = Math.max(1, width / Math.max(1, distribution.length))
  distribution.forEach((point, index) => {
    const x = ((point.offsetSec - minX) / span) * (width - barW)
    const h = Math.max(1, (point.votes / maxVotes) * (height - 16))
    ctx.fillStyle = Math.abs(point.offsetSec - peakOffset) < 0.6 ? '#a9783f' : 'rgba(23,25,21,.28)'
    ctx.fillRect(x, height - 14 - h, barW, h)
    if (index % Math.ceil(distribution.length / 8) === 0) {
      ctx.fillStyle = 'rgba(23,25,21,.5)'
      ctx.font = '8px system-ui, sans-serif'
      ctx.fillText(fmtTime(point.offsetSec), x, height - 3)
    }
  })
}

async function csrfToken(): Promise<string> {
  const res = await fetch('/api/security/csrf-token', { credentials: 'same-origin' })
  const data = await res.json()
  return data.csrfToken || ''
}

export function openFingerprintPanel() {
  ensureStyle()

  const root = document.createElement('div')
  root.className = 'omc-fp'
  root.innerHTML = `
    <div class="omc-fp__card" role="dialog" aria-modal="true" aria-label="音乐指纹库">
      <header>
        <div>
          <h3>音乐指纹库<em>AUDIO FINGERPRINT</em></h3>
          <p class="sub">指纹库在服务端（SQLite）· 前端只提交查询片段 · 匹配与投票由后端完成</p>
        </div>
        <button type="button" class="omc-fp__close" aria-label="关闭">✕</button>
      </header>

      <section class="omc-fp__section">
        <h4>指纹库</h4>
        <p class="omc-fp__status" data-fp-library>读取库信息…</p>
      </section>

      <section class="omc-fp__section">
        <h4>识别</h4>
        <div class="omc-fp__row">
          <input type="file" accept="audio/*" data-fp-query-input hidden />
          <button type="button" class="omc-fp__btn omc-fp__btn--primary" data-fp-query>选择音频识别</button>
          <button type="button" class="omc-fp__btn" data-fp-record>录音 10 秒识别</button>
          <span class="omc-fp__status" data-fp-query-status></span>
        </div>
        <div class="omc-fp__result" data-fp-result>等待识别…</div>
        <div data-fp-details hidden></div>
      </section>
    </div>
  `
  document.body.appendChild(root)

  const close = () => { root.hidden = true }
  root.addEventListener('click', (event) => { if (event.target === root) close() })
  root.querySelector('.omc-fp__close')?.addEventListener('click', close)

  const queryInput = root.querySelector('[data-fp-query-input]') as HTMLInputElement
  const queryStatus = root.querySelector('[data-fp-query-status]') as HTMLElement
  const resultEl = root.querySelector('[data-fp-result]') as HTMLElement
  const detailsEl = root.querySelector('[data-fp-details]') as HTMLElement
  const libraryEl = root.querySelector('[data-fp-library]') as HTMLElement

  async function loadLibrary() {
    try {
      const res = await fetch('/api/fingerprint/library', { credentials: 'same-origin' })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || '读取失败')
      libraryEl.textContent = `已入库 ${data.songs} 首 · ${data.hashes} 个指纹（服务端 SQLite）`
    } catch (error) {
      libraryEl.textContent = '读取指纹库失败：' + (error instanceof Error ? error.message : String(error))
    }
  }

  function renderDetails(match: ServerMatch, monoSeconds: number, peaks: number, accepted: boolean) {
    // 旋律通道：渲染旋律指标，而不是指纹票数
    if (match.channel === 'melody' && match.best) {
      const m = match.best as unknown as { title: string; score: number; z: number; transpose: number; atSec: number }
      detailsEl.hidden = false
      detailsEl.innerHTML = `
        <div class="omc-fp__grid" style="margin-top:10px">
          <div class="omc-fp__cell"><small>查询帧数</small><strong>${match.queryHashes || '—'}<em>帧</em></strong></div>
          <div class="omc-fp__cell"><small>旋律相似度</small><strong>${m.score}</strong></div>
          <div class="omc-fp__cell"><small>显著性 z</small><strong>${m.z}</strong></div>
          <div class="omc-fp__cell"><small>移调</small><strong>${m.transpose >= 0 ? '+' : ''}${m.transpose}<em>半音</em></strong></div>
          <div class="omc-fp__cell"><small>命中位置</small><strong>${fmtTime(m.atSec)}</strong></div>
          <div class="omc-fp__cell"><small>片段时长</small><strong>${monoSeconds.toFixed(1)}<em>s</em></strong></div>
          <div class="omc-fp__cell"><small>相似度阈值</small><strong>${match.melody?.threshold.score ?? 0.12}</strong></div>
          <div class="omc-fp__cell"><small>显著性阈值</small><strong>${match.melody?.threshold.z ?? 4}</strong></div>
        </div>
        <p class="omc-fp__status" style="margin:10px 0 4px">说明：旋律通道比较的是"音高怎么变"，因此对音色、调性不敏感；相似度低但显著（z 高）仍可判定命中。</p>
      `
      return
    }

    const best = match.best
    const second = match.candidates[1]
    const hitRate = match.queryHashes ? (match.queryHits / match.queryHashes) * 100 : 0
    const density = monoSeconds > 0 ? peaks / monoSeconds : 0
    const offsetSec = best ? best.offsetSec : 0

    detailsEl.hidden = false
    detailsEl.innerHTML = `
      <div class="omc-fp__grid" style="margin-top:10px">
        <div class="omc-fp__cell"><small>查询时长</small><strong>${monoSeconds.toFixed(2)}<em>s</em></strong></div>
        <div class="omc-fp__cell"><small>提取峰值</small><strong>${peaks}<em>个</em></strong></div>
        <div class="omc-fp__cell"><small>峰值密度</small><strong>${density.toFixed(1)}<em>个/秒</em></strong></div>
        <div class="omc-fp__cell"><small>查询哈希</small><strong>${match.queryHashes}<em>个</em></strong></div>
        <div class="omc-fp__cell"><small>命中哈希</small><strong>${match.queryHits}<em>个</em></strong></div>
        <div class="omc-fp__cell"><small>命中率</small><strong>${hitRate.toFixed(1)}<em>%</em></strong></div>
        <div class="omc-fp__cell"><small>最高票数</small><strong>${best ? best.votes : 0}<em>票</em></strong></div>
        <div class="omc-fp__cell"><small>时间偏移</small><strong>${fmtTime(offsetSec)}<em>原曲位置</em></strong></div>
        <div class="omc-fp__cell"><small>次佳票数</small><strong>${second ? second.votes : 0}<em>票</em></strong></div>
        <div class="omc-fp__cell"><small>领先倍数</small><strong>${second && second.votes ? (best!.votes / second.votes).toFixed(1) : '—'}<em>×</em></strong></div>
      </div>

      <p class="omc-fp__status" style="margin:10px 0 4px">投票分布（横轴＝与库中片段的时间偏移，尖峰越突出越可信）</p>
      <canvas class="omc-fp__chart" data-fp-chart></canvas>

      <p class="omc-fp__status" style="margin:10px 0 4px">候选排名（同一首歌会因偏移不同出现多次）</p>
      <div class="omc-fp__cands">
        ${match.candidates.map((c, i) => `
          <div class="omc-fp__cand${i === 0 && accepted ? ' is-best' : ''}">
            <span>${String(i + 1).padStart(2, '0')}</span>
            <span>${c.title}</span>
            <span>${c.votes} 票</span>
            <span>${fmtTime(c.offsetSec)}</span>
          </div>`).join('') || '<div class="omc-fp__cand">无候选</div>'}
      </div>

      <details style="margin-top:10px">
        <summary style="cursor:pointer;font-size:.6rem;letter-spacing:.1em;opacity:.7">指纹参数（建库与查询共用）</summary>
        <div class="omc-fp__params" style="margin-top:8px">
          <span>采样率 <b>${PARAMS.sampleRate} Hz</b></span>
          <span>FFT 窗 <b>${PARAMS.fftSize}</b></span>
          <span>hop <b>${PARAMS.hop}（${(PARAMS.hop / PARAMS.sampleRate * 1000).toFixed(1)} ms）</b></span>
          <span>频率范围 <b>${PARAMS.minHz}–${PARAMS.maxHz} Hz</b></span>
          <span>峰值门限 <b>${PARAMS.peakFloorDb} dB</b></span>
          <span>相对门限 <b>-${PARAMS.peakRelDb} dB</b></span>
          <span>邻域抑制 <b>±${PARAMS.neighborFrames} 帧 / ±${PARAMS.neighborBins} bin</b></span>
          <span>配对数量 <b>${PARAMS.fanOut}</b></span>
          <span>Δt 范围 <b>${PARAMS.minPairFrames}–${PARAMS.maxPairFrames} 帧</b></span>
          <span>Δt 量化 <b>2 帧</b></span>
          <span>频率量化 <b>${PARAMS.freqQuant} bin</b></span>
          <span>峰值上限 <b>${PARAMS.maxPeaksPerSecond} / 秒</b></span>
          <span>识别阈值 <b>${match.threshold} 票（服务端）</b></span>
        </div>
      </details>
    `
    const chart = detailsEl.querySelector('[data-fp-chart]') as HTMLCanvasElement | null
    if (chart) drawDistribution(chart, match.distribution, offsetSec)
  }

  async function recognize(label: string, buffer: ArrayBuffer) {
    queryStatus.textContent = `正在计算查询指纹（${label}）…`
    resultEl.textContent = '计算中…'
    detailsEl.hidden = true

    const mono = await decodeToMono(buffer)
    const { peaks, hashes } = fingerprintMonoDetailed(mono)
    if (!hashes.length) {
      resultEl.textContent = '这段音频里没有提取到有效指纹。'
      queryStatus.textContent = ''
      return
    }
    const flat: number[] = new Array(hashes.length * 2)
    hashes.forEach((pair, index) => {
      flat[index * 2] = pair.h
      flat[index * 2 + 1] = pair.t
    })
    const chroma = chromaFrames(mono)

    queryStatus.textContent = `后端匹配中（${hashes.length} 个哈希）…`
    const token = await csrfToken()
    const res = await fetch('/api/fingerprint/match', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify({ hashes: flat, chroma }),
    })
    const data = await res.json()
    const seconds = mono.length / SAMPLE_RATE

    if (!data.success) {
      resultEl.textContent = '匹配失败：' + (data.message || res.status)
      queryStatus.textContent = ''
      return
    }

    if (!data.accepted || !data.best) {
      const fp = data.fingerprint || data
      const md = data.melody
      resultEl.innerHTML = `<div>未识别到匹配结果</div>
        <div>指纹：最高 ${fp.best ? fp.best.votes : 0} 票（阈值 ${fp.threshold ?? 20}）</div>
        <div>旋律：${md ? `相似度 ${md.candidates?.[0]?.score ?? 0}，z=${md.candidates?.[0]?.z ?? 0}（阈值 ${md.threshold.score}/${md.threshold.z}）` : '未计算'}</div>`
      queryStatus.textContent = '置信度不足'
      renderDetails(data, seconds, peaks.length, false)
      return
    }

    if (data.channel === 'melody') {
      const m = data.best
      resultEl.innerHTML = `
        <div>识别结果：<b>${m.title}</b> <span style="opacity:.6">（旋律匹配）</span></div>
        <div>旋律相似度 <b>${m.score}</b> · 显著性 z=${m.z} · 移调 ${m.transpose >= 0 ? '+' : ''}${m.transpose} 半音</div>
        <div>对应原曲 <b>${fmtTime(Math.max(0, m.atSec))}</b> 处 · 片段时长 ${fmtTime(seconds)}</div>
        <div class="omc-fp__meter"><i style="width:${Math.min(100, Math.round((m.score / 0.4) * 100))}%"></i></div>
      `
      queryStatus.textContent = '识别成功（旋律通道）'
      renderDetails(data, seconds, peaks.length, true)
      return
    }

    const pct = Math.round(Math.min(1, data.best.confidence) * 100)
    resultEl.innerHTML = `
      <div>识别结果：<b>${data.best.title}</b> <span style="opacity:.6">（指纹匹配）</span></div>
      <div>命中票数 <b>${data.best.votes}</b> · 置信度 ${pct}% · 对应原曲 ${fmtTime(Math.max(0, data.best.offsetSec))} 处</div>
      <div>查询指纹 ${data.queryHashes} 个，片段时长 ${fmtTime(seconds)}</div>
      <div class="omc-fp__meter"><i style="width:${pct}%"></i></div>
    `
    queryStatus.textContent = '识别成功（指纹通道）'
    renderDetails(data, seconds, peaks.length, true)
  }

  root.querySelector('[data-fp-query]')?.addEventListener('click', () => queryInput.click())
  queryInput.addEventListener('change', () => {
    const file = queryInput.files?.[0]
    if (file) void file.arrayBuffer().then((buffer) => recognize(file.name, buffer))
  })

  root.querySelector('[data-fp-record]')?.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      queryStatus.textContent = '录音中…10 秒'
      recorder.start()
      await new Promise((resolve) => setTimeout(resolve, 10000))
      recorder.stop()
      stream.getTracks().forEach((track) => track.stop())
      await new Promise((resolve) => { recorder.onstop = resolve })
      const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' })
      void recognize('录音', await blob.arrayBuffer())
    } catch (error) {
      queryStatus.textContent = '无法录音：' + (error instanceof Error ? error.message : String(error))
    }
  })

  void loadLibrary()
}

// 便于自动化测试与外部入口调用
if (typeof window !== 'undefined') {
  ;(window as unknown as { omcOpenFingerprint?: () => void }).omcOpenFingerprint = openFingerprintPanel
}
