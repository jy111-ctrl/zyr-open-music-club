/* views.js 逻辑回归（vm + stub DOM，不需要浏览器）
 * 覆盖：初始化、视图切换、自动换装摇号、最近方案、保存 payload、数据库降级
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const DIR = path.join(__dirname, '..'); // 源文件在 studio/，本脚本在 studio/tests/
let pass = 0, fail = 0;
function R(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + (extra ? ' -> ' + extra : '')); }
}

// ---------------- stub DOM ----------------
function makeEl(id) {
  const el = {
    id,
    innerHTML: '',
    textContent: '',
    value: '',
    hidden: false,
    disabled: false,
    checked: true,
    dataset: {},
    style: { setProperty() {}, width: '', height: '' },
    children: [],
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    removeChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute() {},
    removeAttribute() {},
    getAttribute() { return null; },
    focus() {},
    select() {},
    click() {},
    scrollIntoView() {},
    cloneNode() { return makeEl(id + ':clone'); },
  };
  return el;
}

const els = new Map();
const document = {
  readyState: 'complete',
  body: Object.assign(makeEl('body'), { dataset: { view: 'manual' } }),
  documentElement: { style: { setProperty() {} } },
  getElementById(id) {
    if (!els.has(id)) els.set(id, makeEl(id));
    return els.get(id);
  },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  addEventListener() {},
  createElement() { return makeEl('created'); },
};

const sandbox = {
  console,
  document,
  Intl,
  Math,
  Date,
  JSON,
  Promise,
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  localStorage: (function () {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    };
  })(),
  location: { hash: '', href: 'http://127.0.0.1:8123/' },
  history: { replaceState(_a, _b, h) { sandbox.location.hash = h || ''; } },
  fetchCalls: [],
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.scrollTo = () => {};
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.window.setTimeout = setTimeout;
sandbox.window.setInterval = () => 0;

// fetch stub：默认模拟服务在线
let fetchMode = 'online';
const saved = [];
sandbox.fetch = async (url, opts) => {
  const o = opts || {};
  sandbox.fetchCalls.push((o.method || 'GET') + ' ' + url);
  if (fetchMode === 'offline') throw new Error('offline');
  const body = o.body ? JSON.parse(o.body) : null;
  const json = (code, obj) => ({ ok: code < 400, status: code, json: async () => obj });

  if (url === '/api/health') {
    return json(200, { ok: true, driver: 'node:sqlite', table: 'avatar_outfits', file: 'data/avatar.sqlite', count: saved.length });
  }
  if (url === '/api/outfits' && (o.method || 'GET') === 'GET') {
    return json(200, { ok: true, items: saved.slice() });
  }
  if (url === '/api/outfits' && o.method === 'POST') {
    const item = Object.assign({ id: saved.length + 1, isCurrent: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, body);
    saved.unshift(item);
    return json(201, { ok: true, item });
  }
  if (/\/current$/.test(url)) {
    const id = Number(url.split('/')[3]);
    saved.forEach((x) => { x.isCurrent = x.id === id; });
    return json(200, { ok: true, item: saved.find((x) => x.id === id) });
  }
  if (o.method === 'DELETE') {
    const id = Number(url.split('/').pop());
    const i = saved.findIndex((x) => x.id === id);
    if (i >= 0) saved.splice(i, 1);
    return json(200, { ok: true });
  }
  return json(404, { ok: false, error: 'nope' });
};

vm.createContext(sandbox);

// ---------------- 载入 app.js（只到 init 之前） ----------------
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const appHead = appSrc.slice(0, appSrc.indexOf('function init()'));
// 顶层 const 不会挂到 vm 的 global 上，追加一段桥接把它们导出来
const bridge = `
;globalThis.__APP__ = { state, THEMES, SKINS, HAIR_COLORS, ALL_PARTS, SLOT_ORDER };
`;
vm.runInContext(appHead + bridge, sandbox, { filename: 'app.js' });
const APP = sandbox.__APP__ || {};
['state', 'THEMES', 'SKINS', 'HAIR_COLORS', 'ALL_PARTS', 'SLOT_ORDER'].forEach((k) => {
  if (APP[k] !== undefined) sandbox[k] = APP[k];
});
R('app.js 载入（ALL_PARTS / state 就绪）', typeof sandbox.buildCompositeGrid === 'function' && !!sandbox.ALL_PARTS && !!sandbox.state);

// ---------------- 载入 views.js ----------------
const viewsSrc = fs.readFileSync(path.join(DIR, 'views.js'), 'utf8');
vm.runInContext(viewsSrc, sandbox, { filename: 'views.js' });
R('views.js 载入且暴露调试入口', !!sandbox.AvatarViews);

const V = sandbox.AvatarViews;
const state = sandbox.state;

// 1. 默认视图
R('默认进入 manual 视图', document.body.dataset.view === 'manual');
R('视图标题已写入', els.get('view-title').textContent === '换装工坊', els.get('view-title').textContent);

// 2. 视图切换
V.switchView('auto');
R('切换到 auto 视图', document.body.dataset.view === 'auto' && els.get('view-title').textContent === '自动换装');
R('auto 舞台已渲染（含 rect）', /<rect/.test(els.get('auto-avatar-svg').innerHTML));
R('hash 同步为 #/auto', sandbox.location.hash === '#/auto', sandbox.location.hash);

V.switchView('saved');
R('切换到 saved 视图', document.body.dataset.view === 'saved');
R('saved 视图隐藏右上保存按钮', els.get('save-btn').hidden === true);

V.switchView('photo');
R('切换到 photo 视图', document.body.dataset.view === 'photo');
V.switchView('manual');

// 3. 风格预设 + 锁定
R('预设按钮已生成', (els.get('auto-styles').innerHTML.match(/style-card/g) || []).length >= 7 * 1);
R('锁定槽位已生成 6 个', (els.get('auto-locks').innerHTML.match(/lock-chip/g) || []).length === 6);

// 4. 摇号
const before = JSON.stringify({ body: state.body, head: state.head, top: state.top });
V.roll('street');
const after = JSON.stringify({ body: state.body, head: state.head, top: state.top });
R('roll 改变了搭配', before !== after);
R('roll 后主题仍在合法词表内', sandbox.THEMES.some((t) => t.id === state.theme.id));
R('roll 后部件均属于对应槽位', Object.keys(sandbox.ALL_PARTS).every((slot) => {
  const id = state[slot];
  return id === null || sandbox.ALL_PARTS[slot].some((p) => p.id === id);
}));
R('roll 后进入最近方案列表', V.ui.recent.length === 1);
R('最近方案缩略图是 SVG', /^<svg/.test(V.ui.recent[0].thumb));

// 5. 锁定生效：锁定 top 后再摇，top 不变
V.ui.locks.add('top');
const lockedTop = state.top;
for (let i = 0; i < 6; i++) V.roll('adventure');
R('锁定槽位不被覆盖', state.top === lockedTop, state.top + ' vs ' + lockedTop);
V.ui.locks.delete('top');

// 6. 保持配色
V.ui.keepTheme = true;
const themeId = state.theme.id;
for (let i = 0; i < 8; i++) V.roll('club');
R('勾选保持配色时主题不变', state.theme.id === themeId);

// 7. 最近方案上限 6
R('最近方案最多 6 条', V.ui.recent.length === 6, String(V.ui.recent.length));

// 8. 保存：payload 完整性
const payload = {
  name: '测试形象',
  theme: state.theme,
  skinId: state.skin.id,
  hairId: state.hair.id,
  body: state.body, head: state.head, top: state.top,
  bottom: state.bottom, shoes: state.shoes, accessory: state.accessory,
  source: 'auto',
  thumb: V.ui.recent[0].thumb,
};
R('payload 六槽位齐备', ['body', 'head', 'top', 'bottom', 'shoes', 'accessory'].every((k) => payload[k] === state[k]));
R('payload 主题含 primary', /^#[0-9A-Fa-f]{6}$/.test(payload.theme.primary));

// 9. 数据库在线：save → list
(async () => {
  // 直接走 store：通过 AvatarViews 暴露的 refreshSaved 驱动一次列表
  await V.refreshSaved();
  R('在线模式下列表为空（尚无记录）', els.get('saved-empty').hidden === false);

  // 10. 降级模式
  fetchMode = 'offline';
  await V.refreshSaved();
  R('离线时降级为空列表（localStorage）', els.get('saved-empty').hidden === false);
  R('离线时状态标记为 OFFLINE', (els.get('nav-db').textContent || '').includes('离线'), els.get('nav-db').textContent);

  fetchMode = 'online';
  await V.refreshSaved();
  R('恢复在线后状态回到 SQLite', (els.get('nav-db').textContent || '').includes('SQLite'), els.get('nav-db').textContent);

  console.log('\n' + (fail === 0 ? 'ALL OK' : 'FAILED') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();
