const express = require('express')
const { createFootprintService } = require('../services/footprint.service')

const CARD_LIMIT = 50
const CARD_EVENT_LIMIT = 12
const COMMENT_PAGE_LIMIT = 50

function parseId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value)
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) return null
  return String(Number(text))
}

function parsePage(query, defaultLimit = 20, maxLimit = 50) {
  const limit = query.limit === undefined ? defaultLimit : Number(query.limit)
  const offset = query.offset === undefined ? 0 : Number(query.offset)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxLimit
    || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) return null
  return { limit, offset }
}

// 统一读取并裁剪文本；min 为 0 时允许空字符串。
function readText(value, max, min = 1) {
  if (value === undefined || value === null) return min === 0 ? '' : null
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length >= min && text.length <= max ? text : null
}

function errorResponse(res, status, message) {
  return res.status(status).json({ success: false, message })
}

function createFootprintRouter({ database, timezoneOffsetMinutes } = {}) {
  const router = express.Router()
  const service = createFootprintService({ database, timezoneOffsetMinutes })

  // 播放器在歌曲真正开始播放后调用；同一首歌 30 秒内只记一次。
  router.post('/events', (req, res) => {
    const body = req.body || {}
    const source = body.source
    const sourceId = parseId(body.sourceId)
    const title = readText(body.title, 200)
    const artist = readText(body.artist ?? '', 200, 0)
    const album = readText(body.album ?? '', 200, 0)
    const durationMs = Number(body.durationMs)
    if (!['local', 'netease'].includes(source) || !sourceId || !title) {
      return errorResponse(res, 400, '播放记录无效')
    }
    if (!Number.isSafeInteger(durationMs) || durationMs < 0 || durationMs > 86_400_000) {
      return errorResponse(res, 400, '播放时长无效')
    }
    const id = service.recordPlayback(req.user.id, {
      source, sourceId, title, artist, album, coverUrl: body.coverUrl, durationMs,
    })
    return res.status(201).json({ success: true, eventId: id })
  })

  router.get('/timeline', (req, res) => {
    const page = parsePage(req.query)
    if (!page) return errorResponse(res, 400, '分页参数无效')
    const { total, events } = service.timeline(req.user.id, page.limit, page.offset)
    res.set('Cache-Control', 'no-store')
    return res.json({ success: true, total, events })
  })

  router.put('/events/:id/note', (req, res) => {
    const id = parseId(req.params.id)
    const content = readText(req.body?.content, 1000)
    if (!id || !content) return errorResponse(res, 400, '随笔内容无效')
    if (!service.saveNote(req.user.id, id, content)) return errorResponse(res, 404, '播放记录不存在')
    return res.json({ success: true })
  })

  router.delete('/events/:id/note', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return errorResponse(res, 400, '播放记录无效')
    if (!service.deleteNote(req.user.id, id)) return errorResponse(res, 404, '随笔不存在')
    return res.json({ success: true })
  })

  router.get('/milestone', (req, res) => {
    res.set('Cache-Control', 'no-store')
    return res.json({ success: true, milestone: service.milestone(req.user.id) })
  })

  router.get('/cards', (req, res) => {
    const page = parsePage(req.query)
    if (!page) return errorResponse(res, 400, '分页参数无效')
    const { total, cards } = service.cards(req.user.id, page.limit, page.offset)
    res.set('Cache-Control', 'no-store')
    return res.json({ success: true, total, cards })
  })

  router.post('/cards', (req, res) => {
    const title = readText(req.body?.title, 60)
    const ids = req.body?.eventIds
    if (!title || !Array.isArray(ids) || !ids.length || ids.length > CARD_EVENT_LIMIT) {
      return errorResponse(res, 400, '卡片标题或所选记录无效')
    }
    const eventIds = ids.map(parseId)
    if (eventIds.some((id) => id === null)) return errorResponse(res, 400, '所选记录无效')
    const total = database.prepare('SELECT COUNT(*) AS count FROM footprint_cards WHERE user_id = ?')
      .get(req.user.id).count
    if (total >= CARD_LIMIT) return errorResponse(res, 409, '回忆卡片数量已达上限')
    const card = service.createCard(req.user.id, title, eventIds)
    if (!card) return errorResponse(res, 404, '所选记录不存在')
    return res.status(201).json({ success: true, card })
  })

  router.get('/cards/:id', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return errorResponse(res, 400, '卡片 ID 无效')
    const card = service.card(req.user.id, id)
    if (!card) return errorResponse(res, 404, '卡片不存在')
    res.set('Cache-Control', 'no-store')
    return res.json({ success: true, card })
  })

  router.delete('/cards/:id', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return errorResponse(res, 400, '卡片 ID 无效')
    if (!service.deleteCard(req.user.id, id)) return errorResponse(res, 404, '卡片不存在')
    return res.json({ success: true })
  })

  // 广场：所有登录成员都能浏览，但只能删除自己的分享。
  router.get('/posts', (req, res) => {
    const page = parsePage(req.query)
    if (!page) return errorResponse(res, 400, '分页参数无效')
    const { total, posts } = service.posts(req.user.id, page.limit, page.offset)
    res.set('Cache-Control', 'no-store')
    return res.json({ success: true, total, posts })
  })

  // 广场顶部统计条：总分享、总点赞、总评论、参与人数。
  router.get('/overview', (req, res) => {
    res.set('Cache-Control', 'no-store')
    return res.json({ success: true, overview: service.overview() })
  })

  router.post('/posts', (req, res) => {
    const cardId = parseId(req.body?.cardId)
    const caption = readText(req.body?.caption ?? '', 500, 0)
    if (!cardId || caption === null) return errorResponse(res, 400, '分享内容无效')
    const result = service.publishCard(req.user.id, cardId, caption)
    if (result.status === 'missing') return errorResponse(res, 404, '卡片不存在')
    if (result.status === 'duplicate') return errorResponse(res, 409, '这张卡片已经分享过了')
    return res.status(201).json({ success: true, postId: result.id })
  })

  router.get('/posts/mine', (req, res) => {
    const page = parsePage(req.query)
    if (!page) return errorResponse(res, 400, '分页参数无效')
    const posts = service.ownPosts(req.user.id, page.limit, page.offset)
    res.set('Cache-Control', 'no-store')
    return res.json({ success: true, posts })
  })

  router.get('/posts/:id', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return errorResponse(res, 400, '分享 ID 无效')
    const post = service.post(req.user.id, id)
    if (!post) return errorResponse(res, 404, '分享不存在')
    const card = service.card(post.authorId, post.cardId)
    res.set('Cache-Control', 'no-store')
    return res.json({
      success: true,
      post,
      card: card ? { id: card.id, title: card.title, data: card.data, createdAt: card.createdAt } : null,
      comments: service.comments(post.id),
      canDelete: post.authorId === req.user.id,
    })
  })

  router.delete('/posts/:id', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return errorResponse(res, 400, '分享 ID 无效')
    if (!service.deletePost(req.user.id, id)) return errorResponse(res, 404, '分享不存在')
    return res.json({ success: true })
  })

  router.put('/posts/:id/like', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return errorResponse(res, 400, '分享 ID 无效')
    if (!service.post(req.user.id, id)) return errorResponse(res, 404, '分享不存在')
    const likeCount = service.setLiked(id, req.user.id, true)
    return res.json({ success: true, liked: true, likeCount })
  })

  router.delete('/posts/:id/like', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return errorResponse(res, 400, '分享 ID 无效')
    const likeCount = service.setLiked(id, req.user.id, false)
    return res.json({ success: true, liked: false, likeCount })
  })

  router.get('/posts/:id/comments', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return errorResponse(res, 400, '分享 ID 无效')
    return res.json({ success: true, comments: service.comments(id) })
  })

  router.post('/posts/:id/comments', (req, res) => {
    const id = parseId(req.params.id)
    const content = readText(req.body?.content, 300)
    if (!id || !content) return errorResponse(res, 400, '评论内容无效')
    const count = database.prepare('SELECT COUNT(*) AS count FROM footprint_comments WHERE post_id = ?')
      .get(id).count
    if (count >= COMMENT_PAGE_LIMIT * 10) return errorResponse(res, 409, '这条分享的评论已满')
    const commentId = service.addComment(id, req.user.id, content)
    return res.status(201).json({ success: true, commentId })
  })

  router.delete('/comments/:id', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return errorResponse(res, 400, '评论 ID 无效')
    if (!service.deleteComment(req.user.id, id)) return errorResponse(res, 404, '评论不存在')
    return res.json({ success: true })
  })

  router.use((req, res) => errorResponse(res, 404, '足迹接口不存在'))

  return router
}

module.exports = {
  CARD_EVENT_LIMIT,
  CARD_LIMIT,
  COMMENT_PAGE_LIMIT,
  createFootprintRouter,
}
