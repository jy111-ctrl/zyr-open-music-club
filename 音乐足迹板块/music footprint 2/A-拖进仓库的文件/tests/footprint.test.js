const assert = require('node:assert/strict')
const { afterEach, beforeEach, describe, it } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const bcrypt = require('bcrypt')
const request = require('supertest')

const { createApp } = require('../src/app')
const { createUser } = require('../src/db/users')
const { readTimezoneOffsetMinutes } = require('../src/config/siteTimezone')

describe('站点时区配置', () => {
  it('默认 UTC+8，空值与非法取值回退默认值', () => {
    assert.equal(readTimezoneOffsetMinutes({}), 480)
    assert.equal(readTimezoneOffsetMinutes({ SITE_TIMEZONE_OFFSET_MINUTES: '' }), 480)
    assert.equal(readTimezoneOffsetMinutes({ SITE_TIMEZONE_OFFSET_MINUTES: 'abc' }), 480)
    assert.equal(readTimezoneOffsetMinutes({ SITE_TIMEZONE_OFFSET_MINUTES: '9999' }), 480)
    assert.equal(readTimezoneOffsetMinutes({ SITE_TIMEZONE_OFFSET_MINUTES: '-300' }), -300)
  })
})

describe('音乐足迹 API', () => {
  let directory
  let app
  let database
  let member
  let other
  let limitedApp

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'open-music-footprint-'))
    app = createApp({
      databasePath: path.join(directory, 'database.sqlite'),
      sessionSecret: 'test-session-secret',
      neteaseService: { async call() { throw new Error('不应调用网易云接口') } },
    })
    database = app.locals.database
    const passwordHash = await bcrypt.hash('test-password', 4)
    for (const email of ['member@example.com', 'other@example.com']) {
      createUser(database, {
        email,
        nickname: email.split('@')[0],
        passwordHash,
        status: 'active',
        role: 'user',
      })
    }
    member = request.agent(app)
    other = request.agent(app)
    await member.post('/api/auth/login').send({ email: 'member@example.com', password: 'test-password' })
    await other.post('/api/auth/login').send({ email: 'other@example.com', password: 'test-password' })
  })

  afterEach(() => {
    if (limitedApp?.locals.database?.open) limitedApp.locals.database.close()
    if (database?.open) database.close()
    fs.rmSync(directory, { recursive: true, force: true })
  })

  async function report(agent = member, overrides = {}) {
    const response = await agent.post('/api/footprint/events').send({
      source: 'local',
      sourceId: '1',
      title: '夜航',
      artist: '远行乐队',
      album: '灯塔',
      coverUrl: '/api/local/music/1/cover',
      durationMs: 200000,
      ...overrides,
    })
    return response
  }

  it('增量建立六张足迹表，不触碰现有数据', () => {
    for (const table of ['playback_events', 'footprint_notes', 'footprint_cards',
      'footprint_posts', 'footprint_likes', 'footprint_comments']) {
      assert.equal(Boolean(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)), true)
    }
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 2)
  })

  it('未登录不能读写任何足迹接口', async () => {
    for (const [method, url, body] of [
      ['post', '/api/footprint/events', { source: 'local', sourceId: '1', title: 'x', durationMs: 1 }],
      ['get', '/api/footprint/timeline'],
      ['get', '/api/footprint/milestone'],
      ['get', '/api/footprint/cards'],
      ['get', '/api/footprint/posts'],
      ['get', '/api/footprint/overview'],
      ['put', '/api/footprint/events/1/note', { content: 'x' }],
    ]) {
      assert.equal((await request(app)[method](url).send(body || {})).status, 401)
    }
  })

  it('播放上报校验字段，非法封面地址被拒绝，同一首歌 30 秒内只记一次', async () => {
    const first = await report()
    assert.equal(first.status, 201)
    assert.ok(first.body.eventId)
    const duplicate = await report()
    assert.equal(duplicate.status, 201)
    assert.equal(duplicate.body.eventId, first.body.eventId)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM playback_events').get().count, 1)
    assert.equal(database.prepare('SELECT cover_url FROM playback_events').get().cover_url, '/api/local/music/1/cover')

    assert.equal((await report(member, { source: 'other' })).status, 400)
    assert.equal((await report(member, { sourceId: 'abc' })).status, 400)
    assert.equal((await report(member, { title: '' })).status, 400)
    assert.equal((await report(member, { durationMs: -1 })).status, 400)
    // 不在白名单里的封面地址不落库，只保留空值。
    const second = await report(member, { sourceId: '2', coverUrl: 'http://evil.example.com/a.jpg' })
    assert.equal(second.status, 201)
    assert.notEqual(second.body.eventId, first.body.eventId)
    assert.equal(database.prepare("SELECT cover_url FROM playback_events WHERE source_id = '2'").get().cover_url, null)
  })

  it('时光轴按时间倒序返回并带随笔，随笔只能写在自己的记录上', async () => {
    await report(member, { sourceId: '1', title: '第一首' })
    await report(member, { sourceId: '2', title: '第二首' })
    const timeline = await member.get('/api/footprint/timeline?limit=10&offset=0')
    assert.equal(timeline.status, 200)
    assert.equal(timeline.body.total, 2)
    assert.deepEqual(timeline.body.events.map((event) => event.title), ['第二首', '第一首'])

    const eventId = timeline.body.events[0].id
    const saved = await member.put(`/api/footprint/events/${eventId}/note`).send({ content: '今晚只想着这段旋律。' })
    assert.equal(saved.status, 200)
    const withNote = await member.get('/api/footprint/timeline')
    assert.equal(withNote.body.events[0].note.content, '今晚只想着这段旋律。')

    assert.equal((await other.put(`/api/footprint/events/${eventId}/note`).send({ content: '篡改' })).status, 404)
    assert.equal((await member.put('/api/footprint/events/999/note').send({ content: 'x' })).status, 404)
    assert.equal((await member.put(`/api/footprint/events/${eventId}/note`).send({ content: '' })).status, 400)
    assert.equal((await member.put(`/api/footprint/events/${eventId}/note`).send({ content: 'x'.repeat(1001) })).status, 400)
    assert.equal((await member.delete(`/api/footprint/events/${eventId}/note`)).status, 200)
    assert.equal((await member.delete(`/api/footprint/events/${eventId}/note`)).status, 404)
  })

  it('里程按站点时区分组，跨午夜的 UTC 记录不会被算到前一天', async () => {
    // 2026-10-19 16:30 UTC 在 UTC+8 是 10-20 00:30；09:30 UTC 是 10-20 17:30。
    // 两条都属于站点时区的 10-20，错按 UTC 分组就会被拆成 10-19 和 10-20 两天。
    database.exec(`INSERT INTO playback_events
      (user_id, source, source_id, title, artist, cover_url, duration_ms, played_at) VALUES
      (1, 'local', '1', '跨午夜', '远行乐队', NULL, 60000, '2026-10-19 16:30:00'),
      (1, 'local', '2', '傍晚', '远行乐队', NULL, 60000, '2026-10-20 09:30:00')`)
    const data = (await member.get('/api/footprint/milestone')).body.milestone
    assert.equal(data.activeDays, 1)
    assert.equal(data.busiestDay.date, '2026-10-20')
    assert.equal(data.busiestDay.plays, 2)
    assert.equal(data.hourly[0], 1)   // 00:30
    assert.equal(data.hourly[17], 1)  // 17:30
    assert.equal(data.hourly.reduce((sum, plays) => sum + plays, 0), 2)
  })

  it('站点时区改成 UTC+0 后，同一批记录按 UTC 分组', async () => {
    const previous = process.env.SITE_TIMEZONE_OFFSET_MINUTES
    process.env.SITE_TIMEZONE_OFFSET_MINUTES = '0'
    const utcDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'open-music-footprint-utc-'))
    const utcApp = createApp({
      databasePath: path.join(utcDirectory, 'database.sqlite'),
      sessionSecret: 'test-session-secret',
      neteaseService: { async call() { throw new Error('不应调用网易云接口') } },
    })
    try {
      const utcDatabase = utcApp.locals.database
      createUser(utcDatabase, {
        email: 'utc@example.com', nickname: 'utc',
        passwordHash: await bcrypt.hash('test-password', 4), status: 'active', role: 'user',
      })
      utcDatabase.exec(`INSERT INTO playback_events
        (user_id, source, source_id, title, artist, cover_url, duration_ms, played_at) VALUES
        (1, 'local', '1', '跨午夜', '远行乐队', NULL, 60000, '2026-10-19 16:30:00'),
        (1, 'local', '2', '傍晚', '远行乐队', NULL, 60000, '2026-10-20 09:30:00')`)
      const agent = request.agent(utcApp)
      await agent.post('/api/auth/login').send({ email: 'utc@example.com', password: 'test-password' })
      const data = (await agent.get('/api/footprint/milestone')).body.milestone
      assert.equal(data.activeDays, 2)
      assert.equal(data.hourly[16], 1)
      assert.equal(data.hourly[9], 1)
    } finally {
      if (previous === undefined) delete process.env.SITE_TIMEZONE_OFFSET_MINUTES
      else process.env.SITE_TIMEZONE_OFFSET_MINUTES = previous
      if (utcApp.locals.database?.open) utcApp.locals.database.close()
      fs.rmSync(utcDirectory, { recursive: true, force: true })
    }
  })

  it('里程统计汇总播放次数、时长与最爱曲目', async () => {
    // 上报接口 30 秒内会合并同一首歌；这里直接铺历史数据，模拟跨天重听。
    database.exec(`INSERT INTO playback_events
      (user_id, source, source_id, title, artist, cover_url, duration_ms, played_at) VALUES
      (1, 'local', '1', '夜航', '远行乐队', NULL, 60000, datetime('now', '-2 day')),
      (1, 'local', '1', '夜航', '远行乐队', NULL, 60000, datetime('now', '-1 day')),
      (1, 'local', '2', '晨光', '另一组', NULL, 30000, datetime('now', '-1 day')),
      (1, 'local', '3', '晨光', '远行乐队', NULL, 30000, datetime('now'))`)
    const milestone = await member.get('/api/footprint/milestone')
    assert.equal(milestone.status, 200)
    const data = milestone.body.milestone
    assert.equal(data.totalPlays, 4)
    assert.equal(data.totalDurationMs, 180000)
    assert.equal(data.distinctTracks, 3)
    assert.equal(data.distinctArtists, 2)
    assert.equal(data.activeDays, 3)
    assert.equal(data.streakDays, 3)
    assert.equal(data.topTracks[0].title, '夜航')
    assert.equal(data.topTracks[0].plays, 2)
    assert.equal(data.hourly.length, 24)
    assert.equal(data.hourly.reduce((sum, plays) => sum + plays, 0), 4)
    const empty = await other.get('/api/footprint/milestone')
    assert.equal(empty.body.milestone.totalPlays, 0)
  })

  it('回忆卡片保存数据快照，他人不可见，数量与选择范围受限', async () => {
    for (const sourceId of ['1', '2', '3']) {
      await report(member, { sourceId, title: `歌 ${sourceId}` })
    }
    const bad = await member.post('/api/footprint/cards').send({ title: '', eventIds: [1] })
    assert.equal(bad.status, 400)
    assert.equal((await member.post('/api/footprint/cards').send({ title: '回忆', eventIds: [] })).status, 400)
    assert.equal((await member.post('/api/footprint/cards').send({ title: '回忆', eventIds: Array.from({ length: 13 }, (_, index) => index + 1) })).status, 400)
    assert.equal((await member.post('/api/footprint/cards').send({ title: '回忆', eventIds: ['a'] })).status, 400)

    const created = await member.post('/api/footprint/cards').send({ title: '十月晚风', eventIds: [1, 2] })
    assert.equal(created.status, 201)
    const card = created.body.card
    assert.equal(card.title, '十月晚风')
    assert.equal(card.data.trackCount, 2)
    assert.equal(card.data.highlight.title, '歌 1')

    assert.equal((await other.get(`/api/footprint/cards/${card.id}`)).status, 404)
    assert.equal((await other.delete(`/api/footprint/cards/${card.id}`)).status, 404)
    const list = await member.get('/api/footprint/cards')
    assert.equal(list.body.total, 1)
    assert.equal(list.body.cards[0].data.tracks.length, 2)

    for (let index = 0; index < 50; index += 1) {
      await member.post('/api/footprint/cards').send({ title: `卡片 ${index}`, eventIds: [3] })
    }
    assert.equal((await member.post('/api/footprint/cards').send({ title: '超限', eventIds: [3] })).status, 409)
    assert.equal((await member.delete(`/api/footprint/cards/${card.id}`)).status, 200)
    assert.equal((await member.delete(`/api/footprint/cards/${card.id}`)).status, 404)
  })

  it('卡片只能分享一次，广场列表带点赞与评论计数，详情返回卡片快照', async () => {
    await report(member, { sourceId: '1', title: '夜航' })
    const created = await member.post('/api/footprint/cards').send({ title: '夜航回忆', eventIds: [1] })
    const cardId = created.body.card.id
    const published = await member.post('/api/footprint/posts').send({ cardId, caption: '最近的循环。' })
    assert.equal(published.status, 201)
    assert.equal((await member.post('/api/footprint/posts').send({ cardId, caption: '再发一次' })).status, 409)
    assert.equal((await other.post('/api/footprint/posts').send({ cardId, caption: '偷发' })).status, 404)
    assert.equal((await member.post('/api/footprint/posts').send({ cardId: 999 })).status, 404)
    assert.equal((await member.post('/api/footprint/posts').send({ cardId, caption: 'x'.repeat(501) })).status, 400)

    const square = await other.get('/api/footprint/posts')
    assert.equal(square.status, 200)
    assert.equal(square.body.total, 1)
    const post = square.body.posts[0]
    assert.equal(post.authorNickname, 'member')
    assert.equal(post.liked, false)
    assert.equal(post.likeCount, 0)

    const detail = await other.get(`/api/footprint/posts/${post.id}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.card.title, '夜航回忆')
    assert.equal(detail.body.canDelete, false)

    const mine = await member.get('/api/footprint/posts/mine')
    assert.equal(mine.body.posts.length, 1)
    assert.equal((await other.delete(`/api/footprint/posts/${post.id}`)).status, 404)
    assert.equal((await member.delete(`/api/footprint/posts/${post.id}`)).status, 200)
    assert.equal((await other.get('/api/footprint/posts')).body.total, 0)
  })

  it('广场统计条汇总分享数、点赞数、评论数与参与人数', async () => {
    assert.equal((await member.get('/api/footprint/overview')).body.overview.posts, 0)

    await report(member, { sourceId: '1', title: '夜航' })
    await report(other, { sourceId: '2', title: '晨光' })
    const memberCard = (await member.post('/api/footprint/cards').send({ title: '成员回忆', eventIds: [1] })).body.card.id
    const otherCard = (await other.post('/api/footprint/cards').send({ title: '他人回忆', eventIds: [2] })).body.card.id
    const first = (await member.post('/api/footprint/posts').send({ cardId: memberCard, caption: '第一份' })).body.postId
    const second = (await other.post('/api/footprint/posts').send({ cardId: otherCard, caption: '第二份' })).body.postId

    assert.equal((await other.put(`/api/footprint/posts/${first}/like`)).status, 200)
    assert.equal((await member.put(`/api/footprint/posts/${second}/like`)).status, 200)
    assert.equal((await other.post(`/api/footprint/posts/${first}/comments`).send({ content: '这段我也在听' })).status, 201)

    const response = await member.get('/api/footprint/overview')
    assert.equal(response.status, 200)
    assert.deepEqual(response.body.overview, { posts: 2, likes: 2, comments: 1, authors: 2 })

    // 删掉自己的分享后，统计同步回落，且不再计入该作者。
    assert.equal((await member.delete(`/api/footprint/posts/${first}`)).status, 200)
    assert.deepEqual((await member.get('/api/footprint/overview')).body.overview,
      { posts: 1, likes: 1, comments: 0, authors: 1 })
  })

  it('点赞可切换且幂等，评论只能删除自己的', async () => {
    await report(member, { sourceId: '1', title: '夜航' })
    const cardId = (await member.post('/api/footprint/cards').send({ title: '回忆', eventIds: [1] })).body.card.id
    const postId = (await member.post('/api/footprint/posts').send({ cardId, caption: '' })).body.postId

    assert.equal((await other.put(`/api/footprint/posts/${postId}/like`)).status, 200)
    assert.equal((await other.put(`/api/footprint/posts/${postId}/like`)).body.likeCount, 1)
    assert.equal((await member.put(`/api/footprint/posts/${postId}/like`)).body.likeCount, 2)
    const liked = await member.get(`/api/footprint/posts/${postId}`)
    assert.equal(liked.body.post.liked, true)
    assert.equal((await other.delete(`/api/footprint/posts/${postId}/like`)).body.likeCount, 1)
    assert.equal((await other.delete(`/api/footprint/posts/${postId}/like`)).body.likeCount, 1)
    assert.equal((await other.put('/api/footprint/posts/999/like')).status, 404)

    const comment = await other.post(`/api/footprint/posts/${postId}/comments`).send({ content: '这段我也在听！' })
    assert.equal(comment.status, 201)
    assert.equal((await other.post(`/api/footprint/posts/${postId}/comments`).send({ content: '' })).status, 400)
    assert.equal((await other.post(`/api/footprint/posts/${postId}/comments`).send({ content: 'x'.repeat(301) })).status, 400)
    const list = await member.get(`/api/footprint/posts/${postId}/comments`)
    assert.equal(list.body.comments[0].authorNickname, 'other')
    assert.equal((await member.delete(`/api/footprint/comments/${list.body.comments[0].id}`)).status, 404)
    assert.equal((await other.delete(`/api/footprint/comments/${list.body.comments[0].id}`)).status, 200)
  })

  it('足迹写操作按登录用户限流，读取不受影响', async () => {
    limitedApp = createApp({
      databasePath: path.join(directory, 'limited.sqlite'),
      sessionSecret: 'test-session-secret',
      neteaseService: { async call() { throw new Error('不应调用网易云接口') } },
      security: {
        rateLimitEnabled: true,
        rateLimits: {
          footprint: { windowMs: 60000, limit: 1 },
          global: { windowMs: 60000, limit: 1000 },
        },
      },
    })
    const hash = await bcrypt.hash('test-password', 4)
    createUser(limitedApp.locals.database, {
      email: 'rate@example.com', nickname: '限流用户', passwordHash: hash,
      role: 'user', status: 'active',
    })
    const agent = request.agent(limitedApp)
    await agent.post('/api/auth/login').send({ email: 'rate@example.com', password: 'test-password' })
    assert.equal((await agent.post('/api/footprint/events').send({ source: 'local', sourceId: '1', title: '第一首', durationMs: 1000 })).status, 201)
    assert.equal((await agent.post('/api/footprint/events').send({ source: 'local', sourceId: '2', title: '第二首', durationMs: 1000 })).status, 429)
    assert.equal((await agent.get('/api/footprint/timeline')).status, 200)
  })
})
