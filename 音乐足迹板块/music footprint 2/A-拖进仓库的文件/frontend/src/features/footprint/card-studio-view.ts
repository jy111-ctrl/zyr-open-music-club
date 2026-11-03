import { escapeHtml } from "../../shared/html.ts"
import { safeCoverUrl } from "../../shared/music.ts"
import type { FootprintEvent, MemoryCard } from "../../services/music/footprint.ts"
import { createCardSvg, downloadCardSvg } from "./card-art.ts"
import { dayLabel, formatClock, formatDate, formatDuration } from "./format.ts"

export type CardStudioView = { element: HTMLElement; refresh(): Promise<void>; destroy(): void }

const EVENT_LIMIT = 12
// 工坊一次读取的最多记录数，必须与后端 parsePage 的 maxLimit（50）一致。
// 之前写成 60，GET /timeline?limit=60 会被后端判为分页参数无效（400），
// Promise.all 整体失败，表现就是"没有可选择的足迹、卡片列表也是空的"。
const PICK_LIMIT = 50

// 界面三：回忆卡片工坊。挑几段足迹，生成一张可以保存、也可以分享出去的可视化卡片。
export function mountCardStudioView(host: HTMLElement, options: {
  client: { timeline: (limit: number, offset: number) => Promise<{ total: number; events: FootprintEvent[] }>
    createCard: (title: string, eventIds: number[]) => Promise<MemoryCard>
    cards: (limit: number, offset: number) => Promise<{ total: number; cards: MemoryCard[] }>
    deleteCard: (id: number) => Promise<unknown>
    myPosts: (limit: number, offset: number) => Promise<{ cardId: number }[]>
    publish: (cardId: number, caption: string) => Promise<number> }
  nickname?: string
  notice?: (message: string, error?: boolean) => void
  published?: () => void
}): CardStudioView {
  const section = document.createElement('section')
  section.className = 'fp-view fp-studio'
  section.setAttribute('aria-label', '回忆卡片工坊')
  host.append(section)

  let events: FootprintEvent[] = []
  let cards: MemoryCard[] = []
  let publishedCardIds = new Set<number>()
  let selected = new Set<number>()
  let title = '我的听歌回忆'
  let preview: MemoryCard | null = null
  let loading = false
  let busy = false
  let disposed = false

  const render = () => {
    if (disposed) return
    const picked = events.filter((event) => selected.has(event.id))
    section.innerHTML = `<header class="fp-view-header"><p>CARD STUDIO / 回忆卡片</p><h3>把一段日子做成卡片</h3>
      <span>最多挑选 ${EVENT_LIMIT} 段足迹，生成一张可保存、可分享的回忆卡片</span></header>
      <div class="fp-studio-body">
        <div class="fp-picker">
          <div class="fp-picker-head"><h4>选择听歌记录</h4><span>${selected.size}/${EVENT_LIMIT} 已选</span></div>
          <ul class="fp-picker-list">${events.slice(0, PICK_LIMIT).map((event) => `<li>
            <label><input type="checkbox" data-fp-pick="${event.id}"${selected.has(event.id) ? ' checked' : ''}${!selected.has(event.id) && selected.size >= EVENT_LIMIT ? ' disabled' : ''} />
              <img src="${escapeHtml(safeCoverUrl(event.coverUrl))}" alt="" loading="lazy" />
              <span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.artist)} · ${escapeHtml(dayLabel(event.playedAt))} ${escapeHtml(formatClock(event.playedAt))}</small></span></label></li>`).join('')
            || '<li class="fp-empty">还没有可选择的足迹</li>'}</ul>
        </div>
        <div class="fp-studio-side">
          <label class="fp-field"><span>卡片标题</span>
            <input type="text" maxlength="60" value="${escapeHtml(title)}" data-fp-title placeholder="例如：十月的晚风" /></label>
          <div class="fp-studio-actions">
            <button type="button" data-fp-generate${busy || !selected.size || loading ? ' disabled' : ''}>生成回忆卡片</button>
            ${preview ? `<button type="button" class="fp-ghost" data-fp-download>下载卡片</button>` : ''}
            ${preview && !publishedCardIds.has(preview.id) ? `<button type="button" class="fp-ghost" data-fp-share>分享到广场</button>` : ''}
            ${preview ? `<button type="button" class="fp-danger" data-fp-delete-card="${preview.id}">删除卡片</button>` : ''}
          </div>
          ${preview ? `<div class="fp-card-preview">${createCardSvg(preview, options.nickname || '')}</div>
            <dl class="fp-card-meta"><div><dt>覆盖时段</dt><dd>${escapeHtml(formatDate(preview.data.period.from))} — ${escapeHtml(formatDate(preview.data.period.to))}</dd></div>
            <div><dt>记录数</dt><dd>${preview.data.trackCount} 段 · ${escapeHtml(formatDuration(preview.data.totalDurationMs))}</dd></div>
            ${preview.data.highlight ? `<div><dt>听得最多</dt><dd>${escapeHtml(preview.data.highlight.title)} × ${preview.data.highlight.plays}</dd></div>` : ''}
            ${publishedCardIds.has(preview.id) ? '<div><dt>状态</dt><dd>已分享到广场</dd></div>' : ''}</dl>` : '<p class="fp-empty">勾选左侧记录后生成卡片，这里会出现预览。</p>'}
        </div>
      </div>
      <section class="fp-panel"><h4>我做过的卡片（${cards.length}）</h4>
        <div class="fp-card-shelf">${cards.map((card) => `<article class="fp-card-chip">
          <button type="button" data-fp-open-card="${card.id}"><span class="fp-card-mini">${createCardSvg(card, options.nickname || '')}</span>
          <strong>${escapeHtml(card.title)}</strong><small>${escapeHtml(formatDate(card.createdAt))} · ${card.data.trackCount} 段${publishedCardIds.has(card.id) ? ' · 已分享' : ''}</small></button></article>`).join('') || '<p class="fp-empty">还没有生成过卡片</p>'}</div></section>`
  }

  const load = async () => {
    if (disposed) return
    loading = true
    render()
    try {
      const [page, myCards, posts] = await Promise.all([
        options.client.timeline(PICK_LIMIT, 0),
        options.client.cards(30, 0),
        options.client.myPosts(50, 0),
      ])
      if (disposed) return
      events = page.events
      cards = myCards.cards
      publishedCardIds = new Set(posts.map((post) => post.cardId))
    } catch (error) {
      options.notice?.(error instanceof Error ? error.message : '卡片数据读取失败', true)
    } finally {
      loading = false
      render()
    }
  }

  const generate = async () => {
    if (busy || !selected.size) return
    busy = true
    render()
    try {
      const card = await options.client.createCard(title.trim() || '我的听歌回忆', [...selected])
      if (disposed) return
      preview = card
      cards = [card, ...cards.filter((item) => item.id !== card.id)]
      selected = new Set()
      options.notice?.('回忆卡片已生成')
    } catch (error) {
      options.notice?.(error instanceof Error ? error.message : '卡片生成失败', true)
    } finally {
      busy = false
      render()
    }
  }

  const share = async () => {
    if (!preview || busy) return
    const caption = window.prompt('写一句分享语（可以留空）', '') ?? null
    if (caption === null) return
    busy = true
    render()
    try {
      await options.client.publish(preview.id, caption.trim())
      if (disposed) return
      publishedCardIds = new Set([...publishedCardIds, preview.id])
      options.notice?.('已分享到足迹广场')
      options.published?.()
    } catch (error) {
      options.notice?.(error instanceof Error ? error.message : '分享失败', true)
    } finally {
      busy = false
      render()
    }
  }

  const removeCard = async () => {
    if (!preview || busy) return
    if (!window.confirm('删除这张回忆卡片？已分享的内容也会一起移除。')) return
    busy = true
    render()
    try {
      await options.client.deleteCard(preview.id)
      if (disposed) return
      cards = cards.filter((card) => card.id !== preview?.id)
      preview = null
      options.notice?.('卡片已删除')
      options.published?.()
    } catch (error) {
      options.notice?.(error instanceof Error ? error.message : '删除失败', true)
    } finally {
      busy = false
      render()
    }
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('[data-fp-generate]')) { void generate(); return }
    if (target?.closest('[data-fp-download]')) { if (preview) downloadCardSvg(preview, options.nickname || ''); return }
    if (target?.closest('[data-fp-share]')) { void share(); return }
    const remove = target?.closest<HTMLElement>('[data-fp-delete-card]')
    if (remove) { void removeCard(); return }
    const open = target?.closest<HTMLElement>('[data-fp-open-card]')
    if (open) {
      const card = cards.find((item) => item.id === Number(open.dataset.fpOpenCard))
      if (card) { preview = card; render() }
    }
  }

  const onChange = (event: Event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null
    if (input?.dataset.fpPick) {
      const id = Number(input.dataset.fpPick)
      if (input.checked) selected.add(id)
      else selected.delete(id)
      render()
      return
    }
    if (input?.dataset.fpTitle !== undefined) { title = input.value; }
  }

  section.addEventListener('click', onClick)
  section.addEventListener('change', onChange)
  section.addEventListener('input', onChange)
  render()
  void load()
  return {
    element: section,
    refresh: () => load(),
    destroy() {
      disposed = true
      section.removeEventListener('click', onClick)
      section.removeEventListener('change', onChange)
      section.removeEventListener('input', onChange)
      section.remove()
    },
  }
}
