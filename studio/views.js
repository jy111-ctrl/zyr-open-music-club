/* ============================================================
 * views.js — 视图路由 / 自动换装 / 形象保存与数据库
 * ------------------------------------------------------------
 * 依赖（app.js / photo.js 提供的全局）
 *   state · ALL_PARTS · THEMES · SKINS · HAIR_COLORS · PX · W · H
 *   buildCompositeGrid · renderFineGrid · renderMusicDecor
 *   renderAvatar · renderPickerGrid · renderCurrentSlots
 *   renderPaletteSwatches · renderSkinSwatches · renderPlayerThumb
 *
 * 后端（serve.js）：GET /api/health、/api/outfits CRUD、POST /:id/current
 * 服务不可用时自动降级为 localStorage。
 * ========================================================== */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const SLOTS = ['body', 'head', 'top', 'bottom', 'shoes', 'accessory'];
  const LOCK_LABELS = {
    body: '体型', head: '头部', top: '上装',
    bottom: '下装', shoes: '鞋子', accessory: '配饰',
  };

  // ============================================================
  // 0. 视图定义
  // ============================================================
  const VIEWS = {
    manual: { title: '换装工坊', sub: '逐槽位微调你的角色形象 — 服饰 / 发型 / 配饰自由混搭' },
    auto: { title: '自动换装', sub: '挑一个风格预设，一键随机组合出整套协调搭配' },
    photo: { title: '照片定制', sub: '从一张照片提取配色与风格，生成 3 套专属音乐小人' },
    saved: { title: '我的形象', sub: '所有保存过的形象都写入本地 SQLite，随时取回继续编辑' },
  };

  // ============================================================
  // 1. 自动换装：风格预设
  // ============================================================
  const PRESETS = [
    {
      id: 'street', name: '街头日常', en: 'Street', desc: 'T 恤卫衣 / 牛仔工装 / 运动鞋',
      themes: ['moss', 'mist', 'camel', 'latte'], hair: ['ink', 'brown', 'sand', 'smoke'],
      body: ['body-steve', 'body-alex', 'body-villager'],
      head: ['head-short', 'head-pony', 'head-curly', 'head-buns', 'head-twin', 'head-band'],
      top: ['top-tshirt', 'top-hoodie', 'top-jacket', 'top-sweater', 'top-star', 'top-melon', 'top-music', 'top-vest'],
      bottom: ['bottom-jeans', 'bottom-sweat', 'bottom-shorts', 'bottom-casual', 'bottom-cargo'],
      shoes: ['shoes-sneaker', 'shoes-boot'],
      accessory: ['acc-glasses', 'acc-scarf', 'acc-backpack', 'acc-wolf', 'acc-ocelot'],
    },
    {
      id: 'preppy', name: '学院文雅', en: 'Preppy', desc: '衬衫针织 / 半裙长裤 / 皮鞋',
      themes: ['camel', 'mauve', 'rose', 'latte'], hair: ['ink', 'brown', 'sand', 'silver'],
      body: ['body-steve', 'body-alex'],
      head: ['head-short', 'head-long', 'head-band', 'head-pony'],
      top: ['top-shirt', 'top-suit', 'top-labcoat', 'top-vest', 'top-sweater'],
      bottom: ['bottom-skirt', 'bottom-pleated', 'bottom-long-skirt', 'bottom-leggings', 'bottom-casual'],
      shoes: ['shoes-leather', 'shoes-sandal'],
      accessory: ['acc-glasses', 'acc-scarf'],
    },
    {
      id: 'stage', name: '舞台演出', en: 'Stage', desc: '斗篷礼服 / 长裙王冠 / 宝石',
      themes: ['mauve', 'chestnut', 'rose', 'teal'], hair: ['ink', 'ember', 'lilac', 'silver'],
      body: ['body-steve', 'body-alex', 'body-enderman'],
      head: ['head-crown', 'head-wing', 'head-pointy', 'head-buns', 'head-long'],
      top: ['top-cape', 'top-dress', 'top-navy', 'top-pirate', 'top-armor'],
      bottom: ['bottom-long-skirt', 'bottom-skirt', 'bottom-pleated', 'bottom-qipao'],
      shoes: ['shoes-boot', 'shoes-leather'],
      accessory: ['acc-pearl', 'acc-sword', 'acc-ocelot'],
    },
    {
      id: 'adventure', name: '冒险旅途', en: 'Adventure', desc: '胸甲斗篷 / 工装靴子 / 剑与镐',
      themes: ['moss', 'chestnut', 'teal', 'camel'], hair: ['ink', 'brown', 'ember', 'sage'],
      body: ['body-steve', 'body-villager', 'body-enderman'],
      head: ['head-helm', 'head-band', 'head-pointy', 'head-bald'],
      top: ['top-armor', 'top-cape', 'top-jacket', 'top-pirate', 'top-navy'],
      bottom: ['bottom-cargo', 'bottom-overall', 'bottom-jeans', 'bottom-casual'],
      shoes: ['shoes-boot'],
      accessory: ['acc-sword', 'acc-pickaxe', 'acc-backpack', 'acc-wolf'],
    },
    {
      id: 'resort', name: '海边度假', en: 'Resort', desc: '西瓜 T 沙滩裤 / 凉拖 / 宝石',
      themes: ['mist', 'teal', 'rose', 'latte'], hair: ['sand', 'brown', 'smoke', 'ember'],
      body: ['body-steve', 'body-alex', 'body-villager'],
      head: ['head-bald', 'head-short', 'head-pony', 'head-twin'],
      top: ['top-melon', 'top-tshirt', 'top-vest', 'top-wetsuit', 'top-dress'],
      bottom: ['bottom-swim', 'bottom-shorts', 'bottom-skirt'],
      shoes: ['shoes-sandal', 'shoes-slipper'],
      accessory: ['acc-pearl', 'acc-glasses'],
    },
    {
      id: 'club', name: '音乐现场', en: 'Music Club', desc: '音符 T 卫衣 / 头巾 / 项链',
      themes: ['mauve', 'moss', 'chestnut', 'teal'], hair: ['ink', 'ember', 'lilac', 'smoke', 'silver'],
      body: ['body-steve', 'body-alex', 'body-villager'],
      head: ['head-band', 'head-pony', 'head-curly', 'head-buns', 'head-wing'],
      top: ['top-music', 'top-star', 'top-hoodie', 'top-tshirt', 'top-jacket', 'top-sweater'],
      bottom: ['bottom-jeans', 'bottom-sweat', 'bottom-skirt', 'bottom-casual'],
      shoes: ['shoes-sneaker', 'shoes-leather'],
      accessory: ['acc-glasses', 'acc-scarf', 'acc-pearl'],
    },
    {
      id: 'lounge', name: '居家放松', en: 'Lounge', desc: '毛衣运动裤 / 拖鞋 / 猫狗相伴',
      themes: ['latte', 'rose', 'camel', 'moss'], hair: ['ink', 'brown', 'silver', 'sage'],
      body: ['body-steve', 'body-villager'],
      head: ['head-bald', 'head-buns', 'head-short', 'head-curly'],
      top: ['top-sweater', 'top-tshirt', 'top-hoodie'],
      bottom: ['bottom-sweat', 'bottom-leggings', 'bottom-shorts'],
      shoes: ['shoes-slipper', 'shoes-sandal'],
      accessory: ['acc-scarf', 'acc-ocelot', 'acc-wolf', 'acc-glasses'],
    },
  ];

  const ui = {
    preset: 'street',
    locks: new Set(),
    keepTheme: true,
    recent: [],
    online: true,
    saving: false,
    source: 'manual',
  };

  // ============================================================
  // 2. 状态快照 / 缩略渲染
  // ============================================================
  function snapshotState() {
    return {
      theme: state.theme, skin: state.skin, hair: state.hair,
      body: state.body, head: state.head, top: state.top,
      bottom: state.bottom, shoes: state.shoes, accessory: state.accessory,
    };
  }

  function applyState(o) {
    if (!o) return;
    if (o.theme) state.theme = o.theme;
    if (o.skin) state.skin = o.skin;
    if (o.hair) state.hair = o.hair;
    SLOTS.forEach((s) => { if (s in o) state[s] = o[s]; });
  }

  const themeById = (id) => THEMES.find((t) => t.id === id) || null;
  const hairById = (id) => HAIR_COLORS.find((h) => h.id === id) || null;

  // 用给定配置渲染一张 SVG 字符串，不污染当前 state
  function miniSvg(scale, cfg, withDecor) {
    const backup = snapshotState();
    const grid = (function () {
      try {
        if (cfg) applyState(cfg);
        return buildCompositeGrid();
      } finally {
        applyState(backup);
      }
    })();
    const at = (c, r) => (r < 0 || r >= H || c < 0 || c >= W ? null : grid[r][c]);
    const w = W * PX * scale;
    const h = H * PX * scale;
    const inner = renderFineGrid(at, 0, 0, H, W, scale);
    const decor = withDecor ? renderMusicDecor() : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${decor}${inner}</svg>`;
  }

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // ============================================================
  // 3. Toast
  // ============================================================
  let toastTimer = 0;
  function toast(msg, kind) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.dataset.kind = kind || 'info';
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }

  // ============================================================
  // 4. 数据层：HTTP + localStorage 降级
  // ============================================================
  const LS_KEY = 'avatar-studio/outfits';

  function lsRead() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function lsWrite(items) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch (e) { /* 忽略配额错误 */ }
  }

  async function api(path, opts) {
    const res = await fetch('/api' + path, {
      headers: { 'Content-Type': 'application/json' },
      ...(opts || {}),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || !data || data.ok === false) {
      throw new Error((data && data.error) || 'HTTP ' + res.status);
    }
    return data;
  }

  const store = {
    async health() {
      const d = await api('/health');
      ui.online = true;
      return d;
    },
    async list() {
      try {
        const d = await api('/outfits');
        ui.online = true;
        return d.items || [];
      } catch (e) {
        ui.online = false;
        return lsRead();
      }
    },
    async create(payload) {
      try {
        const d = await api('/outfits', { method: 'POST', body: JSON.stringify(payload) });
        ui.online = true;
        return d.item;
      } catch (e) {
        ui.online = false;
        const items = lsRead();
        const now = new Date().toISOString();
        const item = { ...payload, id: Date.now(), isCurrent: false, createdAt: now, updatedAt: now };
        items.unshift(item);
        lsWrite(items);
        return item;
      }
    },
    async remove(id) {
      try {
        await api('/outfits/' + id, { method: 'DELETE' });
        ui.online = true;
      } catch (e) {
        ui.online = false;
        lsWrite(lsRead().filter((x) => String(x.id) !== String(id)));
      }
    },
    async setCurrent(id) {
      try {
        const d = await api('/outfits/' + id + '/current', { method: 'POST' });
        ui.online = true;
        return d.item;
      } catch (e) {
        ui.online = false;
        const items = lsRead().map((x) => ({ ...x, isCurrent: String(x.id) === String(id) }));
        lsWrite(items);
        return items.find((x) => x.isCurrent) || null;
      }
    },
  };

  // ============================================================
  // 5. 视图切换
  // ============================================================
  function switchView(name, opts) {
    if (!VIEWS[name]) name = 'manual';
    const o = opts || {};
    document.body.dataset.view = name;

    document.querySelectorAll('section.view').forEach((el) => {
      el.hidden = el.dataset.view !== name;
    });
    document.querySelectorAll('.nav-item').forEach((b) => {
      if (b.dataset.nav === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    const t = $('view-title');
    const s = $('view-sub');
    if (t) t.textContent = VIEWS[name].title;
    if (s) s.textContent = VIEWS[name].sub;

    const saveBtn = $('save-btn');
    if (saveBtn) saveBtn.hidden = name === 'saved';

    const hash = '#/' + name;
    if (location.hash !== hash) {
      if (o.replaceHash) history.replaceState(null, '', hash);
      else location.hash = hash;
    }

    if (name === 'auto') { repaintAutoStage(); renderPresetGrid(); renderLockRow(); renderRecent(); }
    if (name === 'saved') refreshSaved();
    if (!o.keepScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bindNav() {
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.nav === document.body.dataset.view) {
          if (btn.dataset.nav === 'saved') refreshSaved();
          return;
        }
        switchView(btn.dataset.nav);
      });
    });

    window.addEventListener('hashchange', () => {
      const name = (location.hash || '').replace(/^#\/?/, '') || 'manual';
      if (name !== document.body.dataset.view) {
        switchView(name, { replaceHash: true, keepScroll: true });
      }
    });
  }

  // 手动视图 + 底部播放条一起刷新
  function repaintAll() {
    renderPaletteSwatches();
    renderSkinSwatches();
    renderCurrentSlots();
    renderPickerGrid();
    renderAvatar();
  }

  // ============================================================
  // 6. 自动换装引擎
  // ============================================================
  function repaintAutoStage() {
    const svg = $('auto-avatar-svg');
    if (!svg) return;
    const grid = buildCompositeGrid();
    const at = (c, r) => (r < 0 || r >= H || c < 0 || c >= W ? null : grid[r][c]);
    svg.innerHTML = renderMusicDecor() + renderFineGrid(at, 0, 0, H, W, 1);
  }

  function renderPresetGrid() {
    const wrap = $('auto-styles');
    if (!wrap) return;
    wrap.innerHTML = PRESETS.map((p) => `
      <button class="style-card" type="button" data-preset="${p.id}" aria-pressed="${p.id === ui.preset}">
        <span class="style-card-top">
          <span class="style-dots">${p.themes.map((id) => {
            const th = themeById(id);
            return th ? `<i style="background:${th.primary}"></i>` : '';
          }).join('')}</span>
          <span class="style-en">${p.en}</span>
        </span>
        <strong>${p.name}</strong>
        <em>${p.desc}</em>
      </button>
    `).join('');

    wrap.querySelectorAll('.style-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.preset = btn.dataset.preset;
        renderPresetGrid();
      });
    });
  }

  function renderLockRow() {
    const wrap = $('auto-locks');
    if (!wrap) return;
    wrap.innerHTML = SLOTS.map((slot) => `
      <button class="lock-chip" type="button" data-lock="${slot}" aria-pressed="${ui.locks.has(slot)}">
        <span class="lock-ico" aria-hidden="true">${ui.locks.has(slot) ? '●' : '○'}</span>${LOCK_LABELS[slot]}
      </button>
    `).join('');

    wrap.querySelectorAll('.lock-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slot = btn.dataset.lock;
        if (ui.locks.has(slot)) ui.locks.delete(slot);
        else ui.locks.add(slot);
        renderLockRow();
      });
    });
  }

  function roll(presetId) {
    const preset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];

    if (!ui.locks.has('body')) state.body = rnd(preset.body);

    if (!ui.locks.has('head')) {
      state.head = rnd(preset.head);
      const hairPool = preset.hair && preset.hair.length ? preset.hair : HAIR_COLORS.map((h) => h.id);
      state.hair = hairById(rnd(hairPool)) || state.hair;
      state.skin = rnd(SKINS);
    }

    if (!ui.locks.has('top')) state.top = rnd(preset.top);
    if (!ui.locks.has('bottom')) state.bottom = rnd(preset.bottom);
    if (!ui.locks.has('shoes')) state.shoes = rnd(preset.shoes);
    if (!ui.locks.has('accessory')) {
      state.accessory = Math.random() < 0.15 ? null : rnd(preset.accessory);
    }

    if (!ui.keepTheme) {
      const pool = preset.themes && preset.themes.length ? preset.themes : THEMES.map((t) => t.id);
      state.theme = themeById(rnd(pool)) || state.theme;
    }

    ui.source = 'auto';
    repaintAll();
    repaintAutoStage();

    const caption = $('auto-caption');
    if (caption) {
      const th = themeById(state.theme.id);
      caption.textContent = `${preset.name} · ${th ? th.name : ''}主题 — 不满意就再摇一次`;
    }
    pushRecent(preset.name);
  }

  function rollRandom() {
    SLOTS.forEach((slot) => {
      if (ui.locks.has(slot)) return;
      const parts = ALL_PARTS[slot];
      state[slot] = rnd(parts).id;
    });
    state.hair = rnd(HAIR_COLORS);
    state.skin = rnd(SKINS);
    if (!ui.keepTheme) state.theme = rnd(THEMES);

    ui.source = 'auto';
    repaintAll();
    repaintAutoStage();
    const caption = $('auto-caption');
    if (caption) caption.textContent = '完全随机 — 可能很怪，但偶尔会惊喜';
    pushRecent('完全随机');
  }

  function pushRecent(label) {
    const snap = snapshotState();
    ui.recent.unshift({
      key: String(Date.now()) + Math.random().toFixed(4),
      label: label,
      snap: snap,
      thumb: miniSvg(0.25, snap, false),
      at: new Date().toISOString(),
    });
    if (ui.recent.length > 6) ui.recent.length = 6;
    renderRecent();
  }

  function renderRecent() {
    const wrap = $('auto-recent');
    if (!wrap) return;
    if (!ui.recent.length) {
      wrap.innerHTML = '<p class="auto-recent-empty">还没有生成记录 — 换几套试试。</p>';
      return;
    }
    wrap.innerHTML = ui.recent.map((r) => `
      <button class="recent-row" type="button" data-recent="${r.key}">
        <span class="recent-thumb">${r.thumb}</span>
        <span class="recent-info">
          <strong>${r.label}</strong>
          <em>${fmtTime(r.at)}</em>
        </span>
        <span class="recent-apply">套用</span>
      </button>
    `).join('');

    wrap.querySelectorAll('.recent-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const hit = ui.recent.find((r) => r.key === btn.dataset.recent);
        if (!hit) return;
        applyState(hit.snap);
        ui.source = 'auto';
        repaintAll();
        repaintAutoStage();
        toast('已套用「' + hit.label + '」');
      });
    });
  }

  function bindAuto() {
    const rollBtn = $('auto-roll');
    if (rollBtn) rollBtn.addEventListener('click', () => roll(ui.preset));

    const randBtn = $('auto-random');
    if (randBtn) randBtn.addEventListener('click', rollRandom);

    const keep = $('auto-keep-theme');
    if (keep) {
      ui.keepTheme = keep.checked;
      keep.addEventListener('change', () => { ui.keepTheme = keep.checked; });
    }
  }

  // ============================================================
  // 7. 保存形象
  // ============================================================
  function defaultName() {
    const th = themeById(state.theme.id);
    const preset = PRESETS.find((p) => p.id === ui.preset);
    const base = ui.source === 'photo' ? '照片形象' : (preset ? preset.name : '形象');
    return `${base} · ${th ? th.name : '莫兰迪'}`;
  }

  function openSaveModal(source) {
    if (source) ui.source = source;
    const modal = $('save-modal');
    const input = $('save-name');
    if (!modal || !input) return;
    input.value = defaultName();
    const sub = $('save-modal-sub');
    if (sub) {
      sub.textContent = ui.online
        ? '写入本地 SQLite · avatar_outfits 表'
        : '服务未连接 · 暂存浏览器 localStorage';
    }
    modal.hidden = false;
    setTimeout(() => { input.focus(); input.select(); }, 30);
  }

  function closeSaveModal() {
    const modal = $('save-modal');
    if (modal) modal.hidden = true;
  }

  function currentPayload(name) {
    return {
      name: name,
      theme: {
        id: state.theme.id,
        name: state.theme.name,
        primary: state.theme.primary,
        dark: state.theme.dark,
        light: state.theme.light,
      },
      skinId: state.skin.id,
      hairId: state.hair.id,
      body: state.body,
      head: state.head,
      top: state.top,
      bottom: state.bottom,
      shoes: state.shoes,
      accessory: state.accessory,
      source: ['manual', 'auto', 'photo'].includes(ui.source) ? ui.source : 'manual',
      thumb: miniSvg(0.5, null, false),
    };
  }

  async function confirmSave() {
    if (ui.saving) return;
    const input = $('save-name');
    const name = (input && input.value.trim()) || defaultName();
    ui.saving = true;
    const btn = $('save-confirm');
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    try {
      const item = await store.create(currentPayload(name));
      closeSaveModal();
      toast(ui.online ? `已保存到数据库：#${item.id} ${name}` : '服务未连接，已暂存到浏览器', ui.online ? 'ok' : 'warn');
      pingDb();
      if (document.body.dataset.view === 'saved') refreshSaved();
    } catch (e) {
      toast('保存失败：' + e.message, 'err');
    } finally {
      ui.saving = false;
      if (btn) { btn.disabled = false; btn.textContent = '保存'; }
    }
  }

  function bindSave() {
    const openers = [$('save-btn'), $('saved-save')];
    openers.forEach((b) => {
      if (b) b.addEventListener('click', () => openSaveModal(document.body.dataset.view === 'auto' ? 'auto' : ui.source));
    });

    const cancel = $('save-cancel');
    if (cancel) cancel.addEventListener('click', closeSaveModal);

    const ok = $('save-confirm');
    if (ok) ok.addEventListener('click', confirmSave);

    const name = $('save-name');
    if (name) {
      name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); confirmSave(); }
        if (e.key === 'Escape') { e.preventDefault(); closeSaveModal(); }
      });
    }

    const modal = $('save-modal');
    if (modal) {
      modal.addEventListener('click', (e) => { if (e.target === modal) closeSaveModal(); });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSaveModal();
    });
  }

  // ============================================================
  // 8. 我的形象
  // ============================================================
  function partLabel(slot, id) {
    if (!id) return null;
    const p = (ALL_PARTS[slot] || []).find((x) => x.id === id);
    return p ? p.label : null;
  }

  function sourceLabel(s) {
    return { manual: '手动搭配', auto: '自动换装', photo: '照片定制' }[s] || '手动搭配';
  }

  function outfitCard(item) {
    const thumb = item.thumb || miniSvg(0.25, {
      theme: item.theme, skin: skinByIdSafe(item.skinId), hair: hairById(item.hairId),
      body: item.body, head: item.head, top: item.top,
      bottom: item.bottom, shoes: item.shoes, accessory: item.accessory,
    }, false);

    const bits = [
      partLabel('top', item.top), partLabel('bottom', item.bottom),
      partLabel('shoes', item.shoes), partLabel('accessory', item.accessory),
    ].filter(Boolean).join(' / ');

    return `
      <article class="saved-card${item.isCurrent ? ' is-current' : ''}" data-id="${item.id}">
        <div class="saved-thumb">${thumb}</div>
        <div class="saved-body">
          <header>
            <h4>${escapeHtml(item.name)}</h4>
            ${item.isCurrent ? '<span class="saved-badge">当前</span>' : ''}
          </header>
          <p class="saved-meta">
            <span class="dot" style="background:${item.theme ? item.theme.primary : '#8A9A85'}"></span>
            ${item.theme ? escapeHtml(item.theme.name) : '莫兰迪'} · ${sourceLabel(item.source)} · ${fmtTime(item.createdAt)}
          </p>
          <p class="saved-parts">${bits || '无部件信息'}</p>
          <div class="saved-actions">
            <button class="btn btn--tiny btn--primary" data-act="apply" type="button">套用</button>
            <button class="btn btn--tiny" data-act="current" type="button"${item.isCurrent ? ' disabled' : ''}>设为当前</button>
            <button class="btn btn--tiny btn--ghost" data-act="del" type="button">删除</button>
          </div>
        </div>
      </article>
    `;
  }

  function skinByIdSafe(id) {
    return SKINS.find((s) => s.id === id) || SKINS[0];
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }

  let savedItems = [];

  async function refreshSaved() {
    const grid = $('saved-grid');
    const empty = $('saved-empty');
    if (!grid) return;
    grid.innerHTML = '<p class="saved-loading">读取数据库中…</p>';
    if (empty) empty.hidden = true;

    try {
      savedItems = await store.list();
    } catch (e) {
      savedItems = [];
    }

    if (!savedItems.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      await pingDb();
      return;
    }

    grid.innerHTML = savedItems.map(outfitCard).join('');
    grid.querySelectorAll('.saved-card').forEach((card) => bindCard(card));
    await pingDb();
  }

  function bindCard(card) {
    const id = Number(card.dataset.id);
    const item = savedItems.find((x) => Number(x.id) === id);
    if (!item) return;

    const apply = card.querySelector('[data-act="apply"]');
    if (apply) {
      apply.addEventListener('click', () => {
        applyState({
          theme: item.theme, skin: skinByIdSafe(item.skinId), hair: hairById(item.hairId),
          body: item.body, head: item.head, top: item.top,
          bottom: item.bottom, shoes: item.shoes, accessory: item.accessory,
        });
        ui.source = item.source || 'manual';
        repaintAll();
        repaintAutoStage();
        switchView('manual');
        toast('已套用「' + item.name + '」');
      });
    }

    const cur = card.querySelector('[data-act="current"]');
    if (cur) {
      cur.addEventListener('click', async () => {
        cur.disabled = true;
        try {
          await store.setCurrent(item.id);
          toast('已设为当前形象');
          refreshSaved();
        } catch (e) {
          cur.disabled = false;
          toast('设置失败：' + e.message, 'err');
        }
      });
    }

    const del = card.querySelector('[data-act="del"]');
    if (del) {
      let armed = false;
      let timer = 0;
      del.addEventListener('click', async () => {
        if (!armed) {
          armed = true;
          del.textContent = '确认删除';
          del.classList.add('is-armed');
          timer = setTimeout(() => {
            armed = false;
            del.textContent = '删除';
            del.classList.remove('is-armed');
          }, 3200);
          return;
        }
        clearTimeout(timer);
        del.disabled = true;
        try {
          await store.remove(item.id);
          toast('已删除「' + item.name + '」');
          refreshSaved();
        } catch (e) {
          del.disabled = false;
          toast('删除失败：' + e.message, 'err');
        }
      });
    }
  }

  function bindSaved() {
    const r = $('saved-refresh');
    if (r) r.addEventListener('click', () => { refreshSaved(); toast('已刷新'); });
  }

  // ============================================================
  // 9. 数据库状态
  // ============================================================
  async function pingDb() {
    const navEl = $('nav-db');
    const card = $('db-card');
    try {
      const d = await store.health();
      ui.online = true;
      if (navEl) navEl.textContent = `SQLite 已连接 · ${d.count} 个形象`;
      const status = $('status');
      if (status) {
        status.textContent = 'DB ONLINE';
        status.classList.add('status--ok');
        status.classList.remove('status--err');
      }
      if (card) {
        card.hidden = false;
        card.innerHTML = `
          <div class="db-row"><span>驱动</span><strong>${escapeHtml(d.driver)}</strong></div>
          <div class="db-row"><span>数据表</span><strong>${escapeHtml(d.table)}</strong></div>
          <div class="db-row"><span>数据库文件</span><code>${escapeHtml(d.file)}</code></div>
          <div class="db-row"><span>已存形象</span><strong>${d.count}</strong></div>
        `;
      }
    } catch (e) {
      ui.online = false;
      if (navEl) navEl.textContent = '离线模式 · localStorage';
      const status = $('status');
      if (status) {
        status.textContent = 'DB OFFLINE';
        status.classList.add('status--err');
        status.classList.remove('status--ok');
      }
      if (card) {
        card.hidden = false;
        card.innerHTML = `
          <div class="db-row"><span>状态</span><strong>未连接（${escapeHtml(e.message)}）</strong></div>
          <div class="db-row"><span>降级方案</span><code>localStorage · ${LS_KEY}</code></div>
          <div class="db-row"><span>恢复方式</span><code>启动 serve.js 后刷新页面</code></div>
        `;
      }
    }
  }

  // ============================================================
  // 10. 与照片定制联动
  // ============================================================
  function wrapPhotoApply() {
    const raw = window.applyOutfit;
    if (typeof raw !== 'function' || raw.__wrapped) return;
    const wrapped = function (o) {
      ui.source = 'photo';
      switchView('manual', { keepScroll: true });
      window.setTimeout(() => { raw(o); }, 30);
    };
    wrapped.__wrapped = true;
    window.applyOutfit = wrapped;
  }

  // ============================================================
  // 11. 启动
  // ============================================================
  function init() {
    bindNav();
    bindAuto();
    bindSave();
    bindSaved();
    wrapPhotoApply();

    renderPresetGrid();
    renderLockRow();
    renderRecent();
    repaintAutoStage();

    const fromHash = (location.hash || '').replace(/^#\/?/, '');
    switchView(VIEWS[fromHash] ? fromHash : 'manual', { replaceHash: true, keepScroll: true });

    pingDb();
    window.setInterval(pingDb, 30000);

    // 调试入口
    window.AvatarViews = { switchView: switchView, roll: roll, refreshSaved: refreshSaved, ui: ui };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
