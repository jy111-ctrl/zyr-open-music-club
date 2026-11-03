// 音乐足迹的数据访问层：只负责 SQL，业务判断放在 footprint.service.js。
// 所有查询都必须带上 user_id，避免一个用户读到另一个用户的足迹。

function addEvent(database, userId, event) {
  return database.transaction(() => {
    // 同一首歌短时间内反复点击播放只算一次，避免自动记录把时光轴刷爆。
    const recent = database.prepare(`SELECT id FROM playback_events
      WHERE user_id = ? AND source = ? AND source_id = ?
        AND played_at > datetime('now', '-30 seconds')
      ORDER BY id DESC LIMIT 1`).get(userId, event.source, event.sourceId)
    if (recent) return recent.id
    const result = database.prepare(`INSERT INTO playback_events
      (user_id, source, source_id, title, artist, album, cover_url, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, event.source, event.sourceId, event.title, event.artist,
        event.album ?? null, event.coverUrl ?? null, event.durationMs)
    return Number(result.lastInsertRowid)
  })()
}

// 随笔通过 LEFT JOIN 一起取出，时光轴一次查询即可渲染。
function listEvents(database, userId, limit, offset) {
  return database.prepare(`SELECT e.id, e.source, e.source_id, e.title, e.artist, e.album,
    e.cover_url, e.duration_ms, e.played_at,
    n.id AS note_id, n.content AS note_content, n.updated_at AS note_updated_at
    FROM playback_events e
    LEFT JOIN footprint_notes n ON n.event_id = e.id
    WHERE e.user_id = ?
    ORDER BY e.played_at DESC, e.id DESC
    LIMIT ? OFFSET ?`).all(userId, limit, offset)
}

function countEvents(database, userId) {
  return database.prepare('SELECT COUNT(*) AS count FROM playback_events WHERE user_id = ?')
    .get(userId).count
}

function findEvent(database, userId, id) {
  return database.prepare(`SELECT id, source, source_id, title, artist, album, cover_url,
    duration_ms, played_at FROM playback_events WHERE id = ? AND user_id = ?`).get(id, userId)
}

function saveNote(database, userId, eventId, content) {
  database.prepare(`INSERT INTO footprint_notes (event_id, user_id, content)
    VALUES (?, ?, ?)
    ON CONFLICT(event_id) DO UPDATE SET
      content = excluded.content,
      user_id = excluded.user_id,
      updated_at = CURRENT_TIMESTAMP`).run(eventId, userId, content)
}

function deleteNote(database, userId, eventId) {
  return database.prepare('DELETE FROM footprint_notes WHERE event_id = ? AND user_id = ?')
    .run(eventId, userId).changes > 0
}

function createCard(database, userId, title, eventIds, cardData) {
  const result = database.prepare(`INSERT INTO footprint_cards
    (user_id, title, event_ids_json, card_data_json) VALUES (?, ?, ?, ?)`)
    .run(userId, title, JSON.stringify(eventIds), JSON.stringify(cardData))
  return Number(result.lastInsertRowid)
}

function listCards(database, userId, limit, offset) {
  return database.prepare(`SELECT id, title, event_ids_json, card_data_json, created_at
    FROM footprint_cards WHERE user_id = ?
    ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(userId, limit, offset)
}

function findCard(database, userId, id) {
  return database.prepare(`SELECT id, user_id, title, event_ids_json, card_data_json, created_at
    FROM footprint_cards WHERE id = ? AND user_id = ?`).get(id, userId)
}

function deleteCard(database, userId, id) {
  return database.prepare('DELETE FROM footprint_cards WHERE id = ? AND user_id = ?')
    .run(id, userId).changes > 0
}

function countCards(database, userId) {
  return database.prepare('SELECT COUNT(*) AS count FROM footprint_cards WHERE user_id = ?')
    .get(userId).count
}

function createPost(database, userId, cardId, caption) {
  const result = database.prepare(`INSERT INTO footprint_posts (card_id, user_id, caption)
    VALUES (?, ?, ?)`).run(cardId, userId, caption)
  return Number(result.lastInsertRowid)
}

function findPost(database, id) {
  return database.prepare(`SELECT p.id, p.card_id, p.user_id, p.caption, p.created_at,
    u.nickname AS author_nickname
    FROM footprint_posts p JOIN users u ON u.id = p.user_id
    WHERE p.id = ?`).get(id)
}

function findPostByCard(database, cardId) {
  return database.prepare('SELECT id FROM footprint_posts WHERE card_id = ?').get(cardId)
}

function findOwnPost(database, userId, id) {
  return database.prepare('SELECT id, card_id, user_id, caption, created_at FROM footprint_posts WHERE id = ? AND user_id = ?')
    .get(id, userId)
}

// 广场按时间倒序；liked 标记当前登录用户是否已点赞，评论数与点赞数一次带出。
// 顺手把卡片标题与快照带出来，列表不用逐条再查一次卡片就能画缩略图。
function listPosts(database, viewerId, limit, offset) {
  return database.prepare(`SELECT p.id, p.card_id, p.user_id, p.caption, p.created_at,
    u.nickname AS author_nickname, c.title AS card_title, c.card_data_json,
    (SELECT COUNT(*) FROM footprint_likes l WHERE l.post_id = p.id) AS like_count,
    (SELECT COUNT(*) FROM footprint_comments cm WHERE cm.post_id = p.id) AS comment_count,
    EXISTS (SELECT 1 FROM footprint_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked
    FROM footprint_posts p JOIN users u ON u.id = p.user_id
    LEFT JOIN footprint_cards c ON c.id = p.card_id
    ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`).all(viewerId, limit, offset)
}

function countPosts(database) {
  return database.prepare('SELECT COUNT(*) AS count FROM footprint_posts').get().count
}

function listOwnPosts(database, userId, limit, offset) {
  return database.prepare(`SELECT p.id, p.card_id, p.user_id, p.caption, p.created_at,
    c.title AS card_title, c.card_data_json,
    (SELECT COUNT(*) FROM footprint_likes l WHERE l.post_id = p.id) AS like_count,
    (SELECT COUNT(*) FROM footprint_comments cm WHERE cm.post_id = p.id) AS comment_count
    FROM footprint_posts p LEFT JOIN footprint_cards c ON c.id = p.card_id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`).all(userId, limit, offset)
}

// 广场概览：总分享、总点赞、总评论、参与人数，供广场顶部统计条使用。
function statsOverview(database) {
  const posts = database.prepare('SELECT COUNT(*) AS count FROM footprint_posts').get().count
  const likes = database.prepare('SELECT COUNT(*) AS count FROM footprint_likes').get().count
  const comments = database.prepare('SELECT COUNT(*) AS count FROM footprint_comments').get().count
  const authors = database.prepare('SELECT COUNT(DISTINCT user_id) AS count FROM footprint_posts').get().count
  return { posts, likes, comments, authors }
}

function deletePost(database, userId, id) {
  return database.prepare('DELETE FROM footprint_posts WHERE id = ? AND user_id = ?')
    .run(id, userId).changes > 0
}

function addLike(database, postId, userId) {
  database.prepare('INSERT OR IGNORE INTO footprint_likes (post_id, user_id) VALUES (?, ?)')
    .run(postId, userId)
}

function removeLike(database, postId, userId) {
  return database.prepare('DELETE FROM footprint_likes WHERE post_id = ? AND user_id = ?')
    .run(postId, userId).changes > 0
}

function countLikes(database, postId) {
  return database.prepare('SELECT COUNT(*) AS count FROM footprint_likes WHERE post_id = ?')
    .get(postId).count
}

function hasLiked(database, postId, userId) {
  return Boolean(database.prepare('SELECT 1 FROM footprint_likes WHERE post_id = ? AND user_id = ?')
    .get(postId, userId))
}

function addComment(database, postId, userId, content) {
  const result = database.prepare(`INSERT INTO footprint_comments (post_id, user_id, content)
    VALUES (?, ?, ?)`).run(postId, userId, content)
  return Number(result.lastInsertRowid)
}

function listComments(database, postId, limit = 50) {
  return database.prepare(`SELECT c.id, c.post_id, c.user_id, c.content, c.created_at,
    u.nickname AS author_nickname
    FROM footprint_comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ? ORDER BY c.created_at, c.id LIMIT ?`).all(postId, limit)
}

function findComment(database, id) {
  return database.prepare(`SELECT id, post_id, user_id, content, created_at
    FROM footprint_comments WHERE id = ?`).get(id)
}

function deleteComment(database, userId, id) {
  return database.prepare('DELETE FROM footprint_comments WHERE id = ? AND user_id = ?')
    .run(id, userId).changes > 0
}

module.exports = {
  addComment,
  addEvent,
  addLike,
  countCards,
  countEvents,
  countLikes,
  countPosts,
  createCard,
  createPost,
  deleteCard,
  deleteComment,
  deleteNote,
  deletePost,
  findCard,
  findComment,
  findEvent,
  findOwnPost,
  findPost,
  findPostByCard,
  hasLiked,
  listCards,
  listComments,
  listEvents,
  listOwnPosts,
  listPosts,
  removeLike,
  saveNote,
  statsOverview,
}
