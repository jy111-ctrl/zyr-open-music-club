import { escapeHtml } from "../../shared/html.ts"
import { uiIcons } from "../../shared/ui/icons.ts"
import { safeCoverUrl, type SearchItem } from "../../shared/music.ts"
import type { FootprintEvent } from "../../services/music/footprint.ts"
import { dayKey, dayLabel, formatClock, formatTrackDuration } from "./format.ts"

const PAGE_SIZE = 30

export type TimelineView = {
  element: HTMLElement
  refresh(): Promise<void>
  destroy(): void
}

// 界面一：音乐足迹时光轴。播放记录按天分组，每条都可以写下当时的心情。
export function mountTimelineView(host: HTMLElement, options: {
  client: { timeline: (limit: number, offset: number) => Promise<{ total: number; events: FootprintEvent[] }>
    saveNote: (eventId: number, content: string) => Promise<unknown>
    deleteNote: (eventId: number) => Promise<unknown> }
  play?: (song: SearchItem) => Promise<unknown>
  enqueue?: (song: SearchItem) => void
  notice?: (message: string, error?: boolean) => void
}): TimelineView {
  const section = document.createElement('section')
  section.className = 'fp-view fp-timeline'
  section.setAttribute('aria-label', '音乐足迹时光轴')
  host.append(section)

  let events: FootprintEvent[] = []
  let total = 0
  let loading = false
  let busy = false
  let disposed = false
  let editingId: number | null = null
  let drafts = new Map<number, string>()

  const render = () => {
    if (disposed) return
    const groups = new Map<string, FootprintEvent[]>()
    for (const event of events) {
      const key = dayKey(event.playedAt)
      const list = groups.get(key) || []
      list.push(event)
      groups.set(key, list)
    }
    const body = [...groups.entries()].map(([key, list]) => `<div class="fp-day">
      <div class="fp-day-marker"><i aria-hidden="true"></i><h4>${escapeHtml(dayLabel(list[0].playedAt))}</h4><span>${list.length} 段声音</span></div>
      <ol class="fp-day-list">${list.map((event) => renderEvent(event)).join('')}</ol>
    </div>`).join('')
    section.innerHTML = `<header class="fp-view-header"><p>TIMELINE / 时光轴</p>
      <h3>我的听歌足迹</h3>
      <span>${total} 条播放记录${loading ? ' · 读取中…' : ''}</span></header>
      ${body || '<p class="fp-empty">还没有足迹。去音乐库或搜索里播放一首歌，它会自己出现在时间轴上。</p>'}
      ${events.length < total ? `<button type="button" class="fp-more" data-fp-more${loading || busy ? ' disabled' : ''}>加载更早的足迹</button>` : ''}`
  }

  const renderEvent = (event: FootprintEvent) => {
    const editing = editingId === event.id
    const draft = drafts.get(event.id) ?? event.note?.content ?? ''
    const key = escapeHtml(event.trackKey)
    return `<li class="fp-entry${event.note ? ' has-note' : ''}">
      <span class="fp-entry-time">${escapeHtml(formatClock(event.playedAt))}</span>
      <span class="fp-entry-dot" aria-hidden="true"></span>
      <div class="fp-entry-card">
        <img src="${escapeHtml(safeCoverUrl(event.coverUrl))}" alt="" loading="lazy" />
        <div class="fp-entry-body">
          <strong>${escapeHtml(event.title)}</strong>
          <small>${escapeHtml(event.artist)}${event.album ? ` · ${escapeHtml(event.album)}` : ''}</small>
          <em>${escapeHtml(formatTrackDuration(event.durationMs))} · ${event.source === 'local' ? '本地' : '网易云'}</em>
          ${event.note && !editing ? `<blockquote class="fp-note">${escapeHtml(event.note.content)}<cite>随笔 · ${escapeHtml(formatClock(event.note.updatedAt))}</cite></blockquote>` : ''}
          ${editing ? `<form class="fp-note-form" data-fp-note-form="${event.id}">
            <textarea name="note" maxlength="1000" rows="3" aria-label="听歌随笔" placeholder="那一刻你在做什么？把心情写下来…">${escapeHtml(draft)}</textarea>
            <div class="fp-note-actions"><span>${(drafts.get(event.id) ?? event.note?.content ?? '').length}/1000</span>
              <button type="button" data-fp-note-cancel="${event.id}">取消</button>
              <button type="submit">保存随笔</button></div></form>` : ''}
        </div>
        <div class="fp-entry-actions">
          <button type="button" class="fp-icon" data-fp-play="${key}" aria-label="播放 ${escapeHtml(event.title)}" title="播放">${uiIcons.play}</button>
          <button type="button" class="fp-icon" data-fp-enqueue="${key}" aria-label="加入队列 ${escapeHtml(event.title)}" title="加入队列">${uiIcons.plus}</button>
          ${editing ? '' : `<button type="button" class="fp-text" data-fp-note-edit="${event.id}">${event.note ? '修改随笔' : '写随笔'}</button>`}
          ${event.note && !editing ? `<button type="button" class="fp-text" data-fp-note-delete="${event.id}">删除随笔</button>` : ''}
        </div>
      </div>
    </li>`
  }

  const toSong = (event: FootprintEvent): SearchItem => {
    const seconds = Math.floor(event.durationMs / 1000)
    return { key: event.trackKey, kind: 'song', source: event.source, sourceId: event.sourceId,
      title: event.title, artist: event.artist, album: event.album || '未归档',
      coverUrl: safeCoverUrl(event.coverUrl),
      duration: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
      year: '—', description: '' }
  }

  const load = async () => {
    if (disposed) return
    loading = true
    render()
    try {
      const page = await options.client.timeline(PAGE_SIZE, 0)
      if (disposed) return
      events = page.events
      total = page.total
    } catch (error) {
      options.notice?.(error instanceof Error ? error.message : '足迹读取失败', true)
    } finally {
      loading = false
      render()
    }
  }

  const loadMore = async () => {
    if (busy || loading || disposed) return
    busy = true
    render()
    try {
      const page = await options.client.timeline(PAGE_SIZE, events.length)
      if (disposed) return
      events = [...events, ...page.events]
      total = page.total
    } catch (error) {
      options.notice?.(error instanceof Error ? error.message : '足迹读取失败', true)
    } finally {
      busy = false
      render()
    }
  }

  const mutate = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return
    busy = true
    render()
    try {
      await action()
      if (disposed) return
      editingId = null
      await load()
      options.notice?.(message)
    } catch (error) {
      options.notice?.(error instanceof Error ? error.message : '保存失败，请重试', true)
    } finally {
      busy = false
      render()
    }
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('[data-fp-more]')) { void loadMore(); return }
    const edit = target?.closest<HTMLElement>('[data-fp-note-edit]')
    if (edit) { editingId = Number(edit.dataset.fpNoteEdit); render(); focusEditor(); return }
    const cancel = target?.closest<HTMLElement>('[data-fp-note-cancel]')
    if (cancel) { editingId = null; drafts.delete(Number(cancel.dataset.fpNoteCancel)); render(); return }
    const remove = target?.closest<HTMLElement>('[data-fp-note-delete]')
    if (remove) {
      const id = Number(remove.dataset.fpNoteDelete)
      void mutate(() => options.client.deleteNote(id), '随笔已删除')
      return
    }
    const play = target?.closest<HTMLElement>('[data-fp-play]')
    if (play) {
      const found = events.find((item) => item.trackKey === play.dataset.fpPlay)
      if (found) void options.play?.(toSong(found)).catch(() => options.notice?.('歌曲暂时无法播放', true))
      return
    }
    const enqueue = target?.closest<HTMLElement>('[data-fp-enqueue]')
    if (enqueue) {
      const found = events.find((item) => item.trackKey === enqueue.dataset.fpEnqueue)
      if (found) { options.enqueue?.(toSong(found)); options.notice?.('已加入播放队列') }
    }
  }

  const focusEditor = () => {
    const textarea = section.querySelector<HTMLTextAreaElement>('.fp-note-form textarea')
    textarea?.focus()
    if (textarea) textarea.selectionStart = textarea.value.length
  }

  const onInput = (event: Event) => {
    const textarea = event.target instanceof HTMLTextAreaElement ? event.target : null
    const form = textarea?.closest<HTMLFormElement>('[data-fp-note-form]')
    if (!textarea || !form) return
    const id = Number(form.dataset.fpNoteForm)
    drafts.set(id, textarea.value)
    const counter = form.querySelector<HTMLElement>('.fp-note-actions span')
    if (counter) counter.textContent = `${textarea.value.length}/1000`
  }

  const onSubmit = (event: SubmitEvent) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null
    if (!form?.hasAttribute('data-fp-note-form')) return
    event.preventDefault()
    const id = Number(form.dataset.fpNoteForm)
    const content = new FormData(form).get('note')?.toString().trim() || ''
    if (!content) { options.notice?.('随笔内容不能为空', true); return }
    if (content.length > 1000) { options.notice?.('随笔最多 1000 个字', true); return }
    drafts.delete(id)
    void mutate(() => options.client.saveNote(id, content), '随笔已保存到这条足迹')
  }

  section.addEventListener('click', onClick)
  section.addEventListener('input', onInput)
  section.addEventListener('submit', onSubmit)
  render()
  void load()

  return {
    element: section,
    refresh: () => load(),
    destroy() {
      disposed = true
      section.removeEventListener('click', onClick)
      section.removeEventListener('input', onInput)
      section.removeEventListener('submit', onSubmit)
      section.remove()
    },
  }
}
