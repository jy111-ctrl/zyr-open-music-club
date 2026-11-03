import { uiIcons } from "../../shared/ui/icons.ts"
import type { SearchItem } from "../../shared/music.ts"
import { createFootprintClient } from "../../services/music/footprint.ts"
import { mountTimelineView, type TimelineView } from "./timeline-view.ts"
import { mountMilestoneView, type MilestoneView } from "./milestone-view.ts"
import { mountCardStudioView, type CardStudioView } from "./card-studio-view.ts"
import { mountSquareView, type SquareView } from "./square-view.ts"
import { mountMyPostsView, type MyPostsView } from "./my-posts-view.ts"
import { mountPostDetailView, type PostDetailView } from "./post-detail-view.ts"

type FootprintClientType = ReturnType<typeof createFootprintClient>
type Tab = 'timeline' | 'milestone' | 'studio' | 'square' | 'mine'
type AnyView = TimelineView | MilestoneView | CardStudioView | SquareView | MyPostsView

const tabs: { id: Tab; label: string; english: string }[] = [
  { id: 'timeline', label: '时光轴', english: 'TIMELINE' },
  { id: 'milestone', label: '听歌里程', english: 'MILESTONE' },
  { id: 'studio', label: '回忆卡片', english: 'CARD STUDIO' },
  { id: 'square', label: '足迹广场', english: 'SQUARE' },
  { id: 'mine', label: '我的分享', english: 'MY SHARES' },
]

const headings: Record<Tab, { title: string; subtitle: string }> = {
  timeline: { title: '音乐足迹时光轴', subtitle: '播放过的每一首歌，都会按时间留在这里。' },
  milestone: { title: '我的听歌里程', subtitle: '把零碎的播放，折算成一段可以回看的旅程。' },
  studio: { title: '回忆卡片工坊', subtitle: '挑几段足迹，做成一张可以保存和分享的卡片。' },
  square: { title: '足迹广场', subtitle: '看看其他成员这段时间在听什么。' },
  mine: { title: '我的分享', subtitle: '管理你分享出去的音乐足迹。' },
}

