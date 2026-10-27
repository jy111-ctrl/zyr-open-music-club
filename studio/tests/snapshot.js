// 离线快照：stub 最小 DOM，加载 app.js，调用 renderAvatar() 捕获 SVG，
// 导出成静态 HTML，不依赖浏览器执行 JS 也能看到渲染效果。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', 'app.js');
const OUT = path.join(__dirname, 'snapshot.html');

function fakeEl() {
  return {
    addEventListener() {}, removeEventListener() {},
    querySelectorAll() { return { forEach() {} }; },
    querySelector() { return null; },
    classList: { toggle() {}, add() {}, remove() {} },
    style: { setProperty() {} }, dataset: {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild() {}, remove() {}, cloneNode() { return fakeEl(); },
    innerHTML: '', textContent: '', hidden: false, disabled: false,
    width: 240, height: 288,
    getContext() { return null; },
    scrollIntoView() {}, files: [], click() {},
  };
}

const els = {};
const stubDoc = {
  getElementById(id) { if (!els[id]) els[id] = fakeEl(); return els[id]; },
  querySelector() { return fakeEl(); },
  querySelectorAll() { return { forEach() {} }; },
  createElement() { return fakeEl(); },
  documentElement: { style: { setProperty() {} } },
  body: fakeEl(),
  addEventListener() {},
};

const sandbox = {
  document: stubDoc,
  console,
  setInterval: () => 0,
  setTimeout: () => 0,
  clearInterval: () => {},
  clearTimeout: () => {},
  requestAnimationFrame: () => 0,
  Math, JSON, Date, Object, Array, String, Number, Boolean, RegExp, Error,
  parseInt, parseFloat, isNaN, Set, Map,
  Uint8ClampedArray, Uint8Array, Float32Array, Image: function () {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.navigator = { userAgent: 'node' };

vm.createContext(sandbox);

const appCode = fs.readFileSync(APP, 'utf8');
vm.runInContext(appCode, sandbox, { filename: 'app.js' });

// 组合列表：切换 state 后调用 renderAvatar()，从 stub 元素里取 innerHTML
const COMBOS = [
  { label: '苔绿 · 短发 · T恤 · 背带裤 · 运动鞋 · 眼镜', theme: 0, skin: 0, hair: 0,
    body: 'body-steve', head: 'head-short', top: 'top-tshirt', bottom: 'bottom-overall', shoes: 'shoes-sneaker', accessory: 'acc-glasses' },
  { label: '雾蓝 · 长发 · 卫衣 · 长裙 · 靴子 · 双肩包', theme: 1, skin: 1, hair: 5,
    body: 'body-alex', head: 'head-long', top: 'top-hoodie', bottom: 'bottom-long-skirt', shoes: 'shoes-boot', accessory: 'acc-backpack' },
  { label: '暖驼 · 卷发 · 衬衫 · 工装裤 · 皮鞋 · 围巾', theme: 3, skin: 2, hair: 3,
    body: 'body-villager', head: 'head-curly', top: 'top-shirt', bottom: 'bottom-cargo', shoes: 'shoes-leather', accessory: 'acc-scarf' },
  { label: '灰粉 · 双丸子 · 毛衣 · 短裤 · 凉鞋 · 无配饰', theme: 4, skin: 3, hair: 6,
    body: 'body-enderman', head: 'head-buns', top: 'top-sweater', bottom: 'bottom-shorts', shoes: 'shoes-sandal', accessory: null },
  { label: '栗棕 · 马尾 · 西装 · 牛仔裤 · 皮鞋 · 小狗', theme: 6, skin: 0, hair: 1,
    body: 'body-steve', head: 'head-pony', top: 'top-suit', bottom: 'bottom-jeans', shoes: 'shoes-leather', accessory: 'acc-wolf' },
  { label: '灰紫 · 尖耳 · 星星T · 百褶裙 · 拖鞋 · 围巾', theme: 2, skin: 1, hair: 2,
    body: 'body-alex', head: 'head-pointy', top: 'top-star', bottom: 'bottom-pleated', shoes: 'shoes-slipper', accessory: 'acc-scarf' },
  { label: '烟青 · 短发 · 音符T · 百褶裙 · 皮鞋 · 宝石', theme: 5, skin: 0, hair: 4,
    body: 'body-steve', head: 'head-short', top: 'top-music', bottom: 'bottom-pleated', shoes: 'shoes-leather', accessory: 'acc-pearl' },
  { label: '奶咖 · 光头 · 潜水服 · 沙滩裤 · 拖鞋 · 钻石剑', theme: 7, skin: 2, hair: 0,
    body: 'body-villager', head: 'head-bald', top: 'top-wetsuit', bottom: 'bottom-swim', shoes: 'shoes-slipper', accessory: 'acc-sword' },
];

const runner = `
(function () {
  const out = [];
  const combos = __COMBOS__;
  for (const c of combos) {
    state.theme = THEMES[c.theme] || THEMES[0];
    state.skin = SKINS[c.skin] || SKINS[0];
    state.hair = HAIR_COLORS[c.hair] || HAIR_COLORS[0];
    state.body = c.body; state.head = c.head; state.top = c.top;
    state.bottom = c.bottom; state.shoes = c.shoes; state.accessory = c.accessory;
    renderAvatar();
    // 包围盒校验：确认人物在 60×72 网格里的位置与占比
    const g = buildCompositeGrid();
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
    for (let r = 0; r < 36; r++) for (let cc = 0; cc < 30; cc++) {
      if (g[r][cc]) { n++; if (cc < minX) minX = cc; if (cc > maxX) maxX = cc; if (r < minY) minY = r; if (r > maxY) maxY = r; }
    }
    out.push({
      label: c.label,
      svg: document.getElementById('avatar-svg').innerHTML,
      bbox: { minX, maxX, minY, maxY, n, cx: ((minX + maxX) / 2).toFixed(1) },
    });
  }
  return out;
})()
`;

sandbox.__COMBOS__ = COMBOS;
const shots = vm.runInContext(runner, sandbox);

const cards = shots.map(s => `
  <div class="card">
    <div class="label">${s.label}</div>
    <svg viewBox="0 0 240 288" width="240" height="288" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${s.svg}</svg>
  </div>
`).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>像素头像 · 静态快照</title>
<style>
  body {
    margin: 0; padding: 24px;
    background: #14161a; color: #e8e6e3;
    font-family: "Microsoft YaHei", -apple-system, "PingFang SC", sans-serif;
  }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  .sub { font-size: 12px; color: #8b8f96; margin-bottom: 20px; }
  .grid { display: flex; flex-wrap: wrap; gap: 24px; }
  .card {
    background: #1c1f25; border: 1px solid #2b2f37; border-radius: 12px;
    padding: 14px; display: flex; flex-direction: column; align-items: center;
  }
  .label { font-size: 12px; color: #a8adb6; margin-bottom: 10px; text-align: center; max-width: 240px; line-height: 1.5; }
  svg { background: #f4f1ec; border-radius: 6px; display: block; }
</style>
</head>
<body>
  <h1>像素头像 · 当前效果静态快照</h1>
  <div class="sub">莫兰迪配色 · 音乐装饰层｜30×36 网格（每格 8×8 像素，4 子格细腻渲染）｜画布 240×288</div>
  <div class="grid">
${cards}
  </div>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('snapshot written:', OUT);
console.log('combos rendered:', shots.length);
shots.forEach(s => console.log('  -', s.label, '| svg len =', s.svg.length,
  '| bbox x', s.bbox.minX + '-' + s.bbox.maxX, 'y', s.bbox.minY + '-' + s.bbox.maxY,
  '| 中心x', s.bbox.cx, '| 实心格', s.bbox.n));
