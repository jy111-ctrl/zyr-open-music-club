import { escapeHtml } from "../../shared/html.ts"
import { uiIcons } from "../../shared/ui/icons.ts"
import type { FootprintPost } from "../../services/music/footprint.ts"
import { formatRelative } from "./format.ts"

export type MyPostsView = { element: HTMLElement; refresh(): Promise<void>; destroy(): void }

// 界面六：我分享出去的足迹。可以在这里打开详情看评论，也可以撤下分享。
export function mountMyPostsView(host: HTMLElement, options: {
  client: { myPosts: (limit: number, offset: number) => Promise<FootprintPost[]>
    deletePost: (id: number) => Promise<unknown> }
  openPost: (id: number) => void
  notice?: (message: string, error?: boolean) => void
  changed?: () => void
}): MyPostsView {
  const section = document.createElement('section')
  section.className = 'fp-view fp-mine'
  section.setAttribute('aria-label', '我的分享')
  host.append(section)
  let posts: FootprintPost[] = []
  let loading = false
  let busy = false
  let disposed = false

  const render = () => {
    if (disposed) return
    const likes = posts.reduce((sum, post) => sum + post.likeCount, 0)
    const comments = posts.reduce((sum, post) => sum + post.commentCount, 0)
    section.innerHTML = `<header class="fp-view-header"><p>MY SHARES / 我的分享</p><h3>我分享出去的足迹</h3>
      <span>${posts.length} 份${loading ? ' · 读取中…' : ''}</span></header>
      ${posts.length ? `<div class="fp-overview">
        <div><b>${posts.length}</b><span>份分享</span></div>
        <div><b>${likes}</b><span>次赞</span></div>
        <div><b>${comments}</b><span>条评论</span></div></div>` : ''}
      <ul class="fp-mine-list">${posts.map((post) => `<li>
        <span class="fp-mine-badge"><b>${post.card?.trackCount ?? '—'}</b><small>段</small></span>
        <div><strong>${escapeHtml(post.caption || '分享了一段音乐足迹')}</strong>
          <small>${escapeHtml(post.card?.title || '音乐足迹')} · ${escapeHtml(formatRelative(post.createdAt))} · ${post.likeCount} 赞 · ${post.commentCount} 评论</small></div>
        <div class="fp-mine-actions"><button type="button" class="fp-text" data-fp-open="${post.id}">查看详情</button>
          <button type="button" class="fp-danger" data-fp-remove="${post.id}"${busy ? ' disabled' : ''}>撤下</button></div></li>`).join('')
      || `<li class="fp-empty">${loading ? '正在读取…' : '还没有分享过足迹。在「回忆卡片」里生成卡片后可以分享到广场。'}</li>`}</ul>
      <p class="fp-mine-foot">${uiIcons.open} 撤下分享不会删除卡片本身，卡片仍留在回忆卡片里。</p>`
  }

  const load = async () => {
    if (disposed) return
    loading = true
    render()
    try {
      const list = await options.client.myPosts(30, 0)
      if (disposed) return
      posts = list
    } catch (error) {
      options.notice?.(error instanceof Error ? error.message : '读取失败', true)
    } finally {
      loading = false
      render()
    }
  }

  const remove = async (id: number) => {
    if (busy) return
    if (!window.confirm('撤下这条分享？其他人将无法再看到它。')) return
    busy = true
    render()
    try {
      await options.client.deletePost(id)
      if (disposed) return
      posts = posts.filter((post) => post.id !== id)
      options.notice?.('分享已撤下')
      options.changed?.()
    } catch (error) {
      options.notice?.(error instanceof Error ? error.message : '操作失败', true)
    } finally {
      busy = false
      render()
    }
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null
    const open = target?.closest<HTMLElement>('[data-fp-open]')
    if (open) { options.openPost(Number(open.dataset.fpOpen)); return }
    const removeButton = target?.closest<HTMLElement>('[data-fp-remove]')
    if (removeButton) void remove(Number(removeButton.dataset.fpRemove))
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
