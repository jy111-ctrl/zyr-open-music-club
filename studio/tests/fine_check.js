'use strict';
// 60×72 微缩网格 + X 型 4 子格渲染器的结构校验
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const head = src.slice(0, src.indexOf('function renderAvatar()'));
const fn = new Function(head + '\nreturn { buildCompositeGrid, renderFineGrid, renderFineCell, shadeColor, renderPartSVG, state, ALL_PARTS, SLOT_ORDER, PX, W, H };');
const api = fn();

let pass = 0, fail = 0;
function R(name, ok, info) {
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : ''));
  ok ? pass++ : fail++;
}

// 1) shadeColor 基线
R('shadeColor 提亮到白', api.shadeColor('#808080', 1) === '#ffffff');
R('shadeColor 压暗到黑', api.shadeColor('#808080', -1) === '#000000');

// 2) 常量
R('W=30 H=36 PX=8', api.W === 30 && api.H === 36 && api.PX === 8);

// 3) 合成网格
const grid = api.buildCompositeGrid();
let filled = 0, blackCells = 0;
for (const row of grid) for (const c of row) {
  if (c) filled++;
  if (c === '#3F3A33') blackCells++;   // 莫兰迪描边色（暖深棕）
}
R('合成网格有像素', filled > 80, 'cells=' + filled);
R('网格尺寸 30x36', grid.length === 36 && grid[0].length === 30);

// 4) 单格渲染：4 子格紧贴，无圆角无间隙
const at = (c, r) => (r < 0 || r >= 36 || c < 0 || c >= 30) ? null : grid[r][c];
const svg = api.renderFineGrid(at, 0, 0, 36, 30, 1);
const rects = (svg.match(/<rect /g) || []);
R('无 NaN 坐标', !svg.includes('NaN'));
R('无圆角属性（紧贴）', !svg.includes('rx="'));
// 非黑格 = 4 子格，黑格（k 描边色）= 1 描边矩形
// 正常像素块：一格 = 一个纯色 rect（描边色仍走 1 个细描边 rect）
const expectedRects = filled;
R('每像素格 = 1 个纯色块（正常像素块）', rects.length === expectedRects,
  'rects=' + rects.length + ' cells=' + filled + ' blackCells=' + blackCells + ' expected=' + expectedRects);
R('无投影滤镜', !svg.includes('drop-shadow'));

// 5) 坐标在画布内（240×288 保持）
let coordOk = true;
svg.replace(/x="(-?[0-9.]+)" y="(-?[0-9.]+)" width="([0-9.]+)" height="([0-9.]+)"/g,
  (_, x, y, w, h) => {
    if (+x < 0 || +y < 0 || +x + +w > 240.01 || +y + +h > 288.01) coordOk = false;
    return '';
  });
R('全部 rect 在 240x288 画布内', coordOk);

// 6) 缩略图渲染（scale 0.5）
const body = api.ALL_PARTS.body[0];
const thumb = api.renderPartSVG(body, 0.5);
R('缩略图细腻渲染正常', thumb.includes('<rect') && !thumb.includes('NaN'));

// 7) 孤立像素：一个格子 = 一个整块 rect
const atOne = (c, r) => (c === 0 && r === 0) ? '#7C3AED' : null;
const one = api.renderFineGrid(atOne, 0, 0, 1, 1, 1);
R('孤立像素 = 1 个整块', (one.match(/<rect /g) || []).length === 1);

// 8) 满区同色：3x3 → 9 格全填 = 9 个整块
const atFlat = (c, r) => (c >= 0 && c < 3 && r >= 0 && r < 3) ? '#AAABAC' : null;
const flat = api.renderFineGrid(atFlat, 0, 0, 3, 3, 1);
R('3x3 同色块 = 9 个整块', (flat.match(/<rect /g) || []).length === 9);

// 9) 格内不再穿插 hi/lo：单格只有一个 fill 色
R('格内色块统一（无 hi/lo 穿插）',
  one.includes('fill="#') && (one.match(/fill="#[A-Fa-f0-9]+"/g) || []).length === 1);

console.log('---- ' + pass + '/' + (pass + fail) + ' passed ----');
process.exit(fail ? 1 : 0);
