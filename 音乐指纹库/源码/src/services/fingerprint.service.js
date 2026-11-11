const { listSongs, loadHashes } = require('../db/fingerprint')

const SAMPLE_RATE = 11025
const HOP = 256
const MIN_VOTES = 20
// 命中率下限：整首歌查询会生成大量哈希，绝对票数不足以区分真假
const MIN_VOTE_RATE = 0.015

/**
 * 指纹匹配服务：索引常驻内存，查询时按 (歌曲, 时间偏移) 投票。
 * 前端只负责解码音频并算出查询哈希，匹配与判定全部在后端完成。
 */
function createFingerprintService({ database }) {
  let index = null
  let songs = []

  function ensureIndex() {
    if (index) return
    index = new Map()
    for (const row of loadHashes(database)) {
      let list = index.get(row.h)
      if (!list) {
        list = []
        index.set(row.h, list)
      }
      list.push({ songId: row.songId, t: row.t })
    }
    songs = listSongs(database)
  }

  function reload() {
    index = null
    ensureIndex()
  }

  function stats() {
    ensureIndex()
    return {
      songs: songs.length,
      hashes: [...index.values()].reduce((sum, list) => sum + list.length, 0),
      list: songs,
    }
  }

  /**
   * @param {number[]} queryHashes 扁平数组 [h, t, h, t, ...]
   */
  function match(queryHashes) {
    ensureIndex()
    if (!Array.isArray(queryHashes) || queryHashes.length < 2) {
      return { accepted: false, reason: '查询哈希为空', best: null, candidates: [], queryHashes: 0, queryHits: 0, distribution: [] }
    }
    const total = Math.floor(queryHashes.length / 2)
    const votes = new Map()
    let queryHits = 0

    for (let i = 0; i + 1 < queryHashes.length; i += 2) {
      const h = queryHashes[i]
      const t = queryHashes[i + 1]
      const hits = index.get(h)
      if (!hits || !hits.length) continue
      queryHits += 1
      for (const hit of hits) {
        const key = `${hit.songId}|${hit.t - t}`
        votes.set(key, (votes.get(key) || 0) + 1)
      }
    }

    const candidates = []
    const buckets = new Map()
    for (const [key, count] of votes) {
      const [songId, offsetText] = key.split('|')
      const offsetFrames = Number(offsetText)
      const offsetSec = (offsetFrames * HOP) / SAMPLE_RATE
      candidates.push({ songId, votes: count, offsetFrames, offsetSec })
      const bucket = Math.round(offsetSec * 2) / 2
      buckets.set(bucket, (buckets.get(bucket) || 0) + count)
    }
    candidates.sort((a, b) => b.votes - a.votes)
    const top = candidates.slice(0, 5)
    const best = top[0] || null
    const distribution = [...buckets.entries()]
      .map(([offsetSec, votesCount]) => ({ offsetSec, votes: votesCount }))
      .sort((a, b) => a.offsetSec - b.offsetSec)

    const voteRate = total > 0 ? best.votes / total : 0
    const accepted = Boolean(best && best.votes >= MIN_VOTES && voteRate >= MIN_VOTE_RATE)
    const song = best ? songs.find((item) => item.id === best.songId) : null

    return {
      accepted,
      reason: accepted ? 'ok' : '票数低于阈值',
      threshold: MIN_VOTES,
      minVoteRate: MIN_VOTE_RATE,
      voteRate: Number(voteRate.toFixed(4)),
      best: best
        ? {
            ...best,
            title: song ? song.title : best.songId,
            confidence: Math.min(1, best.votes / Math.sqrt(Math.max(1, total)) / 6),
          }
        : null,
      candidates: top.map((item) => ({
        ...item,
        title: (songs.find((songItem) => songItem.id === item.songId) || {}).title || item.songId,
      })),
      queryHashes: total,
      queryHits,
      distribution,
    }
  }

  return { match, stats, reload }
}

module.exports = { createFingerprintService, MIN_VOTES }
