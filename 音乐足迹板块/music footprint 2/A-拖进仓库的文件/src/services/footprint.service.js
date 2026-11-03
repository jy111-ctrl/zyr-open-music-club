const repository = require('../db/footprint')

const DEFAULT_TIMEZONE_OFFSET_MINUTES = 480
const CARD_TRACK_LIMIT = 6
const CARD_NOTE_LIMIT = 3

// SQLite 的 CURRENT_TIMESTAMP 保存的是 UTC，展示时要按站点时区换算。
// 偏移只能是整数分钟，拼接进 SQL 前先校验，避免注入。
function timezoneModifier(offsetMinutes = DEFAULT_TIMEZONE_OFFSET_MINUTES) {
  const value = Number(offsetMinutes)
  if (!Number.isSafeInteger(value) || value < -1440 || value > 1440) {
    return `'+${DEFAULT_TIMEZONE_OFFSET_MINUTES} minutes'`
  }
  return `'${value >= 0 ? '+' : '-'}${Math.abs(value)} minutes'`
}

// 只保留纯文本字段，歌曲封面地址沿用前端同一套白名单规则。
function sanitizeCoverUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const cover = value.trim()
  if (/^\/api\/local\/music\/[1-9]\d*\/cover$/.test(cover)) return cover
  try {
    const url = new URL(cover)
    if ((url.protocol === 'https:' || url.protocol === 'http:')
      && (url.hostname === 'music.126.net' || url.hostname.endsWith('.music.126.net'))) {
      url.protocol = 'https:'
      return url.href
    }
  } catch { return null }
  return null
}

function toEvent(row) {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    trackKey: `${row.source}:${row.source_id}`,
    title: row.title,
    artist: row.artist,
    album: row.album,
    coverUrl: row.cover_url,
    durationMs: row.duration_ms,
    playedAt: row.played_at,
    note: row.note_content === undefined || row.note_content === null
      ? null
      : { id: row.note_id, content: row.note_content, updatedAt: row.note_updated_at },
  }
}

function toCard(row) {
  return {
    id: row.id,
    title: row.title,
    eventIds: JSON.parse(row.event_ids_json),
    data: JSON.parse(row.card_data_json),
    createdAt: row.created_at,
  }
}

// 列表里的卡片只带摘要字段：够画缩略图，又不至于把整张卡片塞进每条记录。
function toPostCard(row) {
  if (!row.card_title || !row.card_data_json) return null
  let data = null
  try { data = JSON.parse(row.card_data_json) } catch { return null }
  if (!data) return null
  const tracks = Array.isArray(data.tracks) ? data.tracks : []
  return {
    title: row.card_title,
    trackCount: Number(data.trackCount) || tracks.length,
    totalDurationMs: Number(data.totalDurationMs) || 0,
    period: data.period ?? null,
    highlight: data.highlight ?? null,
    tracks: tracks.slice(0, 3).map((track) => ({ title: track.title, artist: track.artist })),
  }
}

function toPost(row) {
  return {
    id: row.id,
    cardId: row.card_id,
    authorId: row.user_id,
    authorNickname: row.author_nickname,
    caption: row.caption,
    createdAt: row.created_at,
    likeCount: row.like_count ?? 0,
    commentCount: row.comment_count ?? 0,
    liked: Boolean(row.liked),
    card: toPostCard(row),
  }
}

// 连续天数：把去重后的日期从最新往前走，断一天就停。
// today 必须与 days 使用同一时区，否则跨日边界时会算错。
function computeStreak(dates, today) {
  if (!dates.length) return 0
  const unique = [...new Set(dates)].sort().reverse()
  const shift = (date, days) => {
    const value = new Date(`${date}T00:00:00Z`)
    value.setUTCDate(value.getUTCDate() - days)
    return value.toISOString().slice(0, 10)
  }
  // 今天还没听歌不算断签，从昨天开始也能接上。
  const anchor = unique[0] === today || unique[0] === shift(today, 1) ? unique[0] : null
  if (!anchor) return 0
  let streak = 0
  let cursor = anchor
  for (const date of unique) {
    if (date !== cursor) break
    streak += 1
    cursor = shift(cursor, 1)
  }
  return streak
}

