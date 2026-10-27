const express = require('express')
const { createAvatarService } = require('../services/avatar.service')

function createAvatarRouter({ database }) {
  const router = express.Router()
  const service = createAvatarService({ database })

  router.get('/components', (req, res) => {
    const components = service.listComponents()
    return res.json({ success: true, components })
  })

  router.get('/me', (req, res, next) => {
    try {
      const data = service.getMyAvatar(req.user.id)
      return res.json({ success: true, ...data })
    } catch (error) {
      return next(error)
    }
  })

  router.patch('/me', (req, res, next) => {
    try {
      const persisted = service.updateMyAvatar(req.user.id, req.body || {})
      const slots = {
        background: persisted.background_id,
        head: persisted.head_id,
        top: persisted.top_id,
        bottom: persisted.bottom_id,
        shoes: persisted.shoes_id,
        accessory: persisted.accessory_id,
      }
      return res.json({
        success: true,
        avatar: {
          userId: persisted.user_id,
          slots,
          themeColor: persisted.theme_color,
          updatedAt: persisted.updated_at,
        },
      })
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .json({ success: false, message: error.message })
      }
      return next(error)
    }
  })

  return router
}

module.exports = { createAvatarRouter }