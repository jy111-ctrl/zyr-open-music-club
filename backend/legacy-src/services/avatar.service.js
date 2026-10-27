const {
  listEnabledComponents,
  getComponentById,
  countComponents,
  insertComponent,
  getUserAvatar,
  upsertUserAvatar,
  createPortraitLog,
} = require('../db/avatar')

const VALID_SLOTS = ['background', 'head', 'top', 'bottom', 'shoes', 'accessory']
const DEFAULT_THEME_COLOR = '#7C3AED'

// 所有 SVG 部件 viewBox = 0 0 200 240
// 渲染顺序：background → head → top → bottom → shoes → accessory
// 主题色：需要主题色的元素带 class="t"，前端组装时统一注入：
//   <style>.t { fill: var(--avatar-theme, #7C3AED); }</style>
const SLOT_DEFINITIONS = [
  {
    slot: 'background',
    label: '背景',
    items: [
      {
        label: '柔光渐变',
        themeHint: '#7C3AED',
        svgFragment:
          '<defs><linearGradient id="bg-soft" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#EDE9FE"/><stop offset="100%" stop-color="#FBCFE8"/></linearGradient></defs><rect x="0" y="0" width="200" height="240" fill="url(#bg-soft)"/>',
      },
      {
        label: '极光',
        themeHint: '#06B6D4',
        svgFragment:
          '<defs><linearGradient id="bg-aurora" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#22D3EE"/><stop offset="60%" stop-color="#7C3AED"/><stop offset="100%" stop-color="#1E1B4B"/></linearGradient></defs><rect x="0" y="0" width="200" height="240" fill="url(#bg-aurora)"/>',
      },
      {
        label: '网格',
        themeHint: '#A78BFA',
        svgFragment:
          '<rect x="0" y="0" width="200" height="240" fill="#F5F3FF"/><g stroke="#DDD6FE" stroke-width="1"><path d="M0 30 H200"/><path d="M0 60 H200"/><path d="M0 90 H200"/><path d="M0 120 H200"/><path d="M0 150 H200"/><path d="M0 180 H200"/><path d="M0 210 H200"/><path d="M30 0 V240"/><path d="M60 0 V240"/><path d="M90 0 V240"/><path d="M120 0 V240"/><path d="M150 0 V240"/><path d="M180 0 V240"/></g>',
      },
    ],
  },
  {
    slot: 'head',
    label: '发型',
    items: [
      {
        label: '短发',
        svgFragment:
          '<ellipse cx="100" cy="60" rx="26" ry="30" fill="#FCD9B6"/><path d="M74 50 Q100 28 126 50 L126 62 Q100 52 74 62 Z" fill="#3F3F46"/><circle cx="91" cy="62" r="2" fill="#1F2937"/><circle cx="109" cy="62" r="2" fill="#1F2937"/><path d="M93 76 Q100 80 107 76" stroke="#9A3412" stroke-width="1.5" fill="none"/>',
      },
      {
        label: '长发',
        svgFragment:
          '<ellipse cx="100" cy="60" rx="26" ry="30" fill="#FCD9B6"/><path d="M70 50 Q100 22 130 50 L132 130 Q120 105 100 100 Q80 105 68 130 Z" fill="#7C2D12"/><circle cx="91" cy="62" r="2" fill="#1F2937"/><circle cx="109" cy="62" r="2" fill="#1F2937"/><path d="M93 76 Q100 80 107 76" stroke="#9A3412" stroke-width="1.5" fill="none"/>',
      },
      {
        label: '马尾',
        svgFragment:
          '<ellipse cx="100" cy="60" rx="26" ry="30" fill="#FCD9B6"/><path d="M74 50 Q100 28 130 50 L132 56 Q150 58 148 76 L135 70 Q100 52 74 62 Z" fill="#1F2937"/><path d="M148 76 Q168 110 152 138 L140 130 Q156 100 142 80 Z" fill="#1F2937"/><circle cx="91" cy="62" r="2" fill="#1F2937"/><circle cx="109" cy="62" r="2" fill="#1F2937"/><path d="M93 76 Q100 80 107 76" stroke="#9A3412" stroke-width="1.5" fill="none"/>',
      },
    ],
  },
  {
    slot: 'top',
    label: '上衣',
    items: [
      {
        label: '素 T 恤',
        themeHint: '#7C3AED',
        svgFragment:
          '<path class="t" d="M68 95 L82 88 L100 95 L118 88 L132 95 L138 110 L128 116 L128 168 L72 168 L72 116 L62 110 Z"/><path class="t" d="M82 88 Q100 100 118 88"/>',
      },
      {
        label: '卫衣',
        themeHint: '#0EA5E9',
        svgFragment:
          '<path class="t" d="M62 96 L80 86 L100 96 L120 86 L138 96 L142 115 L130 122 L130 172 L70 172 L70 122 L58 115 Z"/><path class="t" d="M82 92 Q100 106 118 92 L116 112 Q100 122 84 112 Z"/><rect x="92" y="150" width="16" height="14" rx="2" fill="#0F172A" opacity="0.4"/>',
      },
      {
        label: '西装',
        themeHint: '#1E293B',
        svgFragment:
          '<path d="M62 96 L82 86 L100 96 L118 86 L138 96 L142 115 L130 122 L130 172 L70 172 L70 122 L58 115 Z" fill="#1E293B"/><path d="M82 86 L100 96 L118 86 L114 172 L100 165 L86 172 Z" fill="#F8FAFC"/><path class="t" d="M98 96 L100 130 L102 96 Z"/>',
      },
    ],
  },
  {
    slot: 'bottom',
    label: '下装',
    items: [
      {
        label: '牛仔裤',
        svgFragment:
          '<path d="M72 168 L128 168 L132 230 L108 230 L100 188 L92 230 L68 230 Z" fill="#3B82F6"/><path d="M100 168 L132 188" stroke="#1E40AF" stroke-width="1" fill="none"/>',
      },
      {
        label: '休闲裤',
        themeHint: '#92400E',
        svgFragment:
          '<path class="t" d="M72 168 L128 168 L132 230 L108 230 L100 188 L92 230 L68 230 Z"/>',
      },
      {
        label: '半裙',
        themeHint: '#EC4899',
        svgFragment:
          '<path class="t" d="M72 168 L128 168 L138 215 Q100 205 62 215 Z"/>',
      },
    ],
  },
  {
    slot: 'shoes',
    label: '鞋',
    items: [
      {
        label: '运动鞋',
        themeHint: '#7C3AED',
        svgFragment:
          '<ellipse cx="85" cy="234" rx="18" ry="5" fill="#F8FAFC"/><ellipse cx="115" cy="234" rx="18" ry="5" fill="#F8FAFC"/><path class="t" d="M67 232 Q70 224 85 224 L100 232 Z"/><path class="t" d="M100 232 Q115 224 132 224 Q134 230 132 234 Z"/>',
      },
      {
        label: '皮鞋',
        svgFragment:
          '<ellipse cx="85" cy="234" rx="18" ry="5" fill="#1F2937"/><ellipse cx="115" cy="234" rx="18" ry="5" fill="#1F2937"/>',
      },
      {
        label: '靴子',
        svgFragment:
          '<path d="M70 200 L100 200 L100 236 L68 236 Z" fill="#7C2D12"/><path d="M100 200 L130 200 L130 236 L98 236 Z" fill="#7C2D12"/><rect x="68" y="232" width="32" height="4" fill="#1F2937"/><rect x="98" y="232" width="32" height="4" fill="#1F2937"/>',
      },
    ],
  },
  {
    slot: 'accessory',
    label: '配饰',
    items: [
      {
        label: '耳机',
        themeHint: '#7C3AED',
        svgFragment:
          '<path class="t" d="M76 60 Q100 38 124 60" stroke-width="3" fill="none" stroke="currentColor"/><rect class="t" x="68" y="60" width="10" height="14" rx="2"/><rect class="t" x="122" y="60" width="10" height="14" rx="2"/>',
      },
      {
        label: '墨镜',
        svgFragment:
          '<rect x="78" y="58" width="18" height="10" rx="2" fill="#0F172A"/><rect x="104" y="58" width="18" height="10" rx="2" fill="#0F172A"/><path d="M96 62 H104" stroke="#0F172A" stroke-width="2"/>',
      },
      {
        label: '项链',
        svgFragment:
          '<path d="M85 92 Q100 108 115 92" stroke="#FBBF24" stroke-width="2" fill="none"/><circle cx="100" cy="108" r="4" fill="#FBBF24"/>',
      },
    ],
  },
]