// 音乐足迹主页面：侧栏切换五个界面，详情界面临时覆盖内容区。
export function mountFootprintPage(host: HTMLElement, options: {
  client?: FootprintClientType
  play?: (song: SearchItem) => Promise<unknown>
  enqueue?: (song: SearchItem) => void
  profile?: () => Promise<{ id: number; nickname: string } | null>
} = {}) {
  const api = options.client ?? createFootprintClient()
  host.innerHTML = createFootprintPageMarkup()
  const page = host.querySelector<HTMLElement>('[data-footprint-page]')!
  const content = page.querySelector<HTMLElement>('[data-fp-content]')!
  const feedback = page.querySelector<HTMLElement>('[data-fp-feedback]')!
  const heading = page.querySelector<HTMLElement>('[data-fp-heading]')!
  const subtitle = page.querySelector<HTMLElement>('[data-fp-subtitle]')!

  let tab: Tab = 'timeline'
  let view: AnyView | null = null
  let detail: PostDetailView | null = null
  let detailId: number | null = null
  let disposed = false
  let viewerId: number | undefined
  let nickname = ''

  const notice = (message: string, error = false) => {
    if (disposed) return
    feedback.textContent = message
    feedback.dataset.error = String(error)
  }

  const mountView = (name: Tab): AnyView => {
    const common = { client: api, notice }
    if (name === 'timeline') return mountTimelineView(content, { ...common, play: options.play, enqueue: options.enqueue })
    if (name === 'milestone') return mountMilestoneView(content, { ...common, play: options.play })
    if (name === 'studio') return mountCardStudioView(content, { ...common, nickname,
      published: () => { if (tab === 'mine') void view?.refresh?.() } })
    if (name === 'square') return mountSquareView(content, { ...common, viewerId, openPost: openDetail })
    return mountMyPostsView(content, { ...common, openPost: openDetail, changed: () => { if (tab === 'square') void view?.refresh?.() } })
  }

  // 让侧栏的滑动指示条跟随当前板块，做出 line-sidebar 那样的"竖线游走"效果。
  function syncNavIndicator() {
    const nav = page.querySelector<HTMLElement>('.fp-nav')
    const indicator = nav?.querySelector<HTMLElement>('[data-fp-nav-indicator]')
    const active = nav?.querySelector<HTMLElement>('[data-fp-tab][aria-current="page"]')
    if (!nav || !indicator || !active) return
    const navBox = nav.getBoundingClientRect()
    const box = active.getBoundingClientRect()
    const height = Math.max(16, Math.min(box.height - 10, 34))
    indicator.style.height = `${height}px`
    indicator.style.transform = `translateY(${(box.top - navBox.top + nav.scrollTop + (box.height - height) / 2).toFixed(1)}px)`
    indicator.dataset.ready = 'true'
  }

  function openDetail(id: number) {
    if (disposed) return
    detailId = id
    view?.destroy()
    view = null
    detail?.destroy()
    detail = mountPostDetailView(content, {
      postId: id, client: api, viewerId, nickname,
      onBack: () => {
        detail?.destroy()
        detail = null
        detailId = null
        show(tab)
      },
      notice,
    })
    heading.textContent = '足迹详情'
    subtitle.textContent = '点赞、评论，看看这段足迹背后的故事。'
    page.dataset.fpMode = 'detail'
    page.querySelector<HTMLElement>('[data-fp-back-top]')?.removeAttribute('hidden')
  }

  function show(name: Tab) {
    if (disposed) return
    tab = name
    page.dataset.fpMode = name
    heading.textContent = headings[name].title
    subtitle.textContent = headings[name].subtitle
    // 切换板块时清掉上一个板块留下的提示，避免"早先的报错"被误读成当前板块出问题。
    feedback.textContent = ''
    feedback.dataset.error = 'false'
    page.querySelector<HTMLElement>('[data-fp-back-top]')?.setAttribute('hidden', '')
    page.querySelectorAll<HTMLButtonElement>('[data-fp-tab]').forEach((button) => {
      if (button.dataset.fpTab === name) button.setAttribute('aria-current', 'page')
      else button.removeAttribute('aria-current')
    })
    view?.destroy()
    detail?.destroy()
    detail = null
    detailId = null
    view = mountView(name)
    syncNavIndicator()
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null
    const button = target?.closest<HTMLButtonElement>('[data-fp-tab]')
    if (button) { show(button.dataset.fpTab as Tab); return }
    if (target?.closest('[data-fp-back-top]') && detailId !== null) {
      detail?.destroy()
      detail = null
      detailId = null
      show(tab)
    }
  }

  // 点赞与评论需要知道“我是谁”，先取一次个人资料再渲染界面。
  const loadProfile = async () => {
    if (!options.profile) return
    try {
      const profile = await options.profile()
      if (disposed || !profile) return
      viewerId = profile.id
      nickname = profile.nickname
    } catch { /* 资料读取失败不阻塞足迹页面 */ }
  }

  page.addEventListener('click', onClick)
  // 窗口尺寸变化后指示条需要重新贴合当前项。
  const onResize = () => syncNavIndicator()
  window.addEventListener('resize', onResize)
  page.dataset.fpMode = tab
  show(tab)
  void loadProfile().then(() => {
    // 拿到身份后重挂载依赖 viewerId 的界面，保证点赞状态与本人标记正确。
    if (disposed || detailId !== null) return
    show(tab)
  })

  return {
    element: page,
    get hasOpenDialog() { return false },
    refresh: () => { if (disposed) return; if (detailId !== null) return; void view?.refresh?.() },
    focus() { page.querySelector<HTMLButtonElement>('[data-fp-tab][aria-current="page"]')?.focus() },
    destroy() {
      if (disposed) return
      disposed = true
      view?.destroy()
      detail?.destroy()
      page.removeEventListener('click', onClick)
      window.removeEventListener('resize', onResize)
      host.innerHTML = ''
    },
  }
}

export function createFootprintPageMarkup() {
  return `<section class="footprint-page" data-footprint-page hidden inert aria-label="音乐足迹">
    <aside class="fp-sidebar"><p class="fp-eyebrow">MUSIC FOOTPRINT / 音乐足迹</p>
      <nav class="fp-nav" aria-label="音乐足迹功能"><span class="fp-nav-rail" aria-hidden="true"></span><span class="fp-nav-indicator" data-fp-nav-indicator aria-hidden="true"></span>${tabs.map(({ id, label, english }, index) => `<button type="button" data-fp-tab="${id}"${index === 0 ? ' aria-current="page"' : ''}><em class="fp-nav-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</em><strong>${label}</strong><small>${english}</small><b aria-hidden="true">${uiIcons.open}</b></button>`).join('')}</nav>
      <p class="fp-sidebar-foot"><i></i> 听过、写过、分享过<br />都算数。</p></aside>
    <div class="fp-shell"><header class="fp-header"><div><p>PERSONAL TIMELINE / 个人音乐时间档案</p>
      <h2 data-fp-heading>音乐足迹时光轴</h2><span data-fp-subtitle>播放过的每一首歌，都会按时间留在这里。</span></div>
      <button type="button" class="fp-back-top" data-fp-back-top hidden>${uiIcons.left} 返回列表</button></header>
      <div class="fp-content" data-fp-content aria-live="polite"></div>
      <p class="fp-feedback" data-fp-feedback role="status">正在读取音乐足迹…</p></div>
  </section>`
}
