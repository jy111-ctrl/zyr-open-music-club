import { escapeHtml } from "../../shared/html.ts"
import { uiIcon, uiIcons } from "../../shared/ui/icons.ts"
import type { FootprintComment, FootprintPost, MemoryCard } from "../../services/music/footprint.ts"
import { createCardSvg, downloadCardSvg } from "./card-art.ts"
import { formatRelative } from "./format.ts"

export type PostDetailView = { element: HTMLElement; destroy(): void }

// 界面五：足迹详情。别人分享的卡片在这里被完整看到，可以点赞、写下评论。
export function mountPostDetailView(host: HTMLElement, options: {
  postId: number
  client: { post: (id: number) => Promise<{ post: FootprintPost; card: Pick<MemoryCard, 'id' | 'title' | 'data' | 'createdAt'> | null
      comments: FootprintComment[]; canDelete: boolean }>
    setLiked: (id: number, liked: boolean) => Promise<number>
    addComment: (postId: number, content: string) => Promise<unknown>
    deleteComment: (id: number) => Promise<unknown>
    deletePost: (id: number) => Promise<unknown> }
  viewerId?: number
  nickname?: string
  onBack: () => void
  notice?: (message: string, error?: boolean) => void
  changed?: () => void
}): PostDetailView {
  const section = document.createElement('section')
  section.className = 'fp-view fp-detail'
  section.setAttribute('aria-label', '足迹分享详情')
  host.append(section)

  let data: { post: FootprintPost; card: Pick<MemoryCard, 'id' | 'title' | 'data' | 'createdAt'> | null
    comments: FootprintComment[]; canDelete: boolean } | null = null
  let loading = false
  let busy = false
  let disposed = false

  const render = () => {
    if (disposed) return
    if (!data) {
      section.innerHTML = `<header class="fp-view-header"><p>DETAIL / 足迹详情</p><h3>正在读取…</h3></header>
        <p class="fp-empty">${loading ? '正在读取这条分享…' : '这条分享已不存在'}</p>
        <div class="fp-detail-back"><button type="button" data-fp-back>返回</button></div>`
      return
    }
    const { post, card, comments } = data
    section.innerHTML = `<header class="fp-view-header fp-detail-head"><button type="button" class="fp-back" data-fp-back>${uiIcons.left} 返回</button>
      <div><p>DETAIL / 足迹详情</p><h3>${escapeHtml(card?.title || '音乐足迹')}</h3>
      <span>${escapeHtml(post.authorNickname)} · ${escapeHtml(formatRelative(post.createdAt))}</span></div>
      ${data.canDelete ? `<button type="button" class="fp-danger" data-fp-delete-post>删除分享</button>` : ''}</header>
      ${post.caption ? `<p class="fp-detail-caption">${escapeHtml(post.caption)}</p>` : ''}
      <div class="fp-detail-body">
        <div class="fp-detail-card">${card ? createCardSvg(card, options.nickname || '') : '<p class="fp-empty">卡片已被作者删除</p>'}
          ${card ? '<div class="fp-detail-card-actions"><button type="button" class="fp-ghost" data-fp-download>下载卡片</button></div>' : ''}</div>
        <div class="fp-comments">
          <div class="fp-comment-head"><h4>评论 ${comments.length}</h4>
            <button type="button" class="fp-like${post.liked ? ' is-liked' : ''}" data-fp-like aria-pressed="${post.liked}"
              aria-label="${post.liked ? '取消赞' : '点赞'}">${uiIcon('heart', post.liked)} <span>${post.likeCount}</span></button></div>
          <ol class="fp-comment-list">${comments.map((comment) => `<li>
            <div><strong>${escapeHtml(comment.authorNickname)}</strong><time>${escapeHtml(formatRelative(comment.createdAt))}</time></div>
            <p>${escapeHtml(comment.content)}</p>
            ${comment.authorId === options.viewerId ? `<button type="button" class="fp-text" data-fp-delete-comment="${comment.id}">删除</button>` : ''}
          </li>`).join('') || '<li class="fp-empty">还没有评论，来说点什么吧。</li>'}</ol>
          <form class="fp-comment-form" data-fp-comment-form>
            <textarea name="content" maxlength="300" rows="2" placeholder="写一句评论…" aria-label="评论内容"></textarea>
            <div class="fp-comment-actions"><span data-fp-comment-count>0/300</span><button type="submit"${busy ? ' disabled' : ''}>发送</button></div></form>
        </div>
      </div>`
  }

  const load = async () => {
    if (disposed) return
    loading = true
    render()
    try {
      const detail = await options.client.post(options.postId)
      if (disposed) return
      data = detail
    } catch (error) {
      options.notice?.(error instanceof Error ? error.message : '分享读取失败', true)
    } finally {
      loading = false
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
      await load()
      options.notice?.(message)
      options.changed?.()
    } catch (error) {
      options.notice?.(error instanceof Error ? error.message : '操作失败，请重试', true)
    } finally {
      busy = false
      render()
    }
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('[data-fp-back]')) { options.onBack(); return }
    if (target?.closest('[data-fp-download]')) {
      if (data?.card) downloadCardSvg(data.card, options.nickname || '')
      return
    }
    if (target?.closest('[data-fp-like]') && data) {
      const liked = !data.post.liked
      void mutate(async () => {
        const count = await options.client.setLiked(data!.post.id, liked)
        if (data) data = { ...data, post: { ...data.post, liked, likeCount: count } }
      }, liked ? '已点赞' : '已取消赞')
      return
    }
    const removeComment = target?.closest<HTMLElement>('[data-fp-delete-comment]')
    if (removeComment) {
      void mutate(() => options.client.deleteComment(Number(removeComment.dataset.fpDeleteComment)), '评论已删除')
      return
    }
    if (target?.closest('[data-fp-delete-post]')) {
      if (!window.confirm('删除这条分享？评论也会一并移除。')) return
      void mutate(async () => {
        await options.client.deletePost(options.postId)
        options.onBack()
      }, '分享已删除')
    }
  }

  const onInput = (event: Event) => {
    const textarea = event.target instanceof HTMLTextAreaElement ? event.target : null
    if (!textarea?.closest('[data-fp-comment-form]')) return
    const counter = section.querySelector<HTMLElement>('[data-fp-comment-count]')
    if (counter) counter.textContent = `${textarea.value.length}/300`
  }

  const onSubmit = (event: SubmitEvent) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null
    if (!form?.hasAttribute('data-fp-comment-form')) return
    event.preventDefault()
    const content = new FormData(form).get('content')?.toString().trim() || ''
    if (!content) { options.notice?.('评论内容不能为空', true); return }
    void mutate(() => options.client.addComment(options.postId, content), '评论已发布')
  }

  section.addEventListener('click', onClick)
  section.addEventListener('input', onInput)
  section.addEventListener('submit', onSubmit)
  render()
  void load()
  return {
    element: section,
    destroy() {
      disposed = true
      section.removeEventListener('click', onClick)
      section.removeEventListener('input', onInput)
      section.removeEventListener('submit', onSubmit)
      section.remove()
    },
  }
}
