// 校验音乐氛围装饰层：renderMusicDecor 输出的元素、坐标边界、中央人物区留空
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..', 'app.js');
const full = fs.readFileSync(APP, 'utf8');
// 只取到 renderAvatar() 之前的纯逻辑段（装饰层定义在其中），避免顶层 DOM 调用
const src = full.slice(0, full.indexOf('function renderAvatar()'));
if (!src.includes('function renderMusicDecor')) {
  console.log('FAIL | 未找到 renderMusicDecor');
  process.exit(1);
}

const fn = new Function(src + '\nreturn { render: renderMusicDecor, state: state };');
const api = fn();
const decor = api.render();

let fail = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? '  ' + extra : ''));
  if (!cond) fail++;
}
const count = (re) => (decor.match(re) || []).length;

// ---- 1. 底色与聚光 ----
check('全画布淡底色', /<rect x="0" y="0" width="240" height="288"/.test(decor));
check('中央聚光椭圆', /<ellipse cx="120" cy="148"/.test(decor));

// ---- 2. 五线谱 ----
check('五线谱 5 条（左右两段）', count(/opacity="0.28"/g) >= 10, '条数=' + count(/opacity="0.28"/g));
check('五线谱终止竖线 x2', count(/width="1" height="20"/g) >= 2);

// ---- 3. 左上角黑胶唱片 ----
check('黑胶盘面（#1a1a1a）', decor.includes('fill="#1a1a1a"'));
check('唱片同心环 x3', count(/stroke="#3a3a3a"/g) >= 3, '环=' + count(/stroke="#3a3a3a"/g));
check('唱片中心点（主题色）', /<circle cx="22" cy="22" r="2.5"/.test(decor));
check('唱片高光弧线', decor.includes('stroke="#ffffff"'));

// ---- 4. 右上角木吉他 ----
check('吉他木色（#857058 / #A8785E / #7A5540）',
  decor.includes('fill="#857058"') && decor.includes('fill="#A8785E"') && decor.includes('fill="#7A5540"'));
check('吉他音孔（#2E2A24）', decor.includes('fill="#2E2A24"'));
check('吉他琴身像素块充足', count(/fill="#857058"/g) + count(/fill="#A8785E"/g) + count(/fill="#7A5540"/g) >= 20,
  '木色格=' + (count(/fill="#857058"/g) + count(/fill="#A8785E"/g) + count(/fill="#7A5540"/g)));

// ---- 5. 左下钢琴键盘 ----
check('钢琴白键 x6', count(/fill="#F4EDE3"/g) >= 6, '键=' + count(/fill="#F4EDE3"/g));
check('钢琴黑键 x3', count(/width="6" height="10" fill="#3F3A33"/g) >= 3);
check('键盘金色装饰条', /fill="#C9A878" opacity="0.6"/.test(decor));

// ---- 6. 右下 EQ 均衡器 ----
check('EQ 竖条（4 根 + 顶帽）', count(/opacity="0.85"/g) >= 4 && count(/fill="#ffffff" opacity="0.4"/g) >= 4);
check('EQ 底座', /fill="[^"]*" opacity="0.6"/.test(decor));
check('EQ 旋钮 x4', count(/r="1.6"/g) === 4, '旋钮=' + count(/r="1.6"/g));

// ---- 7. 中部装饰 ----
check('右侧大谱号 ♬', decor.includes('cx="216" cy="112"'));
check('左侧磁带卷轴（双轮）', count(/cy="128" r="5"/g) === 2, '轮=' + count(/cy="128" r="5"/g));

// ---- 8. 漂浮音符与闪光 ----
check('漂浮音符 x4 处', count(/opacity="0.85"/g) >= 8, '印章像素=' + count(/opacity="0.85"/g));
check('金色闪光点 x8', count(/width="2" height="2" fill="#C9A878"/g) === 8);

// ---- 9. 中央人物区必须留空（只放行全画布底色）----
const rects = [...decor.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9A-Fa-f]{6})"/g)];
const intruders = rects.filter(m => {
  const x = +m[1], y = +m[2], w = +m[3], h = +m[4];
  if (w >= 240 && h >= 288) return false;              // 全画布底色
  const cx = x + w / 2, cy = y + h / 2;
  return cx > 64 && cx < 176 && cy > 64 && cy < 232;   // 人物占 px x64-176 / y64-232
});
check('中央人物区 (x64-176, y64-232) 无前景装饰',
  intruders.length === 0, intruders.length ? '越界=' + intruders.slice(0, 3).map(m => m[5] + '@' + m[1] + ',' + m[2]).join(' ') : '');

// ---- 10. 坐标边界 ----
const bad = rects.filter(m => +m[1] < 0 || +m[2] < 0 || +m[1] + +m[3] > 240.01 || +m[2] + +m[4] > 288.01);
check('全部 ' + rects.length + ' 个装饰 rect 在 240×288 画布内', bad.length === 0);
if (bad.length) console.log('  越界:', bad.slice(0, 5).map(m => m[0]));

// ---- 11. 主题联动 ----
const before = decor;
api.state.theme = { id: 'rose', primary: '#C9A5A5', dark: '#A68383', light: '#DCC2C2' };
const after = api.render();
check('装饰随主题色联动', after !== before);

console.log(fail ? '---- PROBLEMS: ' + fail : '---- ALL OK ----');
process.exit(fail ? 1 : 0);
