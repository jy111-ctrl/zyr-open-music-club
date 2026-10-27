const assert = require('node:assert/strict')
const { afterEach, describe, it } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createDatabase, initializeSchema } = require('../src/db/database')
const { createAvatarService } = require('../src/services/avatar.service')

const temporaryDirectories = []

function createTestDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-test-'))
  temporaryDirectories.push(directory)
  const database = createDatabase(path.join(directory, 'test.sqlite'))
  initializeSchema(database)
  return database
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('avatar 模块 - 素材种子', () => {
  it('首次创建服务时自动插入 18 个默认部件', () => {
    const database = createTestDatabase()
    const service = createAvatarService({ database })
    const components = service.listComponents()
    assert.equal(components.length, 18, `应为 18 个部件，实际 ${components.length}`)
    const slots = new Set(components.map((c) => c.slot))
    assert.equal(slots.size, 6, '应覆盖 6 个槽位')
    for (const slot of ['background', 'head', 'top', 'bottom', 'shoes', 'accessory']) {
      assert.ok(slots.has(slot), `缺少槽位 ${slot}`)
    }
  })

  it('重复创建服务不会重复插入部件', () => {
    const database = createTestDatabase()
    createAvatarService({ database })
    createAvatarService({ database })
    const components = createAvatarService({ database }).listComponents()
    assert.equal(components.length, 18)
  })
})

describe('avatar 模块 - 我的画像 CRUD', () => {
  function pickId(components, slot, index = 0) {
    return components.filter((c) => c.slot === slot).sort((a, b) => a.sort_order - b.sort_order)[index].id
  }

  it('首次读取时 avatar 为 null，但 components 已有 18 项', () => {
    const database = createTestDatabase()
    const service = createAvatarService({ database })
    const result = service.getMyAvatar(42)
    assert.equal(result.avatar, null)
    assert.equal(result.components.length, 18)
  })

  it('更新穿搭后再次读取能拿到所有槽位与主题色', () => {
    const database = createTestDatabase()
    const service = createAvatarService({ database })
    const components = service.listComponents()

    const saved = service.updateMyAvatar(42, {
      backgroundId: pickId(components, 'background', 0),
      headId: pickId(components, 'head', 1),
      topId: pickId(components, 'top', 2),
      bottomId: pickId(components, 'bottom', 0),
      shoesId: pickId(components, 'shoes', 1),
      accessoryId: pickId(components, 'accessory', 2),
      themeColor: '#06B6D4',
    })
    assert.ok(saved)
    assert.equal(saved.theme_color, '#06B6D4')

    const result = service.getMyAvatar(42)
    assert.ok(result.avatar)
    assert.equal(result.avatar.slots.head, pickId(components, 'head', 1))
    assert.equal(result.avatar.themeColor, '#06B6D4')
  })

  it('非法颜色回落到默认值；非法槽位 id 直接抛 400', () => {
    const database = createTestDatabase()
    const service = createAvatarService({ database })

    const persisted = service.updateMyAvatar(1, { themeColor: 'not-a-color' })
    assert.equal(persisted.theme_color, '#7C3AED')

    assert.throws(
      () => service.updateMyAvatar(1, { topId: 999999 }),
      (err) => err.status === 400,
    )
  })

  it('禁用部件不能被写入', () => {
    const database = createTestDatabase()
    const service = createAvatarService({ database })
    const components = service.listComponents()
    const target = components.find((c) => c.slot === 'top')
    database.prepare('UPDATE avatar_components SET enabled = 0 WHERE id = ?').run(target.id)

    assert.throws(
      () => service.updateMyAvatar(1, { topId: target.id }),
      (err) => err.status === 400,
    )
  })

  it('不传任何槽位时不报错，保留所有为 null', () => {
    const database = createTestDatabase()
    const service = createAvatarService({ database })
    const persisted = service.updateMyAvatar(7, {})
    assert.equal(persisted.background_id, null)
    assert.equal(persisted.head_id, null)
    assert.equal(persisted.theme_color, '#7C3AED')
  })

  it('同一用户二次更新会覆盖而非新建行', () => {
    const database = createTestDatabase()
    const service = createAvatarService({ database })
    const components = service.listComponents()
    service.updateMyAvatar(99, { topId: pickId(components, 'top', 0) })
    service.updateMyAvatar(99, { topId: pickId(components, 'top', 1) })

    const count = database
      .prepare('SELECT COUNT(*) AS c FROM user_avatar WHERE user_id = 99')
      .get()
    assert.equal(count.c, 1)
    const result = service.getMyAvatar(99)
    assert.equal(result.avatar.slots.top, pickId(components, 'top', 1))
  })
})