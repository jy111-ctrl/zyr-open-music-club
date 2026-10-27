// 最终校验：每个部件每行的字符数、以及渲染后是否 14 个格子
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = src.indexOf('const ACCESSORY_PARTS');
const endIdx = src.indexOf('\n];', start);
const head = src.slice(0, endIdx + 3);
global.state = {
  theme: { id: 'moss', primary: '#9DA89B', dark: '#7B8776', light: '#BCC7B5' },
  skin: { id: 'light', color: '#F2E0CC', shadow: '#D9B89A' },
  hair: { id: 'ink', color: '#3A3530', light: '#524C44' },
};
const M = new Function('state', head + '\nreturn {BODY_PARTS,HEAD_PARTS,TOP_PARTS,BOTTOM_PARTS,SHOES_PARTS,ACCESSORY_PARTS,expand,resolveColor};')(global.state);

let bad = 0;
function audit(group, parts) {
  parts.forEach(p => {
    p.lines.forEach((l, i) => {
      const n = [...l].length;
      if (n !== p.w) { console.log(`LEN ${group}/${p.id} row${i}: ${n} != w=${p.w}`); bad++; }
      const ex = M.expand(l);
      if ([...ex].length !== p.w) { console.log(`EXPAND ${group}/${p.id} row${i}: ${[...ex].length}`); bad++; }
      [...ex].forEach(c => { if (M.resolveColor(c) === null && c !== '.') { console.log(`UNDEF ${group}/${p.id} row${i} char=${JSON.stringify(c)}`); bad++; } });
    });
  });
}
audit('BODY', M.BODY_PARTS);
audit('HEAD', M.HEAD_PARTS);
audit('TOP', M.TOP_PARTS);
audit('BOTTOM', M.BOTTOM_PARTS);
audit('SHOES', M.SHOES_PARTS);
audit('ACCESSORY', M.ACCESSORY_PARTS);

// 统计
console.log('TOP=' + M.TOP_PARTS.length + ' BOTTOM=' + M.BOTTOM_PARTS.length + ' SHOES=' + M.SHOES_PARTS.length + ' HEAD=' + M.HEAD_PARTS.length + ' ACC=' + M.ACCESSORY_PARTS.length);
console.log(bad === 0 ? 'ALL OK' : ('PROBLEMS: ' + bad));
