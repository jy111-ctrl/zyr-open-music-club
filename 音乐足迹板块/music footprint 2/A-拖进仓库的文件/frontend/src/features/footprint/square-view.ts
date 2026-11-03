import { escapeHtml } from "../../shared/html.ts"
import { uiIcon } from "../../shared/ui/icons.ts"
import type { FootprintOverview, FootprintPost } from "../../services/music/footprint.ts"
import { formatDate, formatRelative } from "./format.ts"

export type SquareView = { element: HTMLElement; refresh(): Promise<void>; destroy(): void }

const PAGE_SIZE = 12

// 把卡片周期压成 "2026.10.17 — 10.20" 这种短标签，广场卡片上只有一行位置。
function shortPeriod(period: { from: string; to: string } | null | undefined): string {
  if (!period?.from || !period?.to) return ''
  const from = formatDate(period.from)
  const to = formatDate(period.to)
  if (!from || !to) return ''
  if (from === to) return from
  // 同年同月时后半段只留日期，避免一行放不下。
  const tail = from.slice(0, 7) === to.slice(0, 7) ? to.slice(-5).trim() : to
  return `${from} — ${tail}`
}

// 同一张卡片缩略图用一套配色，不同分享之间错开，广场一眼看过去不会糊成一片。
const VISUAL_PALETTES = [
  'linear-gradient(128deg,#d9a153 0%,#b77922 46%,#7d5a2c 100%)',
  'linear-gradient(128deg,#9db3c0 0%,#6d8fa3 46%,#42596b 100%)',
  'linear-gradient(128deg,#c8a3a0 0%,#a3736e 46%,#6d4641 100%)',
  'linear-gradient(128deg,#adb99b 0%,#7f9469 46%,#4c5c40 100%)',
]

// 界面四：足迹广场。所有成员分享出来的音乐足迹都能在这里浏览、点赞和评论。
export function mountSquareView(host: HTMLElement, options: {
  client: { posts: (limit: number, offset: number) => Promise<{ total: number; posts: FootprintPost[] }>
    setLiked: (id: number, liked: boolean) => Promise<number>
    overview?: () => Promise<FootprintOverview> }
  viewerId?: number
  openPost: (id: number) => void
  notice?: (message: string, error?: boolean) => void
}): SquareView {
  const section = document.createElement('section')
  section.className = 'fp-view fp-square'
  section.setAttribute('aria-label', '足迹广场')
  host.append(section)
  let posts: FootprintPost[] = []
  let total = 0
  let overview: FootprintOverview | null = null
  let loading = false
  let busy = false
  let likedBusy = false
  let disposed = false

  const overviewMarkup = () => {
    if (!overview) return ''
    const items: { value: number; label: string }[] = [
      { value: overview.posts, label: '份分享' },
      { value: overview.likes, label: '次赞' },
      { value: overview.comments, label: '条评论' },
      { value: overview.authors, label: '位成员' },
    ]
    return `<div class="fp-overview">${items.map(({ value, label }) => `<div>
      <b>${value}</b><span>${label}</span></div>`).join('')}</div>`
  }

  const visual = (post: FootprintPost) => {
    const card = post.card
    if (!card) return ''
    const period = shortPeriod(card.period)
    const tracks = card.tracks.slice(0, 2).map((track) => `<i>${escapeHtml(track.title)}</i>`).join('')
    const palette = VISUAL_PALETTES[Math.abs(post.id) % VISUAL_PALETTES.length]
    return `<span class="fp-post-visual" style="background:${palette}">
      <span class="fp-post-visual-count"><b>${card.trackCount}</b><small>段声音</small></span>
      ${period ? `<span class="fp-post-visual-period">${escapeHtml(period)}</span>` : ''}
      ${tracks ? `<span class="fp-post-visual-tracks">${tracks}</span>` : ''}
    </span>`
  }

  const render = () => {
    if (disposed) return
    section.innerHTML = `<header class="fp-view-header"><p>SQUARE / 足迹广场</p><h3>大家分享的音乐足迹</h3>
      <span>${total} 份公开足迹${loading ? ' · 读取中…' : ''}</span></header>
      ${overviewMarkup()}
      <div class="fp-square-grid">${posts.map((post) => `<article class="fp-post-card">
        <header><span class="fp-post-author">${escapeHtml(post.authorNickname)}${post.authorId === options.viewerId ? ' · 我' : ''}</span>
          <time>${escapeHtml(formatRelative(post.createdAt))}</time></header>
        <button type="button" class="fp-post-open" data-fp-open="${post.id}">
          ${visual(post)}
          <strong>${escapeHtml(post.caption || '分享了一段音乐足迹')}</strong>
          <span class="fp-post-meta">${post.likeCount} 次赞 · ${post.commentCount} 条评论</span>
          <em>查看卡片与评论 →</em></button>
        <footer><button type="button" class="fp-like${post.liked ? ' is-liked' : ''}" data-fp-like="${post.id}" aria-pressed="${post.liked}"
          aria-label="${post.liked ? '取消赞' : '点赞'}">${uiIcon('heart', post.liked)} <span>${post.likeCount}</span></button>
          <button type="button" class="fp-text" data-fp-open="${post.id}">${post.commentCount} 条评论</button></footer>
      </article>`).join('') || `<p class="fp-empty">${loading ? '正在读取广场…' : '还没有人分享足迹。在「回忆卡片」里生成一张卡片，就能分享到这里。'}</p>`}</div>
      ${posts.length < total ? `<button type="button" class="fp-more" data-fp-more${loading || busy ? ' disabled' : ''}>看看更多</button>` : ''}`
  }

  const load = async () => {
    if (disposed) return
    loading = true
    render()
    try {
      const [page, summary] = await Promise.all([
        options.client.posts(PAGE_SIZE, 0),
        // 统计条是锦上添花，取不到不影响列表。
        options.client.overview ? options.client.overview().catch(() => null) : Promise.resolve(null),
      ])
      if (disposed) return
      posts = page.posts
      total = page.total
      overview = summary
    } catch (error) {
      options.notice?.(error instanceof Error ? error.message : '广场读取失败', true)
    } finally {
      loading = false
      render()
    }
  }

  const more = async () => {
    if (busy || loading) return
    busy = true
    render()
    try {
      const page = await options.client.posts(PAGE_SIZE, posts.length)
      if (disposed) return
      posts = [...posts, ...page.posts]
      total = page.total
    } catch (error) {
      options.notice?.(error instanceof Error ? error.message : '广场读取失败', true)
    } finally {
      busy = false
      render()
    }
  }

  const toggleLike = async (id: number, liked: boolean) => {
    if (likedBusy) return
    likedBusy = true
    try {
      const count = await options.client.setLiked(id, liked)
      if (disposed) return
      posts = posts.map((post) => post.id === id ? { ...post, liked, likeCount: count } : post)
      if (overview) overview = { ...overview, likes: Math.max(0, overview.likes + (liked ? 1 : -1)) }
    } catch (error) {
      options.notice?.(error instanceof Error ? error.message : '操作失败，请重试', true)
    } finally {
      likedBusy = false
      render()
    }
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('[data-fp-more]')) { void more(); return }
    const like = target?.closest<HTMLElement>('[data-fp-like]')
    if (like) {
      const id = Number(like.dataset.fpLike)
      const post = posts.find((item) => item.id === id)
      if (post) void toggleLike(id, !post.liked)
      return
    }
    const open = target?.closest<HTMLElement>('[data-fp-open]')
    if (open) options.openPost(Number(open.dataset.fpOpen))
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
