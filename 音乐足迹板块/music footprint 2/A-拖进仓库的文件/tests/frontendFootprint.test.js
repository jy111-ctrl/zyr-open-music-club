const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { describe, it } = require('node:test')
const { pathToFileURL } = require('node:url')

const root = path.resolve(__dirname, '../frontend/src')
const source = name => fs.readFileSync(path.join(root, name), 'utf8')
const load = name => import(pathToFileURL(path.join(root, name)).href)

// 用一个内存路由表模拟 fetch，检查客户端的 CSRF 与错误处理流程。
function createMockFetcher(routes) {
  return async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase()
    const handler = routes[`${method} ${url}`]
    if (!handler) return { ok: false, status: 404, json: async () => ({ success: false }) }
    return handler(init)
  }
}

const csrfRoute = {
  'GET /api/security/csrf-token': async () => ({ ok: true, status: 200, json: async () => ({ csrfToken: 'token-1' }) }),
}

describe('音乐足迹前端', () => {
  it('durationToMs 解析 "m:ss" 文本，无法解析时记 0', async () => {
    const { durationToMs } = await load('services/music/footprint.ts')
    assert.equal(durationToMs('3:45'), 225000)
    assert.equal(durationToMs('12:05'), 725000)
    assert.equal(durationToMs('—'), 0)
    assert.equal(durationToMs(''), 0)
    assert.equal(durationToMs('61:00'), 3660000)
  })

  it('足迹客户端先取 CSRF 令牌再上报，失败时抛出可识别错误', async () => {
    const { createFootprintClient, FootprintError } = await load('services/music/footprint.ts')
    const seen = []
    const client = createFootprintClient(createMockFetcher({
      ...csrfRoute,
      'POST /api/footprint/events': async (init) => {
        seen.push({ token: init.headers['X-CSRF-Token'], body: JSON.parse(init.body) })
        return { ok: true, status: 201, json: async () => ({ success: true, eventId: 7 }) }
      },
    }))
    const eventId = await client.report({ source: 'local', sourceId: '1', title: '夜航', artist: '远行乐队',
      album: '灯塔', coverUrl: '/api/local/music/1/cover', durationMs: 225000 })
    assert.equal(eventId.eventId, 7)
    assert.equal(seen[0].token, 'token-1')
    assert.equal(seen[0].body.title, '夜航')
    assert.equal(seen[0].body.durationMs, 225000)

    const failing = createFootprintClient(createMockFetcher({
      ...csrfRoute,
      'POST /api/footprint/posts': async () => ({ ok: false, status: 409, json: async () => ({ success: false }) }),
    }))
    const error = await failing.publish(1, '').catch((reason) => reason)
    assert.ok(error instanceof FootprintError)
    assert.equal(error.status, 409)
    assert.match(error.message, /已存在/)
  })

  it('回忆卡片 SVG 包含标题、曲目与统计，并对文本做转义', async () => {
    const { createCardSvg } = await load('features/footprint/card-art.ts')
    const card = {
      title: '十月<晚风>',
      data: {
        period: { from: '2026-10-01 10:00:00', to: '2026-10-19 22:00:00' },
        trackCount: 12,
        totalDurationMs: 3600000,
        tracks: [{ title: '夜航', artist: '远行乐队', album: null, coverUrl: null, playedAt: '2026-10-19 22:00:00', source: 'local', sourceId: '1' }],
        notes: [{ content: '今晚只想循环这一首', title: '夜航', playedAt: '2026-10-19 22:00:00' }],
        highlight: { title: '夜航', artist: '远行乐队', plays: 3 },
      },
    }
    const svg = createCardSvg(card, '阿鹿')
    assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    assert.match(svg, /十月&lt;晚风&gt;/)
    assert.doesNotMatch(svg, /十月<晚风>/)
    assert.match(svg, /夜航/)
    assert.match(svg, /今晚只想循环这一首/)
    assert.match(svg, /阿鹿/)
  })

  it('足迹页面骨架包含五个界面入口与详情返回按钮', async () => {
    const { createFootprintPageMarkup } = await load('features/footprint/footprint-page.ts')
    const markup = createFootprintPageMarkup()
    for (const name of ['timeline', 'milestone', 'studio', 'square', 'mine']) {
      assert.match(markup, new RegExp(`data-fp-tab="${name}"`))
    }
    assert.match(markup, /data-fp-back-top/)
    assert.match(markup, /时光轴/)
    assert.match(markup, /听歌里程/)
    assert.match(markup, /回忆卡片/)
    assert.match(markup, /足迹广场/)
    assert.match(markup, /我的分享/)
  })

  it('播放器在真正开播后回调 onPlayed，应用装配里接入了自动记录', async () => {
    assert.match(source('features/player/player-core.ts'), /onPlayed\?\.\(next\)/)
    const controller = source('app/app-controller.ts')
    assert.match(controller, /createFootprintClient/)
    assert.match(controller, /durationToMs\(track\.duration\)/)
    assert.match(controller, /catch\(\(\) => undefined\)/)
  })

  it('工作区为音乐足迹提供导航入口、宿主容器与页面挂载', () => {
    assert.match(source('app/workspace-view.ts'), /data-nav="footprint"/)
    assert.match(source('app/workspace-view.ts'), /data-footprint-host/)
    assert.match(source('app/music-workspace.ts'), /mountFootprintPage/)
    assert.match(source('app/music-workspace.ts'), /case 'footprint': navigation\.show\('footprint'\)/)
    assert.match(source('app/navigation.ts'), /'footprint'/)
    assert.match(source('style.css'), /footprint\.css/)
    assert.ok(fs.existsSync(path.join(root, 'styles/footprint.css')))
  })

  it('足迹时间按服务端 UTC 解析，不会把 UTC 00:30 错当成本地 00:30', async () => {
    const { formatClock, dayKey } = await load('features/footprint/format.ts')
    // 服务端写的是 UTC 文本（SQLite CURRENT_TIMESTAMP），必须与显式带 Z 的时间渲染一致，
    // 否则上海时区下 UTC 00:30 会显示成 00:30（应为 08:30），跨午夜记录也会归错日期。
    assert.equal(formatClock('2026-10-20 00:30:00'), formatClock('2026-10-20T00:30:00Z'))
    assert.equal(dayKey('2026-10-20 00:30:00'), dayKey('2026-10-20T00:30:00Z'))
    const expected = new Date(Date.UTC(2026, 9, 20, 0, 30))
    const pad = (value) => String(value).padStart(2, '0')
    assert.equal(formatClock('2026-10-20 00:30:00'), `${pad(expected.getHours())}:${pad(expected.getMinutes())}`)
  })

  it('足迹视图只依赖共享层与服务层，遵守分层规则', () => {
    for (const file of ['features/footprint/timeline-view.ts', 'features/footprint/milestone-view.ts',
      'features/footprint/card-studio-view.ts', 'features/footprint/square-view.ts',
      'features/footprint/post-detail-view.ts', 'features/footprint/my-posts-view.ts']) {
      const text = source(file)
      assert.ok(!/from ['"]\.\.\/\.\.\/(app|features)\//.test(text), `${file} 不得反向依赖 app 或其他 feature`)
    }
  })
})
