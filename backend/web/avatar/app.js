const state = {
  csrf: null,
  components: [],
  bySlot: {},
  selected: {
    body: null,
    background: null,
    head: null,
    top: null,
    bottom: null,
    shoes: null,
    accessory: null,
  },
  themeColor: '#7C3AED',
  updatedAt: null,
}

const THEME_PRESETS = [
  '#7C3AED',
  '#0EA5E9',
  '#F97316',
  '#10B981',
  '#EC4899',
  '#1E293B',
]
// 渲染顺序：body 最底 → 上叠背景 → 头 → 上衣 → 下装 → 鞋 → 配饰
const SLOT_ORDER = ['body', 'background', 'head', 'top', 'bottom', 'shoes', 'accessory']
const SLOT_LABELS = {
  body: '模型',
  background: '背景',
  head: '发型',
  top: '上衣',
  bottom: '下装',
  shoes: '鞋',
  accessory: '配饰',
}

async function fetchCsrf() {
  const r = await fetch('/api/security/csrf-token', { credentials: 'same-origin' })
  if (!r.ok) throw new Error('获取 CSRF token 失败')
  const j = await r.json()
  state.csrf = j.csrfToken
}

async function fetchComponents() {
  const r = await fetch('/api/avatar/components', { credentials: 'same-origin' })
  if (!r.ok) throw new Error('加载部件失败')
  const j = await r.json()
  state.components = j.components
  state.bySlot = {}
  for (const c of j.components) {
    if (!state.bySlot[c.slot]) state.bySlot[c.slot] = []
    state.bySlot[c.slot].push(c)
  }
}

async function fetchMyAvatar() {
  const r = await fetch('/api/avatar/me', { credentials: 'same-origin' })
  if (r.status === 401) return { unauthenticated: true }
  if (!r.ok) throw new Error('加载我的画像失败')
  const j = await r.json()
  if (j.avatar) {
    Object.assign(state.selected, j.avatar.slots)
    if (j.avatar.themeColor) state.themeColor = j.avatar.themeColor
    state.updatedAt = j.avatar.updatedAt
  }
  return j
}

async function saveMyAvatar() {
  if (!state.csrf) await fetchCsrf()
  const body = { ...state.selected, themeColor: state.themeColor }
  const r = await fetch('/api/avatar/me', {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': state.csrf,
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.message || `保存失败 (${r.status})`)
  }
  const data = await r.json()
  state.updatedAt = data.avatar.updatedAt
  return data
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c])
}

function renderAvatar() {
  const svg = document.getElementById('avatar-svg')
  svg.style.setProperty('--avatar-theme', state.themeColor)
  // 保留 index.html 里写的 <style> 节点（.t { fill: var(--avatar-theme) } 是真正的着色规则）
  const styleNode = svg.querySelector(':scope > style')
  svg.replaceChildren()
  if (styleNode) svg.appendChild(styleNode)
  for (const slot of SLOT_ORDER) {
    const id = state.selected[slot]
    if (!id) continue
    const comp = state.components.find((x) => x.id === id)
    if (!comp) continue
    svg.insertAdjacentHTML('beforeend', comp.svgFragment)
  }
}

function renderCurrentSlots() {
  const ul = document.getElementById('current-slots')
  ul.replaceChildren()
  for (const slot of SLOT_ORDER) {
    const id = state.selected[slot]
    const comp = id ? state.components.find((x) => x.id === id) : null
    const li = document.createElement('li')
    const name = document.createElement('strong')
    name.textContent = `${SLOT_LABELS[slot]}：`
    li.appendChild(name)
    li.appendChild(
      document.createTextNode(comp ? comp.label : '未选'),
    )
    ul.appendChild(li)
  }
}

