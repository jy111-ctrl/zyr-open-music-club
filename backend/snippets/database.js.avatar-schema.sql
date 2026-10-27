-- avatar 模块的 schema 段（从 src/db/database.js 抽出的原始 SQL）
-- 原文位置：src/db/database.js 行 105–174
-- 插入位置：在已有 download_logs 段（行 102–103）之后、initializeSchema 闭合反引号（行 174）之前
-- 配套代码：avatar/src/db/avatar.js（CRUD helper）
-- 2026-09-28 更新：新增 body 槽位（人物底模/体型），渲染顺序：body → background → head → top → bottom → shoes → accessory

CREATE TABLE IF NOT EXISTS avatar_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot TEXT NOT NULL CHECK (slot IN ('body', 'background', 'head', 'top', 'bottom', 'shoes', 'accessory')),
  label TEXT NOT NULL,
  svg_fragment TEXT NOT NULL,
  theme_hint TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS index_avatar_components_slot
  ON avatar_components(slot, sort_order, id);

CREATE TABLE IF NOT EXISTS user_avatar (
  user_id INTEGER PRIMARY KEY,
  body_id INTEGER,
  background_id INTEGER,
  head_id INTEGER,
  top_id INTEGER,
  bottom_id INTEGER,
  shoes_id INTEGER,
  accessory_id INTEGER,
  theme_color TEXT NOT NULL DEFAULT '#7C3AED',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (body_id) REFERENCES avatar_components(id),
  FOREIGN KEY (background_id) REFERENCES avatar_components(id),
  FOREIGN KEY (head_id) REFERENCES avatar_components(id),
  FOREIGN KEY (top_id) REFERENCES avatar_components(id),
  FOREIGN KEY (bottom_id) REFERENCES avatar_components(id),
  FOREIGN KEY (shoes_id) REFERENCES avatar_components(id),
  FOREIGN KEY (accessory_id) REFERENCES avatar_components(id)
);

CREATE TRIGGER IF NOT EXISTS update_user_avatar_updated_at
AFTER UPDATE ON user_avatar
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE user_avatar
  SET updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id;
END;

CREATE TABLE IF NOT EXISTS portrait_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'auto_daily')),
  snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'ignored')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS index_portrait_log_user_created_at
  ON portrait_log(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS play_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  track_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('local', 'netease')),
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  played_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS index_play_history_user_played_at
  ON play_history(user_id, played_at DESC, id DESC);

-- 2026-09-28 增量迁移（已存在 body_id 之外的库可单独跑）：
-- ALTER TABLE user_avatar ADD COLUMN body_id INTEGER REFERENCES avatar_components(id);
-- ALTER TABLE avatar_components DROP CONSTRAINT IF EXISTS ...;  -- SQLite 不支持 DROP CHECK，要重建表

-- 借鉴开源参考（仅借鉴枚举结构与搭配维度，SVG 自写）：
--   avataaars (MIT): https://github.com/fangpenlin/avataaars-generator
--   beanheads (MIT): https://beanheads.robertbroersma.com