function ensureDefaultComponents(database) {
  if (countComponents(database) > 0) return 0
  let inserted = 0
  const insertAll = database.transaction(() => {
    for (const def of SLOT_DEFINITIONS) {
      def.items.forEach((item, index) => {
        insertComponent(database, {
          slot: def.slot,
          label: item.label,
          svgFragment: item.svgFragment,
          themeHint: item.themeHint ?? null,
          sortOrder: index,
        })
        inserted += 1
      })
    }
  })
  insertAll()
  return inserted
}

function isValidHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

function resolveSlotIds(database, payload) {
  const normalized = {}
  for (const slot of VALID_SLOTS) {
    const camelKey = `${slot}Id`
    const snakeKey = `${slot}_id`
    const raw = payload?.[camelKey] ?? payload?.[snakeKey] ?? null
    if (raw === null || raw === undefined || raw === '') {
      normalized[slot] = null
      continue
    }
    if (!Number.isInteger(raw)) {
      const error = new Error(`槽位 ${slot} 的组件 ID 无效`)
      error.status = 400
      throw error
    }
    const component = getComponentById(database, raw)
    if (!component || component.slot !== slot || !component.enabled) {
      const error = new Error(`槽位 ${slot} 的组件不存在或已禁用`)
      error.status = 400
      throw error
    }
    normalized[slot] = raw
  }
  return normalized
}