function createFootprintService({ database, timezoneOffsetMinutes = DEFAULT_TIMEZONE_OFFSET_MINUTES } = {}) {
  const modifier = timezoneModifier(timezoneOffsetMinutes)
  const offset = Number.isSafeInteger(Number(timezoneOffsetMinutes))
    ? Number(timezoneOffsetMinutes)
    : DEFAULT_TIMEZONE_OFFSET_MINUTES
  // 站点时区的“今天”，与 SQL 里使用的偏移保持一致。
  const today = () => new Date(Date.now() + offset * 60_000).toISOString().slice(0, 10)

  function recordPlayback(userId, payload) {
    const event = {
      source: payload.source,
      sourceId: payload.sourceId,
      title: payload.title,
      artist: payload.artist || '未知艺术家',
      album: payload.album || null,
      coverUrl: sanitizeCoverUrl(payload.coverUrl),
      durationMs: payload.durationMs,
    }
    return repository.addEvent(database, userId, event)
  }

  function timeline(userId, limit, offset) {
    return {
      total: repository.countEvents(database, userId),
      events: repository.listEvents(database, userId, limit, offset).map(toEvent),
    }
  }

  function milestone(userId) {
    const local = `datetime(played_at, ${modifier})`
    const totals = database.prepare(`SELECT COUNT(*) AS plays,
      COALESCE(SUM(duration_ms), 0) AS duration_ms,
      COUNT(DISTINCT source || ':' || source_id) AS tracks,
      COUNT(DISTINCT artist) AS artists,
      MIN(played_at) AS first_at, MAX(played_at) AS last_at
      FROM playback_events WHERE user_id = ?`).get(userId)
    const days = database.prepare(`SELECT date(${local}) AS day, COUNT(*) AS plays
      FROM playback_events WHERE user_id = ? GROUP BY day ORDER BY day DESC`).all(userId)
    const topTracks = database.prepare(`SELECT title, artist, cover_url, source, source_id,
      COUNT(*) AS plays, COALESCE(SUM(duration_ms), 0) AS duration_ms
      FROM playback_events WHERE user_id = ?
      GROUP BY source, source_id, title, artist
      ORDER BY plays DESC, duration_ms DESC, id DESC LIMIT 5`).all(userId)
    const hourlyRows = database.prepare(`SELECT CAST(strftime('%H', ${local}) AS INTEGER) AS hour,
      COUNT(*) AS plays FROM playback_events WHERE user_id = ? GROUP BY hour`).all(userId)
    const monthly = database.prepare(`SELECT strftime('%Y-%m', ${local}) AS month,
      COUNT(*) AS plays, COALESCE(SUM(duration_ms), 0) AS duration_ms
      FROM playback_events WHERE user_id = ?
      GROUP BY month ORDER BY month DESC LIMIT 12`).all(userId)
    const notes = database.prepare(`SELECT COUNT(*) AS count FROM footprint_notes WHERE user_id = ?`).get(userId)
    const hourly = Array.from({ length: 24 }, (_, hour) => {
      const row = hourlyRows.find((item) => Number(item.hour) === hour)
      return row ? Number(row.plays) : 0
    })
    const busiest = days.reduce((best, day) => (day.plays > (best?.plays ?? 0) ? day : best), null)
    return {
      totalPlays: Number(totals.plays),
      totalDurationMs: Number(totals.duration_ms),
      distinctTracks: Number(totals.tracks),
      distinctArtists: Number(totals.artists),
      firstPlayedAt: totals.first_at,
      lastPlayedAt: totals.last_at,
      activeDays: days.length,
      streakDays: computeStreak(days.map((day) => day.day), today()),
      busiestDay: busiest ? { date: busiest.day, plays: Number(busiest.plays) } : null,
      noteCount: Number(notes.count),
      hourly,
      monthly: monthly.map((row) => ({ month: row.month, plays: Number(row.plays), durationMs: Number(row.duration_ms) })).reverse(),
      topTracks: topTracks.map((row) => ({
        title: row.title, artist: row.artist, coverUrl: row.cover_url,
        source: row.source, sourceId: row.source_id, trackKey: `${row.source}:${row.source_id}`,
        plays: Number(row.plays), durationMs: Number(row.duration_ms),
      })),
    }
  }

  // 回忆卡片保存的是生成那一刻的快照；之后歌曲被删除也不影响已生成的卡片。
  function buildCardData(userId, eventIds) {
    const events = eventIds
      .map((id) => repository.findEvent(database, userId, id))
      .filter(Boolean)
    if (!events.length) return null
    const ordered = events.slice().sort((a, b) => String(a.played_at).localeCompare(String(b.played_at)))
    const durations = ordered.reduce((sum, event) => sum + Number(event.duration_ms), 0)
    const noteRows = ordered.map((event) => {
      const note = database.prepare('SELECT content FROM footprint_notes WHERE event_id = ? AND user_id = ?')
        .get(event.id, userId)
      return note ? { content: note.content, title: event.title, playedAt: event.played_at } : null
    }).filter(Boolean)
    const counts = new Map()
    for (const event of ordered) {
      const key = `${event.source}:${event.source_id}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const favourite = ordered.reduce((best, event) => {
      const plays = counts.get(`${event.source}:${event.source_id}`) || 0
      return plays > (best?.plays ?? 0) ? { event, plays } : best
    }, null)
    return {
      period: { from: ordered[0].played_at, to: ordered[ordered.length - 1].played_at },
      trackCount: ordered.length,
      totalDurationMs: durations,
      tracks: ordered.slice(0, CARD_TRACK_LIMIT).map((event) => ({
        title: event.title, artist: event.artist, album: event.album,
        coverUrl: event.cover_url, playedAt: event.played_at,
        source: event.source, sourceId: event.source_id,
      })),
      notes: noteRows.slice(0, CARD_NOTE_LIMIT),
      highlight: favourite
        ? { title: favourite.event.title, artist: favourite.event.artist, plays: favourite.plays }
        : null,
    }
  }

  return {
    recordPlayback,
    timeline,
    milestone,
    buildCardData,
    cards: (userId, limit, offset) => ({
      total: repository.countCards(database, userId),
      cards: repository.listCards(database, userId, limit, offset).map(toCard),
    }),
    card: (userId, id) => {
      const row = repository.findCard(database, userId, id)
      return row ? toCard(row) : null
    },
    createCard(userId, title, eventIds) {
      const data = buildCardData(userId, eventIds)
      if (!data) return null
      const id = repository.createCard(database, userId, title, eventIds, data)
      const row = repository.findCard(database, userId, id)
      return row ? toCard(row) : null
    },
    deleteCard: (userId, id) => repository.deleteCard(database, userId, id),
    saveNote: (userId, eventId, content) => {
      if (!repository.findEvent(database, userId, eventId)) return false
      repository.saveNote(database, userId, eventId, content)
      return true
    },
    deleteNote: (userId, eventId) => repository.deleteNote(database, userId, eventId),
    posts: (viewerId, limit, offset) => ({
      total: repository.countPosts(database),
      posts: repository.listPosts(database, viewerId, limit, offset).map(toPost),
    }),
    // 广场顶部统计条的数据。
    overview: () => repository.statsOverview(database),
    post: (viewerId, id) => {
      const row = repository.findPost(database, id)
      if (!row) return null
      const post = toPost(row)
      post.likeCount = repository.countLikes(database, id)
      post.liked = repository.hasLiked(database, id, viewerId)
      return post
    },
    // 卡片只属于本人，且一张卡片只能分享一次，防止重复刷屏。
    publishCard(userId, cardId, caption) {
      if (!repository.findCard(database, userId, cardId)) return { status: 'missing' }
      if (repository.findPostByCard(database, cardId)) return { status: 'duplicate' }
      const id = repository.createPost(database, userId, cardId, caption)
      return { status: 'created', id }
    },
    publishedCard: (userId, cardId) => repository.findPostByCard(database, cardId),
    ownPosts: (userId, limit, offset) => repository.listOwnPosts(database, userId, limit, offset)
      .map((row) => ({ ...toPost(row), liked: false })),
    deletePost: (userId, id) => repository.deletePost(database, userId, id),
    comments: (postId) => repository.listComments(database, postId).map((row) => ({
      id: row.id, postId: row.post_id, authorId: row.user_id,
      authorNickname: row.author_nickname, content: row.content, createdAt: row.created_at,
    })),
    addComment: (postId, userId, content) => repository.addComment(database, postId, userId, content),
    deleteComment: (userId, id) => repository.deleteComment(database, userId, id),
    likeCount: (postId) => repository.countLikes(database, postId),
    setLiked: (postId, userId, liked) => {
      if (liked) repository.addLike(database, postId, userId)
      else repository.removeLike(database, postId, userId)
      return repository.countLikes(database, postId)
    },
  }
}

module.exports = {
  CARD_NOTE_LIMIT,
  CARD_TRACK_LIMIT,
  createFootprintService,
  computeStreak,
  sanitizeCoverUrl,
  timezoneModifier,
}
