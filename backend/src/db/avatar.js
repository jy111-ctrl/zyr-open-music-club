function listEnabledComponents(database) {
  return database
    .prepare(
      `SELECT id, slot, label, svg_fragment, theme_hint, sort_order
         FROM avatar_components
        WHERE enabled = 1
        ORDER BY slot ASC, sort_order ASC, id ASC`,
    )
    .all()
}

function getComponentById(database, id) {
  if (!Number.isInteger(id)) return null
  return database
    .prepare(
      `SELECT id, slot, label, svg_fragment, theme_hint, enabled
         FROM avatar_components
        WHERE id = ?`,
    )
    .get(id)
}

function countComponents(database) {
  const row = database
    .prepare('SELECT COUNT(*) AS total FROM avatar_components')
    .get()
  return row?.total ?? 0
}

function insertComponent(database, { slot, label, svgFragment, themeHint, sortOrder }) {
  database
    .prepare(
      `INSERT INTO avatar_components (slot, label, svg_fragment, theme_hint, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(slot, label, svgFragment, themeHint ?? null, sortOrder ?? 0)
}

function getUserAvatar(database, userId) {
  return database
    .prepare(
      `SELECT user_id, body_id, background_id, head_id, top_id, bottom_id,
              shoes_id, accessory_id, theme_color, updated_at
         FROM user_avatar
        WHERE user_id = ?`,
    )
    .get(userId)
}

function upsertUserAvatar(database, userId, payload) {
  const existing = getUserAvatar(database, userId)
  if (existing) {
    database
      .prepare(
        `UPDATE user_avatar
            SET body_id = ?, background_id = ?, head_id = ?, top_id = ?,
                bottom_id = ?, shoes_id = ?, accessory_id = ?,
                theme_color = ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?`,
      )
      .run(
        payload.bodyId,
        payload.backgroundId,
        payload.headId,
        payload.topId,
        payload.bottomId,
        payload.shoesId,
        payload.accessoryId,
        payload.themeColor,
        userId,
      )
  } else {
    database
      .prepare(
        `INSERT INTO user_avatar (
            user_id, body_id, background_id, head_id, top_id, bottom_id,
            shoes_id, accessory_id, theme_color
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        payload.bodyId,
        payload.backgroundId,
        payload.headId,
        payload.topId,
        payload.bottomId,
        payload.shoesId,
        payload.accessoryId,
        payload.themeColor,
      )
  }
  return getUserAvatar(database, userId)
}

function createPortraitLog(database, { userId, source, snapshot, status }) {
  database
    .prepare(
      `INSERT INTO portrait_log (user_id, source, snapshot, status)
       VALUES (?, ?, ?, ?)`,
    )
    .run(userId, source, JSON.stringify(snapshot), status ?? 'pending')
}

module.exports = {
  listEnabledComponents,
  getComponentById,
  countComponents,
  insertComponent,
  getUserAvatar,
  upsertUserAvatar,
  createPortraitLog,
}