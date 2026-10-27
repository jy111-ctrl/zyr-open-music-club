// 复用 app.js 的部件定义，把 30x36 网格合成后以 ASCII 打印，便于肉眼检查层对齐
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..', 'app.js');
const src = fs.readFileSync(APP, 'utf8');

// 截取到 ACCESSORY_PARTS 结束
const start = src.indexOf('const ACCESSORY_PARTS');
const endIdx = src.indexOf('\n];', start);
const head = src.slice(0, endIdx + 3);

const sandbox = {};
// 屏蔽 state 依赖
const fn = new Function('exports', head + '\nreturn {BODY_PARTS,HEAD_PARTS,TOP_PARTS,BOTTOM_PARTS,SHOES_PARTS,ACCESSORY_PARTS,expand,resolveColor,CHAR_FIXED,CHAR_DYNAMIC};');
// 需要 state 定义
global.state = {
  theme: { id: 'moss', primary: '#9DA89B', dark: '#7B8776', light: '#BCC7B5' },
  skin: { id: 'light', color: '#F2E0CC', shadow: '#D9B89A' },
  hair: { id: 'ink', color: '#3A3530', light: '#524C44' },
};
// 重新构造：head 里 resolveColor 用了 state，需要在同一作用域提供
const wrapped = new Function('state', head + '\nreturn {BODY_PARTS,HEAD_PARTS,TOP_PARTS,BOTTOM_PARTS,SHOES_PARTS,ACCESSORY_PARTS,expand,resolveColor};');
const M = wrapped(global.state);

const COLS = 30, ROWS = 36;

// 选择：可用命令行覆盖  node dump_grid.js <bodyId> <headId> <topId> <bottomId> <shoesId> <accId>
const A = process.argv.slice(2);
const pick = (arr, id) => (id && id !== '-' ? arr.find(p => p.id === id) : arr[0]);
const sel = {
  body: pick(M.BODY_PARTS, A[0] || 'body-steve'),
  head: pick(M.HEAD_PARTS, A[1] || 'head-short'),
  top: pick(M.TOP_PARTS, A[2] || 'top-tshirt'),
  bottom: pick(M.BOTTOM_PARTS, A[3] || 'bottom-jeans'),
  shoes: pick(M.SHOES_PARTS, A[4] || 'shoes-sneaker'),
  acc: (A[5] && A[5] !== '-') ? M.ACCESSORY_PARTS.find(p => p.id === A[5]) : null,
};

// 用一个近似灰阶字符代表颜色
function shade(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const ramp = ' .:-=+*#%@';
  return ramp[Math.min(9, Math.round((1 - lum) * 9))];
}

const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));

function blit(part, tag) {
  if (!part) return;
  for (let row = 0; row < part.lines.length; row++) {
    const line = M.expand(part.lines[row]);
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      const color = M.resolveColor(ch);
      if (!color) continue;
      const gx = part.ox + col, gy = part.oy + row;
      if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue;
      grid[gy][gx] = shade(color);
    }
  }
}

// 渲染顺序同 app.js
blit(sel.body);
blit(sel.bottom);
blit(sel.shoes);
blit(sel.top);
blit(sel.head);
if (sel.acc) blit(sel.acc);

console.log('==== ' + [sel.body.id, sel.head.id, sel.top.id, sel.bottom.id, sel.shoes.id, sel.acc && sel.acc.id].filter(Boolean).join(' + ') + ' ====');
console.log('    ' + Array.from({ length: COLS }, (_, i) => (i % 10)).join(''));
for (let y = 0; y < ROWS; y++) {
  console.log(String(y).padStart(2, ' ') + ' |' + grid[y].join('') + '|');
}
console.log('---- 各层 oy/h ----');
console.log('body   oy=' + sel.body.oy + ' h=' + sel.body.h);
console.log('head   oy=' + sel.head.oy + ' h=' + sel.head.h);
console.log('top    oy=' + sel.top.oy + ' h=' + sel.top.h);
console.log('bottom oy=' + sel.bottom.oy + ' h=' + sel.bottom.h);
console.log('shoes  oy=' + sel.shoes.oy + ' h=' + sel.shoes.h);
