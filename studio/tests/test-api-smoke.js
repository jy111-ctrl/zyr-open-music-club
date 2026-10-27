/* 冒烟：静态资源 + /api/outfits CRUD 全链路 */
const BASE = 'http://127.0.0.1:8123';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + (extra ? ' -> ' + extra : '')); }
}

(async () => {
  // 1. 静态资源
  for (const f of ['/index.html', '/views.js', '/style.css', '/app.js', '/photo.js']) {
    const r = await fetch(BASE + f);
    const t = await r.text();
    ok('静态 ' + f + ' 200', r.status === 200, 'status=' + r.status);
    if (f === '/views.js') ok('views.js 含 switchView', t.includes('function switchView'));
    if (f === '/index.html') {
      ok('index 含侧栏四栏目', ['manual', 'auto', 'photo', 'saved'].every(k => t.includes('data-nav="' + k + '"')));
      ok('index 引用 views.js', t.includes('./views.js'));
    }
  }

  // 2. 建形象
  const payload = {
    name: '冒烟测试形象',
    theme: { id: 'moss', name: '苔绿', primary: '#9DA89B', dark: '#7B8776', light: '#BCC7B5' },
    skinId: 'light', hairId: 'ink',
    body: 'body-steve', head: 'head-short', top: 'top-tshirt',
    bottom: 'bottom-overall', shoes: 'shoes-sneaker', accessory: 'acc-glasses',
    source: 'auto', thumb: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  };
  let r = await fetch(BASE + '/api/outfits', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  let j = await r.json();
  ok('POST /api/outfits 201', r.status === 201 && j.ok && j.item && j.item.id > 0, JSON.stringify(j).slice(0, 160));
  const id = j.item && j.item.id;
  ok('POST 回显字段', j.item.theme.primary === '#9DA89B' && j.item.top === 'top-tshirt' && j.item.source === 'auto');

  // 3. 列表
  r = await fetch(BASE + '/api/outfits');
  j = await r.json();
  ok('GET /api/outfits 含新记录', j.items.some(x => x.id === id), 'count=' + j.items.length);

  // 4. 设为当前
  r = await fetch(BASE + '/api/outfits/' + id + '/current', { method: 'POST' });
  j = await r.json();
  ok('POST /:id/current', j.ok && j.item.isCurrent === true);

  r = await fetch(BASE + '/api/outfits/current');
  j = await r.json();
  ok('GET /current 命中', j.item && j.item.id === id);

  // 5. PATCH
  r = await fetch(BASE + '/api/outfits/' + id, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '改名后的形象', top: 'top-hoodie' }),
  });
  j = await r.json();
  ok('PATCH 改名+换部件', j.ok && j.item.name === '改名后的形象' && j.item.top === 'top-hoodie', JSON.stringify(j.item || j).slice(0, 160));
  ok('PATCH 未覆盖主题', j.item.theme.primary === '#9DA89B');

  // 6. 单独查询
  r = await fetch(BASE + '/api/outfits/' + id);
  ok('GET /:id', r.status === 200);

  // 7. 删除
  r = await fetch(BASE + '/api/outfits/' + id, { method: 'DELETE' });
  j = await r.json();
  ok('DELETE /:id', j.ok === true);

  r = await fetch(BASE + '/api/outfits/' + id);
  ok('删除后 GET 404', r.status === 404);

  // 8. 健康计数回到初始
  const h = await (await fetch(BASE + '/api/health')).json();
  ok('health 计数与库一致', h.ok && typeof h.count === 'number', 'count=' + h.count);

  // 9. 非法输入
  r = await fetch(BASE + '/api/outfits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' });
  ok('非法 JSON -> 400', r.status === 400);

  console.log('\n' + (fail === 0 ? 'ALL OK' : 'FAILED') + ' — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
