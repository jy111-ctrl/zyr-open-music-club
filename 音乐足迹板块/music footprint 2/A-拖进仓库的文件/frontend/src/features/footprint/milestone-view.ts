import { escapeHtml } from "../../shared/html.ts"
import { uiIcons } from "../../shared/ui/icons.ts"
import { safeCoverUrl, type SearchItem } from "../../shared/music.ts"
import type { FootprintMilestone } from "../../services/music/footprint.ts"
import { formatDate, formatDuration } from "./format.ts"

export type MilestoneView = { element: HTMLElement; refresh(): Promise<void>; destroy(): void }

// 界面二：听歌里程。把累计的播放行为折算成可以一眼读懂的数字和图形。
export function mountMilestoneView(host: HTMLElement, options: {
  client: { milestone: () => Promise<FootprintMilestone> }
  play?: (song: SearchItem) => Promise<unknown>
  notice?: (message: string, error?: boolean) => void
}): MilestoneView {
  const section = document.createElement('section')
  section.className = 'fp-view fp-milestone'
  section.setAttribute('aria-label', '听歌里程')
  host.append(section)
  let milestone: FootprintMilestone | null = null
  let loading = false
  let disposed = false

  const render = () => {
    if (disposed) return
    if (!milestone) {
      section.innerHTML = `<header class="fp-view-header"><p>MILESTONE / 听歌里程</p><h3>我的听歌里程</h3><span>${loading ? '正在统计…' : '暂无数据'}</span></header>
        <p class="fp-empty">${loading ? '正在读取你的听歌里程…' : '还没有可统计的足迹，先去听一首歌吧。'}</p>`
      return
    }
    const data = milestone
    const peak = Math.max(1, ...data.hourly)
    const monthlyPeak = Math.max(1, ...data.monthly.map((item) => item.plays))
    section.innerHTML = `<header class="fp-view-header"><p>MILESTONE / 听歌里程</p><h3>我的听歌里程</h3>
      <span>${escapeHtml(formatDate(data.firstPlayedAt || ''))} 起 · 共 ${data.activeDays} 天有声音</span></header>
      <div class="fp-stat-grid">
        <article class="fp-stat"><small>累计播放</small><strong>${data.totalPlays}</strong><span>次</span></article>
        <article class="fp-stat"><small>陪伴时长</small><strong>${escapeHtml(formatDuration(data.totalDurationMs))}</strong><span>累计</span></article>
        <article class="fp-stat"><small>连续听歌</small><strong>${data.streakDays}</strong><span>天</span></article>
        <article class="fp-stat"><small>听过的歌</small><strong>${data.distinctTracks}</strong><span>首 · ${data.distinctArtists} 位艺术家</span></article>
      </div>
      <section class="fp-panel"><h4>24 小时里的听歌节奏</h4>
        <div class="fp-hours" role="img" aria-label="按小时统计的播放次数">${data.hourly.map((plays, hour) => `<i style="--fp-ratio:${(plays / peak).toFixed(3)}" title="${hour} 点 · ${plays} 次"></i>`).join('')}</div>
        <div class="fp-hours-axis"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div></section>
      <section class="fp-panel"><h4>最近 12 个月</h4>
        <div class="fp-months">${data.monthly.map((item) => `<div class="fp-month"><i style="--fp-ratio:${(item.plays / monthlyPeak).toFixed(3)}"></i><b>${escapeHtml(item.month.slice(2))}</b><small>${item.plays} 次</small></div>`).join('') || '<p class="fp-empty">暂无月度数据</p>'}</div></section>
      <section class="fp-panel"><h4>听得最多的歌</h4>
        <ol class="fp-top-tracks">${data.topTracks.map((track, index) => `<li><span class="fp-rank">${index + 1}</span>
          <img src="${escapeHtml(safeCoverUrl(track.coverUrl))}" alt="" loading="lazy" />
          <div><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · ${track.plays} 次</small></div>
          <button type="button" class="fp-icon" data-fp-play="${escapeHtml(track.trackKey)}" aria-label="播放 ${escapeHtml(track.title)}" title="播放">${uiIcons.play}</button></li>`).join('') || '<li class="fp-empty">暂无数据</li>'}</ol></section>
      <section class="fp-panel fp-panel-foot">
        <p><b>${data.noteCount}</b> 篇听歌随笔${data.busiestDay ? ` · 最投入的一天是 <b>${escapeHtml(formatDate(data.busiestDay.date))}</b>，听了 ${data.busiestDay.plays} 次` : ''}</p>
      </section>`
  }

  const load = async () => {
    if (disposed) return
    loading = true
    render()
    try {
      const data = await options.client.milestone()
      if (disposed) return
      milestone = data
    } catch (error) {
      options.notice?.(error instanceof Error ? error.message : '里程读取失败', true)
    } finally {
      loading = false
      render()
    }
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null
    const button = target?.closest<HTMLElement>('[data-fp-play]')
    if (!button) return
    const track = milestone?.topTracks.find((item) => item.trackKey === button.dataset.fpPlay)
    if (!track) return
    const seconds = Math.floor(track.durationMs / 1000)
    void options.play?.({ key: track.trackKey, kind: 'song', source: track.source, sourceId: track.sourceId,
      title: track.title, artist: track.artist, album: '未归档', coverUrl: safeCoverUrl(track.coverUrl),
      duration: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, year: '—', description: '' })
      .catch(() => options.notice?.('歌曲暂时无法播放', true))
  }

  section.addEventListener('click', onClick)
  render()
  void load()
  return {
    element: section,
    refresh: () => load(),
    destroy() { disposed = true; section.removeEventListener('click', onClick); section.remove() },
  }
}