function getMyAvatar(database, userId) {
  const row = getUserAvatar(database, userId)
  const components = listEnabledComponents(database)
  return {
    avatar: row
      ? {
          userId: row.user_id,
          slots: {
            background: row.background_id,
            head: row.head_id,
            top: row.top_id,
            bottom: row.bottom_id,
            shoes: row.shoes_id,
            accessory: row.accessory_id,
          },
          themeColor: row.theme_color,
          updatedAt: row.updated_at,
        }
      : null,
    components,
  }
}

function updateMyAvatar(database, userId, payload) {
  const resolved = resolveSlotIds(database, payload)
  const themeColor =
    payload?.themeColor && isValidHexColor(payload.themeColor)
      ? payload.themeColor
      : DEFAULT_THEME_COLOR
  const persisted = upsertUserAvatar(database, userId, {
    backgroundId: resolved.background,
    headId: resolved.head,
    topId: resolved.top,
    bottomId: resolved.bottom,
    shoesId: resolved.shoes,
    accessoryId: resolved.accessory,
    themeColor,
  })
  createPortraitLog(database, {
    userId,
    source: 'manual',
    snapshot: { ...resolved, themeColor },
    status: 'accepted',
  })
  return persisted
}

function createAvatarService({ database }) {
  if (!database) {
    throw new Error('createAvatarService 必须传入 database')
  }
  ensureDefaultComponents(database)
  return {
    getMyAvatar: (userId) => getMyAvatar(database, userId),
    updateMyAvatar: (userId, payload) =>
      updateMyAvatar(database, userId, payload),
    listComponents: () => listEnabledComponents(database),
  }
}

module.exports = {
  VALID_SLOTS,
  DEFAULT_THEME_COLOR,
  ensureDefaultComponents,
  createAvatarService,
  _internal: {
    resolveSlotIds,
    isValidHexColor,
  },
}