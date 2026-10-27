// 一次性迁移脚本：给已存在的 sqlite 加 body 槽位
// 用法：node migrate-body-2026-09-28.js
const path = require('path')
process.chdir('D:/桌面文件夹/信管数据包/信息系统设计')
const Database = require('better-sqlite3')

const dbPath = path.join(process.cwd(), 'runtime', 'data', 'open-music-club.sqlite')
const db = new Database(dbPath)
db.pragma('foreign_keys = OFF')

try {
  const before = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('avatar_components','user_avatar')`,
    )
    .all()
  console.log('tables before:', before.map((r) => r.name).join(', '))

  // 1) user_avatar 加 body_id 列
  const userCols = db.prepare(`PRAGMA table_info(user_avatar)`).all()
  const hasBody = userCols.some((c) => c.name === 'body_id')
  if (!hasBody) {
    db.exec(`ALTER TABLE user_avatar ADD COLUMN body_id INTEGER`)
    console.log('ALTER user_avatar ADD body_id: OK')
  } else {
    console.log('user_avatar.body_id already exists')
  }

  // 2) avatar_components 重建（SQLite 不支持改 CHECK）
  db.exec(`
    DROP TABLE IF EXISTS avatar_components_new;
    CREATE TABLE avatar_components_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot TEXT NOT NULL CHECK (slot IN ('body','background','head','top','bottom','shoes','accessory')),
      label TEXT NOT NULL,
      svg_fragment TEXT NOT NULL,
      theme_hint TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO avatar_components_new (id, slot, label, svg_fragment, theme_hint, sort_order, enabled, created_at)
      SELECT id, slot, label, svg_fragment, theme_hint, sort_order, enabled, created_at FROM avatar_components;
    DROP TABLE avatar_components;
    ALTER TABLE avatar_components_new RENAME TO avatar_components;
    CREATE INDEX IF NOT EXISTS index_avatar_components_slot
      ON avatar_components(slot, sort_order, id);
  `)
  const rowCount = db.prepare(`SELECT COUNT(*) AS c FROM avatar_components`).get()
  console.log('avatar_components rebuilt, rows =', rowCount.c)

  db.pragma('foreign_keys = ON')
  console.log('migration done.')
} catch (e) {
  console.error('migration failed:', e.message)
  process.exitCode = 1
} finally {
  db.close()
}