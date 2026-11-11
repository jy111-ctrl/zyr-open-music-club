const express = require('express')
const { createFingerprintService } = require('../services/fingerprint.service')
const { createMelodyService } = require('../services/melody.service')

function createFingerprintRouter({ database }) {
  const router = express.Router()
  const fingerprint = createFingerprintService({ database })
  const melody = createMelodyService({ database })

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  router.get('/library', (req, res) => {
    const stats = fingerprint.stats()
    res.json({ success: true, songs: stats.songs, hashes: stats.hashes, list: stats.list })
  })

  /**
   * 匹配：先走指纹（原曲/加噪/切断），失败再看是否有 chroma（清唱/哼唱）。
   * body: { hashes: [h,t,...], chroma?: { data: number[], fps?: number } }
   */
  router.post('/match', (req, res) => {
    const body = req.body || {}
    const hashes = body.hashes
    const chroma = body.chroma

    if (!Array.isArray(hashes) || hashes.length < 2 || hashes.length > 400000) {
      return res.status(400).json({ success: false, message: '哈希参数无效' })
    }
    if (!hashes.every((v) => Number.isSafeInteger(v))) {
      return res.status(400).json({ success: false, message: '哈希必须是整数数组' })
    }

    const fingerprintResult = fingerprint.match(hashes)
    if (fingerprintResult.accepted) {
      return res.json({ success: true, channel: 'fingerprint', ...fingerprintResult })
    }

    // 指纹失败且带了 chroma → 旋律通道
    if (chroma && Array.isArray(chroma.data) && chroma.data.length >= 120) {
      const frames = []
      const flat = chroma.data
      for (let i = 0; i + 11 < flat.length; i += 12) {
        const v = new Float32Array(12)
        for (let p = 0; p < 12; p += 1) v[p] = Number(flat[i + p]) || 0
        frames.push(v)
      }
      const melodyResult = melody.match(frames)
      if (melodyResult.accepted) {
        return res.json({ success: true, channel: 'melody', fingerprint: fingerprintResult, ...melodyResult })
      }
      return res.json({
        success: true,
        channel: null,
        accepted: false,
        reason: '两条通道都未达到阈值',
        fingerprint: fingerprintResult,
        melody: melodyResult,
        best: null,
        candidates: [],
        queryHashes: fingerprintResult.queryHashes,
        queryHits: fingerprintResult.queryHits,
        distribution: fingerprintResult.distribution,
        threshold: fingerprintResult.threshold,
      })
    }

    return res.json({ success: true, channel: null, ...fingerprintResult })
  })

  return router
}

module.exports = { createFingerprintRouter }
