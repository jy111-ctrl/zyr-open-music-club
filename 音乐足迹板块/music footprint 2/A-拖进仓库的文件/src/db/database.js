const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

function createDatabase(databasePath) {
  if (!databasePath) {
    throw new Error('DATABASE_PATH 不能为空')
  }

  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true })
  }

  const database = new Database(databasePath)
  database.pragma('foreign_keys = ON')
  database.pragma('journal_mode = WAL')
  return database
}

function initializeSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      nickname TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TRIGGER IF NOT EXISTS update_users_updated_at
    AFTER UPDATE ON users
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE users
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = OLD.id;
    END;

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      avatar_data BLOB NOT NULL CHECK (length(avatar_data) BETWEEN 1 AND 262144),
      avatar_version TEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS access_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL COLLATE NOCASE,
      nickname TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewed_by INTEGER,
      reviewed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_access_request_email
      ON access_requests(email)
      WHERE status = 'pending';

    CREATE INDEX IF NOT EXISTS index_access_requests_status_created_at
      ON access_requests(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS uploaded_music (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL UNIQUE,
      file_path TEXT NOT NULL,
      cover_filename TEXT,
      cover_path TEXT,
      cover_mime_type TEXT,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL CHECK (file_size >= 0),
      duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
      uploader_id INTEGER NOT NULL,
      download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploader_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS index_uploaded_music_uploader
      ON uploaded_music(uploader_id);

    CREATE INDEX IF NOT EXISTS index_uploaded_music_created_at
      ON uploaded_music(created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS download_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      music_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      downloaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (music_id) REFERENCES uploaded_music(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS index_download_logs_music
      ON download_logs(music_id);

    CREATE INDEX IF NOT EXISTS index_download_logs_user_downloaded_at
      ON download_logs(user_id, downloaded_at DESC);

    CREATE TABLE IF NOT EXISTS user_playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL,
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
      description TEXT CHECK (description IS NULL OR length(description) <= 500),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS index_user_playlists_owner_created
      ON user_playlists(owner_user_id, created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS user_playlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('local', 'netease')),
      source_id TEXT NOT NULL,
      position INTEGER NOT NULL CHECK (position >= 0),
      added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES user_playlists(id) ON DELETE CASCADE,
      UNIQUE (playlist_id, source, source_id)
    );

    CREATE INDEX IF NOT EXISTS index_user_playlist_tracks_order
      ON user_playlist_tracks(playlist_id, position, id);

    CREATE TABLE IF NOT EXISTS user_liked_tracks (
      user_id INTEGER NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('local', 'netease')),
      source_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, source, source_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS index_user_liked_tracks_created
      ON user_liked_tracks(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS user_playback_queues (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      tracks_json TEXT NOT NULL CHECK (json_valid(tracks_json) AND length(tracks_json) <= 12000)
    );

    CREATE TABLE IF NOT EXISTS user_two_factor (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      secret_ciphertext TEXT,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
      last_used_counter INTEGER,
      pending_ciphertext TEXT,
      pending_session_hash TEXT,
      pending_expires_at INTEGER,
      session_version INTEGER NOT NULL DEFAULT 0,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0,
      confirmed_at DATETIME,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (enabled = 0 OR secret_ciphertext IS NOT NULL)
    );
    CREATE TABLE IF NOT EXISTS two_factor_recovery_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      used_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, code_hash)
    );

    -- 音乐足迹：一条记录就是一次真实播放，快照保存当时的歌曲信息。
    -- 歌曲可能来自本地上传或网易云，删除歌曲后足迹仍要能展示，所以信息直接冗余保存。
    CREATE TABLE IF NOT EXISTS playback_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('local', 'netease')),
      source_id TEXT NOT NULL,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      artist TEXT NOT NULL CHECK (length(artist) <= 200),
      album TEXT CHECK (album IS NULL OR length(album) <= 200),
      cover_url TEXT CHECK (cover_url IS NULL OR length(cover_url) <= 600),
      duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0 AND duration_ms <= 86400000),
      played_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS index_playback_events_user_played_at
      ON playback_events(user_id, played_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS index_playback_events_user_track
      ON playback_events(user_id, source, source_id, played_at DESC);

    -- 听歌随笔：一次播放最多一篇随笔，随笔随记录一起删除。
    CREATE TABLE IF NOT EXISTS footprint_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL UNIQUE REFERENCES playback_events(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 1000),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS index_footprint_notes_event
      ON footprint_notes(event_id);

    -- 回忆卡片：由若干条播放记录生成的可视化卡片，数据快照保存在 card_data_json。
    CREATE TABLE IF NOT EXISTS footprint_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 60),
      event_ids_json TEXT NOT NULL CHECK (json_valid(event_ids_json) AND length(event_ids_json) <= 2000),
      card_data_json TEXT NOT NULL CHECK (json_valid(card_data_json) AND length(card_data_json) <= 20000),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS index_footprint_cards_user_created
      ON footprint_cards(user_id, created_at DESC, id DESC);

    -- 分享到广场的足迹：一张卡片最多分享一次，避免重复刷屏。
    CREATE TABLE IF NOT EXISTS footprint_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL UNIQUE REFERENCES footprint_cards(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      caption TEXT NOT NULL CHECK (length(caption) <= 500),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS index_footprint_posts_created_at
      ON footprint_posts(created_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS index_footprint_posts_user
      ON footprint_posts(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS footprint_likes (
      post_id INTEGER NOT NULL REFERENCES footprint_posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS footprint_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES footprint_posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 300),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS index_footprint_comments_post_created
      ON footprint_comments(post_id, created_at, id);
  `)
}

module.exports = {
  createDatabase,
  initializeSchema,
}
