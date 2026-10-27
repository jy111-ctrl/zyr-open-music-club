/* Avatar Studio 本地服务
 * - 静态资源：本目录
 * - POST /report：自检页回传
 * - /api/outfits…：形象保存（SQLite 持久化，data/avatar.sqlite）
 *
 * 数据库配置集中在下方 DB_CONFIG，改路径即可切换库。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 8123;

// ============================================================
// 数据库配置
// ============================================================
const DB_CONFIG = {
  dir: path.join(ROOT, 'data'),
  file: 'avatar.sqlite',
  table: 'avatar_outfits',
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS avatar_outfits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  theme_id      TEXT    NOT NULL,
  theme_name    TEXT,
  theme_primary TEXT    NOT NULL,
  theme_dark    TEXT,
  theme_light   TEXT,
  skin_id       TEXT    NOT NULL,
  hair_id       TEXT    NOT NULL,
  body_id       TEXT,
  head_id       TEXT,
  top_id        TEXT,
  bottom_id     TEXT,
  shoes_id      TEXT,
  accessory_id  TEXT,
  source        TEXT    NOT NULL DEFAULT 'manual',
  is_current    INTEGER NOT NULL DEFAULT 0,
  thumb         TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outfits_current ON avatar_outfits(is_current);
CREATE INDEX IF NOT EXISTS idx_outfits_created ON avatar_outfits(created_at);
`;

let db = null;
let dbError = null;

function initDb() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    fs.mkdirSync(DB_CONFIG.dir, { recursive: true });
    const file = path.join(DB_CONFIG.dir, DB_CONFIG.file);
    db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec(SCHEMA);
    console.log('[db] SQLite ready -> ' + file);
  } catch (e) {
    dbError = e.message;
    console.error('[db] 初始化失败: ' + e.message);
  }
}

const nowIso = () => new Date().toISOString();

function rowToItem(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    name: r.name,
    theme: {
      id: r.theme_id,
      name: r.theme_name || r.theme_id,
      primary: r.theme_primary,
      dark: r.theme_dark || r.theme_primary,
      light: r.theme_light || r.theme_primary,
    },
    skinId: r.skin_id,
    hairId: r.hair_id,
    body: r.body_id,
    head: r.head_id,
    top: r.top_id,
    bottom: r.bottom_id,
    shoes: r.shoes_id,
    accessory: r.accessory_id,
    source: r.source,
    isCurrent: !!r.is_current,
    thumb: r.thumb || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// 从请求体提取可写字段（payload 为前端 camelCase）
function payloadToRow(p) {
  const t = p.theme || {};
  return {
    name: String(p.name || '未命名形象').slice(0, 60),
    theme_id: String(t.id || 'custom'),
    theme_name: String(t.name || '自定义'),
    theme_primary: String(t.primary || '#7C3AED'),
    theme_dark: String(t.dark || t.primary || '#6D28D9'),
    theme_light: String(t.light || t.primary || '#C4B5FD'),
    skin_id: String(p.skinId || 'light'),
    hair_id: String(p.hairId || 'ink'),
    body_id: p.body ? String(p.body) : null,
    head_id: p.head ? String(p.head) : null,
    top_id: p.top ? String(p.top) : null,
    bottom_id: p.bottom ? String(p.bottom) : null,
    shoes_id: p.shoes ? String(p.shoes) : null,
    accessory_id: p.accessory ? String(p.accessory) : null,
    source: ['manual', 'auto', 'photo'].includes(p.source) ? p.source : 'manual',
    thumb: typeof p.thumb === 'string' ? p.thumb.slice(0, 200000) : null,
  };
}

function listOutfits() {
  return db.prepare(`SELECT * FROM ${DB_CONFIG.table} ORDER BY is_current DESC, id DESC`).all().map(rowToItem);
}

function getOutfit(id) {
  return rowToItem(db.prepare(`SELECT * FROM ${DB_CONFIG.table} WHERE id = ?`).get(id));
}

function createOutfit(payload) {
  const r = payloadToRow(payload);
  const ts = nowIso();
  const stmt = db.prepare(`
    INSERT INTO ${DB_CONFIG.table}
      (name, theme_id, theme_name, theme_primary, theme_dark, theme_light,
       skin_id, hair_id, body_id, head_id, top_id, bottom_id, shoes_id, accessory_id,
       source, is_current, thumb, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)
  `);
  const info = stmt.run(
    r.name, r.theme_id, r.theme_name, r.theme_primary, r.theme_dark, r.theme_light,
    r.skin_id, r.hair_id, r.body_id, r.head_id, r.top_id, r.bottom_id, r.shoes_id, r.accessory_id,
    r.source, r.thumb, ts, ts
  );
  return getOutfit(Number(info.lastInsertRowid));
}

function updateOutfit(id, payload) {
  const cur = getOutfit(id);
  if (!cur) return null;
  const r = payloadToRow({ ...cur, ...payload, theme: payload.theme || cur.theme });
  db.prepare(`
    UPDATE ${DB_CONFIG.table} SET
      name=?, theme_id=?, theme_name=?, theme_primary=?, theme_dark=?, theme_light=?,
      skin_id=?, hair_id=?, body_id=?, head_id=?, top_id=?, bottom_id=?, shoes_id=?, accessory_id=?,
      source=?, thumb=?, updated_at=?
    WHERE id=?
  `).run(
    r.name, r.theme_id, r.theme_name, r.theme_primary, r.theme_dark, r.theme_light,
    r.skin_id, r.hair_id, r.body_id, r.head_id, r.top_id, r.bottom_id, r.shoes_id, r.accessory_id,
    r.source, r.thumb, nowIso(), id
  );
  return getOutfit(id);
}

function deleteOutfit(id) {
  const info = db.prepare(`DELETE FROM ${DB_CONFIG.table} WHERE id = ?`).run(id);
  return Number(info.changes) > 0;
}

function setCurrent(id) {
  const cur = getOutfit(id);
  if (!cur) return null;
  db.exec(`UPDATE ${DB_CONFIG.table} SET is_current = 0 WHERE is_current = 1`);
  db.prepare(`UPDATE ${DB_CONFIG.table} SET is_current = 1, updated_at = ? WHERE id = ?`).run(nowIso(), id);
  return getOutfit(id);
}

function currentOutfit() {
  return rowToItem(db.prepare(`SELECT * FROM ${DB_CONFIG.table} WHERE is_current = 1 LIMIT 1`).get());
}

// ============================================================
// HTTP
// ============================================================
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => {
      body += c;
      if (body.length > limit) { reject(new Error('payload too large')); req.destroy(); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleApi(req, res, pathname) {
  if (!db) {
    return sendJson(res, 503, { ok: false, error: '数据库未就绪: ' + (dbError || 'unknown') });
  }

  // GET /api/health
  if (req.method === 'GET' && pathname === '/api/health') {
    const n = db.prepare(`SELECT COUNT(*) AS c FROM ${DB_CONFIG.table}`).get();
    return sendJson(res, 200, {
      ok: true,
      driver: 'node:sqlite',
      table: DB_CONFIG.table,
      file: path.join(DB_CONFIG.dir, DB_CONFIG.file),
      count: Number(n.c),
    });
  }

  // GET /api/outfits/current
  if (req.method === 'GET' && pathname === '/api/outfits/current') {
    return sendJson(res, 200, { ok: true, item: currentOutfit() });
  }

  // GET /api/outfits
  if (req.method === 'GET' && pathname === '/api/outfits') {
    return sendJson(res, 200, { ok: true, items: listOutfits() });
  }

  // POST /api/outfits
  if (req.method === 'POST' && pathname === '/api/outfits') {
    let payload;
    try { payload = JSON.parse(await readBody(req)); }
    catch (e) { return sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' }); }
    try {
      return sendJson(res, 201, { ok: true, item: createOutfit(payload) });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  // /api/outfits/:id 及子路径
  const m = pathname.match(/^\/api\/outfits\/(\d+)(\/current)?$/);
  if (m) {
    const id = Number(m[1]);
    const sub = m[2];

    if (sub === '/current' && req.method === 'POST') {
      const item = setCurrent(id);
      return item
        ? sendJson(res, 200, { ok: true, item })
        : sendJson(res, 404, { ok: false, error: '形象不存在' });
    }
    if (req.method === 'PATCH' || req.method === 'PUT') {
      let payload;
      try { payload = JSON.parse(await readBody(req)); }
      catch (e) { return sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' }); }
      const item = updateOutfit(id, payload);
      return item
        ? sendJson(res, 200, { ok: true, item })
        : sendJson(res, 404, { ok: false, error: '形象不存在' });
    }
    if (req.method === 'DELETE') {
      return deleteOutfit(id)
        ? sendJson(res, 200, { ok: true })
        : sendJson(res, 404, { ok: false, error: '形象不存在' });
    }
    if (req.method === 'GET') {
      const item = getOutfit(id);
      return item
        ? sendJson(res, 200, { ok: true, item })
        : sendJson(res, 404, { ok: false, error: '形象不存在' });
    }
  }

  return sendJson(res, 404, { ok: false, error: '未知接口 ' + pathname });
}

initDb();

http.createServer(async (req, res) => {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);

  // POST /report —— 自检页回传测试报告
  if (req.method === 'POST' && pathname === '/report') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      fs.writeFile(path.join(ROOT, 'selfcheck-report.json'), body, () => {});
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('{"ok":true}');
    });
    return;
  }

  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname);
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  let p = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found: ' + p); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('serving ' + ROOT + ' at http://127.0.0.1:' + PORT + '/');
});
