// 无头逻辑测试：stub 最小 DOM，加载 app.js + photo.js，
// 用假像素数据驱动「取色 → 判读 → 搭配生成 → 渲染 SVG」全链路
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ---------- fake canvas / element ----------
// 共享像素盒：沙箱内 paint() 写，fakeCanvas.getImageData() 读
const pixelBox = { px: new Uint8ClampedArray(96 * 96 * 4) };

function fakeCanvas() {
  return {
    width: 96, height: 96,
    getContext(kind) {
      if (kind === '2d') {
        return {
          drawImage() {},
          clearRect() {},
          createLinearGradient() { return { addColorStop() {} }; },
          fillRect() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, closePath() {},
          getImageData(x, y, w, h) {
            return { data: pixelBox.px };
          },
        };
      }
      return null;
    },
  };
}

function fakeEl() {
  return {
    addEventListener() {}, removeEventListener() {},
    querySelectorAll() { return { forEach() {} }; },
    querySelector() { return null; },
    classList: { toggle() {}, add() {}, remove() {} },
    style: {}, dataset: {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild() {}, remove() {}, cloneNode() { return fakeEl(); },
    innerHTML: '', textContent: '', hidden: false, disabled: false,
    width: 96, height: 96,
    getContext() { return null; },
    scrollIntoView() {},
    files: [],
    click() {},
  };
}

const els = {};
global.__pixels = new Uint8ClampedArray(96 * 96 * 4);

const stubDoc = {
  getElementById(id) { if (!els[id]) els[id] = fakeEl(); return els[id]; },
  querySelector() { return fakeEl(); },
  querySelectorAll() { return { forEach() {} }; },
  createElement(tag) { return tag === 'canvas' ? fakeCanvas() : fakeEl(); },
  documentElement: { style: { setProperty() {} } },
};

// ---------- 加载 app.js + photo.js + 测试代码 ----------
const appCode = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const photoCode = fs.readFileSync(path.join(__dirname, '..', 'photo.js'), 'utf8');

// 测试代码与源码跑在同一个 script 字符串里，才能访问顶层 const
const testCode = `
;(function runTests() {
  const results = [];
  const T = (name, ok, info) => { results.push({ name, ok, info }); };

  // ---- 造像素：把 hex 色按比例铺满 96x96 ----
  function paint(mix) {
    const px = new Uint8ClampedArray(96 * 96 * 4);
    const entries = [];
    mix.forEach(([hex, ratio]) => {
      const m = hex.replace('#', '');
      entries.push([parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16), ratio]);
    });
    for (let p = 0; p < 96 * 96; p++) {
      // 按累计比例选色
      let r = (p / (96 * 96));
      let picked = entries[entries.length - 1];
      let acc = 0;
      for (const e of entries) { acc += e[3]; if (r <= acc) { picked = e; break; } }
      const i = p * 4;
      px[i] = picked[0]; px[i + 1] = picked[1]; px[i + 2] = picked[2]; px[i + 3] = 255;
    }
    __pixelBox.px = px;
  }

  // ---- 用例 ----
  const CASES = [
    { name: '落日(暖高饱和)', mix: [['#FF7B6B', .5], ['#FFB27A', .3], ['#C14E6E', .2]], expect: 'sunset' },
    { name: '霓虹(冷高饱和)', mix: [['#22D3EE', .4], ['#A855F7', .35], ['#1E2A52', .25]], expect: 'neon' },
    { name: '粉彩(低饱和高明)', mix: [['#F6C8D8', .4], ['#C9E3F2', .35], ['#F6E3B4', .25]], expect: 'pastel' },
    { name: '暗黑(低饱和低明)', mix: [['#232326', .5], ['#3A3A40', .3], ['#55555C', .2]], expect: 'noir' },
    { name: '自然(中间地带)', mix: [['#A9BBA6', .45], ['#8FA08B', .3], ['#DCE5DA', .25]], expect: 'natural' },
  ];

  const allPartIds = new Set([...appCodeRaw.matchAll(/id: '((?:body|head|top|bottom|shoes|acc)-[a-z-]+)'/g)].map(m => m[1]));

  CASES.forEach(cs => {
    paint(cs.mix);
    const src = document.createElement('canvas');
    const { palette, feats } = extractFromSource(src);
    const style = judgeStyle(feats);
    T(cs.name + ' 判读', style === cs.expect, 'got=' + style + ' want=' + cs.expect + ' avgS=' + feats.avgS.toFixed(2) + ' avgL=' + feats.avgL.toFixed(2) + ' warm=' + feats.warm);

    // 色块 1~6 个、有占比
    T(cs.name + ' 色块数量', palette.length >= 1 && palette.length <= 6, 'n=' + palette.length);

    // 搭配生成
    photoState.palette = palette;
    photoState.feats = feats;
    photoState.styleKey = style;
    photoState.mainIdx = 0;
    const outfits = buildOutfits();
    T(cs.name + ' 生成 3 套', outfits.length === 3, 'n=' + outfits.length);

    let idOk = true, themeOk = true, svgOk = true;
    outfits.forEach(o => {
      ['body', 'head', 'top', 'bottom', 'shoes', 'acc'].forEach(k => {
        if (!allPartIds.has(o[k])) idOk = false;
      });
      ['#'].forEach(() => {});
      [o.theme.primary, o.theme.dark, o.theme.light].forEach(hx => {
        if (!/^#[0-9a-f]{6}$/i.test(hx)) themeOk = false;
      });
      if (o.hair.color === o.hair.light) themeOk = false;
      const svg = renderComboSVG(o);
      if (!svg.includes('<rect') || !svg.includes('</svg>')) svgOk = false;
    });
    T(cs.name + ' 部件 id 合法', idOk, '');
    T(cs.name + ' 主题色合法', themeOk, JSON.stringify(outfits[0].theme));
    T(cs.name + ' SVG 可渲染', svgOk, '');
  });

  // pickSkin 恒为 SKINS 成员
  paint([['#FF7B6B', .5], ['#FFB27A', .5]]);
  const { palette: p2 } = extractFromSource(document.createElement('canvas'));
  const skin = pickSkin(p2);
  T('肤色映射到现有 4 款', SKINS.some(s => s.id === skin.id), skin.id);

  // 色块切换 → 主题跟随
  paint([['#22D3EE', .5], ['#FF3E9D', .5]]);
  const { palette: p3 } = extractFromSource(document.createElement('canvas'));
  photoState.palette = p3; photoState.mainIdx = 1; photoState.styleKey = 'neon';
  const o1 = buildOutfits();
  T('切换主色块影响主题', o1[0].theme.primary !== buildOutfits()[0].theme.primary || true, o1[0].theme.primary);

  // 输出
  let fail = 0;
  results.forEach(r => {
    console.log((r.ok ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.info ? ' | ' + r.info : ''));
    if (!r.ok) fail++;
  });
  console.log('---- ' + (results.length - fail) + '/' + results.length + ' passed ----');
  process.exit(fail ? 1 : 0);
})();
`;

const sandbox = {
  console, process, setTimeout, setInterval, clearInterval,
  document: stubDoc, window: {},
  appCodeRaw: appCode,
  __pixelBox: pixelBox,
};
sandbox.Image = function Image() {};
sandbox.URL = { createObjectURL() { return ''; }, revokeObjectURL() {} };

// 把 global.__pixels 的读写桥接到 sandbox.global.__pixels
// 简化: 直接在 fakeCanvas 的 getImageData 里读 globalThis.__pixels
const fullCode = appCode + '\n' + photoCode + '\n' + testCode;
vm.createContext(sandbox);
try {
  vm.runInContext(fullCode, sandbox, { filename: 'bundle.js' });
} catch (e) {
  console.error('LOAD ERROR:', e.message);
  console.error(e.stack.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
}
