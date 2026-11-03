import type { MusicSource } from "../../shared/music.ts"

// 音乐足迹：一次播放就是一条足迹，随笔、回忆卡片与广场分享都建立在它之上。
export type FootprintEvent = {
  id: number
  source: MusicSource
  sourceId: string
  trackKey: string
  title: string
  artist: string
  album: string | null
  coverUrl: string | null
  durationMs: number
  playedAt: string
  note: { id: number; content: string; updatedAt: string } | null
}

export type FootprintMilestone = {
  totalPlays: number
  totalDurationMs: number
  distinctTracks: number
  distinctArtists: number
  firstPlayedAt: string | null
  lastPlayedAt: string | null
  activeDays: number
  streakDays: number
  busiestDay: { date: string; plays: number } | null
  noteCount: number
  hourly: number[]
  monthly: { month: string; plays: number; durationMs: number }[]
  topTracks: { title: string; artist: string; coverUrl: string | null; source: MusicSource; sourceId: string; trackKey: string; plays: number; durationMs: number }[]
}

export type MemoryCard = {
  id: number
  title: string
  eventIds: number[]
  data: {
    period: { from: string; to: string }
    trackCount: number
    totalDurationMs: number
    tracks: { title: string; artist: string; album: string | null; coverUrl: string | null; playedAt: string; source: MusicSource; sourceId: string }[]
    notes: { content: string; title: string; playedAt: string }[]
    highlight: { title: string; artist: string; plays: number } | null
  }
  createdAt: string
}

// 广场/我的分享列表里带的卡片摘要，够画缩略图即可。
export type FootprintPostCard = {
  title: string
  trackCount: number
  totalDurationMs: number
  period: { from: string; to: string } | null
  highlight: { title: string; artist: string; plays: number } | null
  tracks: { title: string; artist: string }[]
}

export type FootprintPost = {
  id: number
  cardId: number
  authorId: number
  authorNickname: string
  caption: string
  createdAt: string
  likeCount: number
  commentCount: number
  liked: boolean
  card?: FootprintPostCard | null
}

export type FootprintOverview = {
  posts: number
  likes: number
  comments: number
  authors: number
}

export type FootprintComment = {
  id: number
  postId: number
  authorId: number
  authorNickname: string
  content: string
  createdAt: string
}

// 播放器只提供 "3:45" 这样的时长文本，上报前换算成毫秒；无法解析时记 0。
export function durationToMs(text: string): number {
  const parts = String(text || '').split(':').map(Number)
  if (parts.some((value) => !Number.isFinite(value))) return 0
  const [minutes, seconds] = parts.length === 2 ? parts : [0, parts[0] ?? 0]
  return Math.max(0, Math.round((minutes * 60 + seconds) * 1000))
}

export class FootprintError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

export function createFootprintClient(fetcher: Fetcher = globalThis.fetch.bind(globalThis)) {
  const request = async <T>(url: string, method = 'GET', body?: object): Promise<T> => {
    const headers: Record<string, string> = {}
    if (method !== 'GET') {
      const token = await request<{ csrfToken: string }>('/api/security/csrf-token')
      if (!token.csrfToken) throw new Error('无法建立安全会话，请重新登录')
      headers['X-CSRF-Token'] = token.csrfToken
      headers['Content-Type'] = 'application/json'
    }
    let response
    try {
      response = await fetcher(url, { method, credentials: 'same-origin', cache: 'no-store', headers,
        ...(body ? { body: JSON.stringify(body) } : {}) })
    } catch { throw new Error('无法连接服务器，请稍后重试') }
    if (!response.ok) {
      // 优先使用后端给出的具体原因（例如"分页参数无效"），否则按状态码兜底。
      let serverMessage = ''
      try {
        const payload = await response.json() as { message?: unknown }
        if (payload && typeof payload.message === 'string') serverMessage = payload.message.trim()
      } catch { /* 响应不是 JSON 时忽略 */ }
      const messages: Record<number, string> = { 400: '提交内容无效，请检查后重试', 401: '登录已失效，请重新登录',
        403: '权限或安全校验失败，请刷新后重试', 404: '内容已不存在，请刷新列表',
        409: '内容已存在或状态发生变化，请刷新列表', 429: '操作过于频繁，请稍后重试' }
      throw new FootprintError(serverMessage || messages[response.status] || '保存或读取失败，请稍后重试', response.status)
    }
    try { return await response.json() as T } catch { throw new Error('服务器响应异常，请稍后重试') }
  }

  return {
    // 播放开始后由播放器自动调用；失败不影响当前播放。
    report: async (track: { source: MusicSource; sourceId: string; title: string; artist: string; album?: string | null; durationMs: number; coverUrl?: string | null }) =>
      request<{ eventId: number }>('/api/footprint/events', 'POST', {
        source: track.source,
        sourceId: track.sourceId,
        title: track.title,
        artist: track.artist,
        album: track.album ?? '',
        coverUrl: track.coverUrl ?? '',
        durationMs: Number.isFinite(track.durationMs) && track.durationMs > 0 ? Math.round(track.durationMs) : 0,
      }),
    timeline: async (limit = 30, offset = 0) =>
      (await request<{ total: number; events: FootprintEvent[] }>(`/api/footprint/timeline?limit=${limit}&offset=${offset}`)),
    saveNote: (eventId: number, content: string) => request(`/api/footprint/events/${eventId}/note`, 'PUT', { content }),
    deleteNote: (eventId: number) => request(`/api/footprint/events/${eventId}/note`, 'DELETE'),
    milestone: async () => (await request<{ milestone: FootprintMilestone }>('/api/footprint/milestone')).milestone,
    cards: async (limit = 30, offset = 0) =>
      (await request<{ total: number; cards: MemoryCard[] }>(`/api/footprint/cards?limit=${limit}&offset=${offset}`)),
    createCard: async (title: string, eventIds: number[]) =>
      (await request<{ card: MemoryCard }>('/api/footprint/cards', 'POST', { title, eventIds })).card,
    deleteCard: (id: number) => request(`/api/footprint/cards/${id}`, 'DELETE'),
    posts: async (limit = 20, offset = 0) =>
      (await request<{ total: number; posts: FootprintPost[] }>(`/api/footprint/posts?limit=${limit}&offset=${offset}`)),
    overview: async () =>
      (await request<{ overview: FootprintOverview }>('/api/footprint/overview')).overview,
    myPosts: async (limit = 30, offset = 0) =>
      (await request<{ posts: FootprintPost[] }>(`/api/footprint/posts/mine?limit=${limit}&offset=${offset}`)).posts,
    publish: async (cardId: number, caption: string) =>
      (await request<{ postId: number }>('/api/footprint/posts', 'POST', { cardId, caption })).postId,
    post: async (id: number) => (await request<{
      post: FootprintPost
      card: Pick<MemoryCard, 'id' | 'title' | 'data' | 'createdAt'> | null
      comments: FootprintComment[]
      canDelete: boolean
    }>(`/api/footprint/posts/${id}`)),
    deletePost: (id: number) => request(`/api/footprint/posts/${id}`, 'DELETE'),
    setLiked: async (id: number, liked: boolean) =>
      (await request<{ likeCount: number }>(`/api/footprint/posts/${id}/like`, liked ? 'PUT' : 'DELETE')).likeCount,
    addComment: (postId: number, content: string) =>
      request(`/api/footprint/posts/${postId}/comments`, 'POST', { content }),
    deleteComment: (id: number) => request(`/api/footprint/comments/${id}`, 'DELETE'),
  }
}
