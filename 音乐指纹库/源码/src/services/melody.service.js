const fs = require('node:fs')
const path = require('node:path')

const CHROMA_SEED = path.join(__dirname, '..', 'db', 'seeds', 'chroma-seed.json')
const FPS = 5.38
// 校准自：原曲 0.95 / 加噪 0.95 / 男清唱 0.16 / 不相关音频 0.08
const MIN_SCORE = 0.12
const MIN_Z = 4.0

/** 旋律匹配：去均值 chroma + 滑动余弦 + 移调搜索。 */
function createMelodyService({ database }) {
  let songs = null

  function load() {
    if (songs) return songs
    songs = []
    const rows = database.prepare('SELECT song_id AS id, title, frames, fps, data FROM fingerprint_chroma').all()
    for (const row of rows) {
      const flat = JSON.parse(row.data)
      const frames = []
      for (let i = 0; i + 11 < flat.length; i += 12) {
        const v = new Float32Array(12)
        for (let p = 0; p < 12; p += 1) v[p] = flat[i + p]
        frames.push(v)
      }
      songs.push({ id: row.id, title: row.title, frames, fps: row.fps || FPS })
    }
    return songs
  }

  /** 去全局均值并逐帧单位化：抑制静态音高造成的假匹配 */
  function center(frames) {
    const mean = new Float32Array(12)
    for (const v of frames) for (let p = 0; p < 12; p += 1) mean[p] += v[p]
    for (let p = 0; p < 12; p += 1) mean[p] /= Math.max(1, frames.length)
    return frames.map((v) => {
      const out = new Float32Array(12)
      let n = 0
      for (let p = 0; p < 12; p += 1) { out[p] = v[p] - mean[p]; n += out[p] * out[p] }
      n = Math.sqrt(n)
      if (n < 1e-6) return null
      for (let p = 0; p < 12; p += 1) out[p] /= n
      return out
    })
  }

  function match(queryFrames) {
    const library = load()
    if (!library.length) return { accepted: false, reason: '旋律库为空', songs: [] }
    if (!queryFrames || queryFrames.length < 10) return { accepted: false, reason: '查询片段过短', songs: [] }

    const q = center(queryFrames)
    const results = []

    for (const song of library) {
      const ref = center(song.frames)
      const qLen = q.length
      let best = { score: -Infinity, start: 0, transpose: 0 }
      const scores = []

      for (let k = -6; k <= 6; k += 1) {
        for (let start = 0; start + qLen <= ref.length; start += 1) {
          let score = 0
          let valid = 0
          for (let i = 0; i < qLen; i += 1) {
            const qv = q[i]
            const rv = ref[start + i]
            if (!qv || !rv) continue
            let dot = 0
            for (let p = 0; p < 12; p += 1) dot += qv[(p + k + 12) % 12] * rv[p]
            score += dot
            valid += 1
          }
          if (!valid) continue
          const value = score / valid
          scores.push(value)
          if (value > best.score) best = { score: value, start, transpose: k }
        }
      }

      const mean = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length)
      const std = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, scores.length))
      const z = std > 0 ? (best.score - mean) / std : 0
      results.push({
        songId: song.id,
        title: song.title,
        score: Number(best.score.toFixed(4)),
        z: Number(z.toFixed(2)),
        transpose: best.transpose,
        atSec: Number((best.start / (song.fps || FPS)).toFixed(1)),
        mean: Number(mean.toFixed(4)),
        std: Number(std.toFixed(4)),
      })
    }

    results.sort((a, b) => b.score - a.score)
    const best = results[0]
    const accepted = Boolean(best && best.score >= MIN_SCORE && best.z >= MIN_Z)
    return {
      accepted,
      reason: accepted ? 'ok' : '旋律相似度或显著性不足',
      threshold: { score: MIN_SCORE, z: MIN_Z },
      best: accepted ? best : null,
      candidates: results.slice(0, 5),
      queryFrames: q.length,
    }
  }

  function reload() {
    songs = null
    load()
  }

  return { match, reload }
}

function initializeChromaSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS fingerprint_chroma (
      song_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      frames INTEGER NOT NULL,
      fps REAL NOT NULL,
      data TEXT NOT NULL
    );
  `)
}

function seedChroma(database) {
  const count = database.prepare('SELECT COUNT(*) AS n FROM fingerprint_chroma').get().n
  if (count > 0 || !fs.existsSync(CHROMA_SEED)) return
  const seed = JSON.parse(fs.readFileSync(CHROMA_SEED, 'utf8'))
  const song = database.prepare('SELECT id, title FROM fingerprint_songs ORDER BY created_at LIMIT 1').get()
  if (!song) return
  const flat = []
  for (const frame of seed.frames) for (const v of frame) flat.push(v)
  database.prepare('INSERT OR REPLACE INTO fingerprint_chroma (song_id, title, frames, fps, data) VALUES (?, ?, ?, ?, ?)')
    .run(song.id, song.title, seed.frames.length, seed.fps || FPS, JSON.stringify(flat))
}

module.exports = { createMelodyService, initializeChromaSchema, MIN_SCORE, MIN_Z }