function renderSwatches() {
  const root = document.getElementById('theme-swatches')
  root.replaceChildren()
  for (const color of THEME_PRESETS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'swatch'
    btn.style.background = color
    btn.title = color
    btn.setAttribute('role', 'radio')
    btn.setAttribute('aria-checked', color === state.themeColor ? 'true' : 'false')
    btn.addEventListener('click', () => {
      state.themeColor = color
      renderAvatar()
      renderSwatches()
      renderPicker()
      markDirty()
    })
    root.appendChild(btn)
  }
}

function renderPicker() {
  const grid = document.getElementById('picker-grid')
  grid.replaceChildren()
  for (const slot of SLOT_ORDER) {
    const card = document.createElement('section')
    card.className = 'slot-card'
    const items = state.bySlot[slot] || []
    const header = document.createElement('header')
    const h3 = document.createElement('h3')
    h3.textContent = SLOT_LABELS[slot]
    const clear = document.createElement('button')
    clear.className = 'clear'
    clear.type = 'button'
    clear.textContent = '清空'
    clear.addEventListener('click', () => {
      state.selected[slot] = null
      renderAvatar()
      renderCurrentSlots()
      renderPicker()
      markDirty()
    })
    header.appendChild(h3)
    header.appendChild(clear)
    card.appendChild(header)

    const opts = document.createElement('div')
    opts.className = 'options'
    if (items.length === 0) {
      const p = document.createElement('p')
      p.className = 'hint'
      p.textContent = '暂无可选部件'
      opts.appendChild(p)
    } else {
      for (const c of items) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'option'
        btn.setAttribute(
          'aria-pressed',
          c.id === state.selected[slot] ? 'true' : 'false',
        )
        btn.dataset.id = String(c.id)

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('viewBox', '0 0 200 240')
        svg.setAttribute('width', '72')
        svg.setAttribute('height', '86')
        svg.setAttribute('aria-hidden', 'true')
        // 用 insertAdjacentHTML 注入，浏览器会自动应用 SVG 命名空间
        svg.insertAdjacentHTML(
          'beforeend',
          `<style>.t{fill:${state.themeColor};stroke:${state.themeColor}}</style>${c.svgFragment}`,
        )
        btn.appendChild(svg)

        const label = document.createElement('span')
        label.textContent = c.label
        btn.appendChild(label)

        btn.addEventListener('click', () => {
          state.selected[slot] = c.id
          renderAvatar()
          renderCurrentSlots()
          renderPicker()
          markDirty()
        })
        opts.appendChild(btn)
      }
    }
    card.appendChild(opts)
    grid.appendChild(card)
  }
}

function renderUpdatedAt() {
  const el = document.getElementById('updated-at')
  if (!state.updatedAt) {
    el.textContent = ''
    return
  }
  const d = new Date(state.updatedAt + 'Z')
  el.textContent = `最近更新：${d.toLocaleString('zh-CN')}`
}

function setStatus(kind, msg) {
  const el = document.getElementById('status')
  el.classList.remove('status--ok', 'status--err', 'status--idle')
  el.classList.add(`status--${kind}`)
  el.textContent = msg
}

function markDirty() {
  const btn = document.getElementById('save-btn')
  btn.disabled = false
  setStatus('idle', '有未保存的修改')
}

async function init() {
  const saveBtn = document.getElementById('save-btn')
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true
    setStatus('idle', '保存中…')
    try {
      await saveMyAvatar()
      setStatus('ok', '已保存')
      renderUpdatedAt()
    } catch (e) {
      setStatus('err', e.message || '保存失败')
      saveBtn.disabled = false
    }
  })

  try {
    await fetchCsrf()
    await fetchComponents()
    const data = await fetchMyAvatar()
    if (data && data.unauthenticated) {
      setStatus('err', '请先登录后再编辑')
      saveBtn.disabled = true
      return
    }
    renderAvatar()
    renderCurrentSlots()
    renderSwatches()
    renderPicker()
    renderUpdatedAt()
    setStatus('ok', data && data.avatar ? '已加载当前穿搭' : '当前为空，开始搭配')
    saveBtn.disabled = true
  } catch (e) {
    setStatus('err', e.message || '初始化失败')
  }
}

init()