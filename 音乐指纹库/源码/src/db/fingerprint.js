const fs = require('node:fs')
const path = require('node:path')

const SEED_FILE = path.join(__dirname, 'seeds', 'fingerprint-seed.json')

function initializeFingerprintSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS fingerprint_songs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      duration_sec REAL NOT NULL,
      hash_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fingerprint_hashes (
      song_id TEXT NOT NULL,
      h INTEGER NOT NULL,
      t INTEGER NOT NULL,
      PRIMARY KEY (song_id, h, t)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_fingerprint_hash ON fingerprint_hashes (h);
  `)
  seedFingerprints(database)
}

/** 首次启动时把预生成的指纹导入库；已有数据则跳过。 */
function seedFingerprints(database) {
  const count = database.prepare('SELECT COUNT(*) AS n FROM fingerprint_songs').get().n
  if (count > 0) return
  if (!fs.existsSync(SEED_FILE)) return

  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'))
  const insertSong = database.prepare(
    'INSERT INTO fingerprint_songs (id, title, duration_sec, hash_count, created_at) VALUES (?, ?, ?, ?, ?)',
  )
  const insertHash = database.prepare('INSERT OR IGNORE INTO fingerprint_hashes (song_id, h, t) VALUES (?, ?, ?)')
  const insertChroma = database.prepare('INSERT OR REPLACE INTO fingerprint_chroma (song_id, title, frames, fps, data) VALUES (?, ?, ?, ?, ?)')

  const run = database.transaction(() => {
    for (const song of seed) {
      insertSong.run(song.id, song.title, song.durationSec, song.hashCount, song.createdAt || Date.now())
      const flat = song.hashes || []
      for (let i = 0; i + 1 < flat.length; i += 2) insertHash.run(song.id, flat[i], flat[i + 1])
      if (song.chroma && Array.isArray(song.chroma.data)) {
        insertChroma.run(song.id, song.title, Math.floor(song.chroma.data.length / 12), song.chroma.fps || 5.38, JSON.stringify(song.chroma.data))
      }
    }
  })
  run()
}

function listSongs(database) {
  return database.prepare('SELECT id, title, duration_sec AS durationSec, hash_count AS hashCount, created_at AS createdAt FROM fingerprint_songs ORDER BY created_at').all()
}

function loadHashes(database) {
  return database.prepare('SELECT song_id AS songId, h, t FROM fingerprint_hashes').all()
}

module.exports = { initializeFingerprintSchema, listSongs, loadHashes }
