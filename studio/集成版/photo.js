/* ============================================================
 * Photo Studio — 照片生成专属音乐小人（2026-10-13 新增）
 * 不改动 app.js 既有逻辑，纯增量挂载：
 *   上传照片 → canvas 提取组合色块 → 判读色彩风格
 *   → 生成 3 套专属音乐小人候选 → 应用回主编辑器
 * 依赖 app.js 的全局: state / ALL_PARTS / SKINS / HAIR_COLORS
 *   / renderPartSVG / renderAvatar / renderPaletteSwatches ...
 * ========================================================== */

'use strict';

// ============================================================
// 1. 颜色工具
// ============================================================

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s, l];
}

function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function toHex(r, g, b) {
  const f = n => n.toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}

function hslHex(h, s, l) {
  const [r, g, b] = hsl2rgb(h, s, l);
  return toHex(r, g, b);
}

function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
}

function rgbDist(a, b) {
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function mixWhite(hex, k) {
  const { r, g, b } = hexToRgb(hex);
  return toHex(
    Math.round(r + (255 - r) * k),
    Math.round(g + (255 - g) * k),
    Math.round(b + (255 - b) * k)
  );
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// ============================================================
// 2. 色板提取（canvas 量化 + 贪心聚类）
// ============================================================

function extractFromSource(source) {
  const size = 96;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, size, size);
  const d = ctx.getImageData(0, 0, size, size).data;

  const buckets = new Map();
  let total = 0, sSin = 0, sCos = 0, wS = 0, wL = 0, warmW = 0, satW = 0;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;                    // 半透明跳过
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const [hh, , ll] = rgb2hsl(r, g, b);
    // 饱和度用 HSV 口径 (max-min)/max：
    // HSL 饱和度在高明度下虚高（浅粉 #F6C8D8 的 HSL S≈0.72），会把粉彩误判成高饱和
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const ss = mx === 0 ? 0 : (mx - mn) / mx;
    if (ll < 0.05 || ll > 0.96) continue;            // 极暗/极亮跳过
    if (ss < 0.06 && (ll < 0.12 || ll > 0.92)) continue; // 死黑死白跳过
    total++;
    const rad = hh * Math.PI / 180;
    sSin += Math.sin(rad); sCos += Math.cos(rad);
    wS += ss; wL += ll;
    if (ss > 0.18) {
      satW++;
      if (hh < 70 || hh > 300) warmW++;              // 暖色相
    }
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    let bk = buckets.get(key);
    if (!bk) { bk = { r: 0, g: 0, b: 0, n: 0 }; buckets.set(key, bk); }
    bk.r += r; bk.g += g; bk.b += b; bk.n++;
  }

  if (!total) {
    return { palette: [], feats: { avgS: 0.3, avgL: 0.5, warm: false, hue: 30 } };
  }

  // 按占比排序 → 贪心合并相近色（RGB 距离 > 78 才保留）
  const list = [...buckets.values()].map(bk => {
    const r = bk.r / bk.n, g = bk.g / bk.n, b = bk.b / bk.n;
    const [hh, ss, ll] = rgb2hsl(r, g, b);
    return { r, g, b, h: hh, s: ss, l: ll, ratio: bk.n / total };
  }).sort((a, b) => b.ratio - a.ratio);

  const picked = [];
  for (const col of list) {
    if (picked.length >= 6) break;
    if (picked.every(p => rgbDist(p, col) > 78)) picked.push(col);
  }
  if (!picked.length && list.length) picked.push(list[0]);

  let hue = Math.atan2(sSin / total, sCos / total) * 180 / Math.PI;
  if (hue < 0) hue += 360;

  return {
    palette: picked,
    feats: {
      avgS: wS / total,
      avgL: wL / total,
      warm: warmW > satW * 0.6,
      hue,
    },
  };
}

// ============================================================
// 3. 风格判读
// ============================================================

const STYLES = {
  sunset:  { name: '活力暖色',   desc: '高饱和 · 暖色调 · 明快' },
  ember:   { name: '浓郁暖色',   desc: '高饱和 · 暖色调 · 沉稳' },
  neon:    { name: '冷艳霓虹',   desc: '高饱和 · 冷色调 · 个性' },
  noir:    { name: '暗黑低调',   desc: '低饱和 · 低明度 · 神秘' },
  pastel:  { name: '粉彩清新',   desc: '低饱和 · 高明度 · 柔软' },
  natural: { name: '自然莫兰迪', desc: '中低饱和 · 均衡 · 舒适' },
};

function judgeStyle(f) {
  const sat = f.avgS, lum = f.avgL;
  if (sat >= 0.45) {
    if (lum >= 0.45) return f.warm ? 'sunset' : 'neon';
    return f.warm ? 'ember' : 'neon';
  }
  if (lum < 0.40) return 'noir';
  if (lum >= 0.78) return 'pastel';
  return 'natural';
}

// ============================================================
// 4. 搭配库（每种风格 3 套，均含音乐元素）
// ============================================================

const OUTFIT_LIB = {
  sunset: [
    { name: '夏日音浪', desc: '落日、海风和一段副歌',       body: 'body-alex',     head: 'head-pony',  top: 'top-music',   bottom: 'bottom-shorts',  shoes: 'shoes-sneaker', acc: 'acc-pearl' },
    { name: '沙滩派对', desc: '星星印花与热带节奏',         body: 'body-steve',    head: 'head-twin',  top: 'top-star',    bottom: 'bottom-swim',    shoes: 'shoes-sandal',  acc: 'acc-wolf' },
    { name: '活力街头', desc: '连帽卫衣的城市律动',         body: 'body-villager', head: 'head-curly', top: 'top-hoodie',  bottom: 'bottom-cargo',   shoes: 'shoes-sneaker', acc: 'acc-backpack' },
  ],
  ember: [
    { name: '篝火民谣', desc: '毛衣、篝火与木吉他',         body: 'body-steve',    head: 'head-long',  top: 'top-sweater', bottom: 'bottom-jeans',   shoes: 'shoes-boot',    acc: 'acc-wolf' },
    { name: '暖调旋律', desc: '音符 T 恤的温柔现场',        body: 'body-alex',     head: 'head-buns',  top: 'top-music',   bottom: 'bottom-jeans',   shoes: 'shoes-boot',    acc: 'acc-scarf' },
    { name: '旅人吟游', desc: '背心与工装的流浪感',         body: 'body-villager', head: 'head-band',  top: 'top-vest',    bottom: 'bottom-casual',  shoes: 'shoes-leather', acc: 'acc-ocelot' },
  ],
  neon: [
    { name: '电子幻夜', desc: '潜水服质感的未来舞台',       body: 'body-enderman', head: 'head-twin',  top: 'top-wetsuit', bottom: 'bottom-leggings', shoes: 'shoes-sneaker', acc: 'acc-pearl' },
    { name: '合成波',   desc: '霓虹灯下的合成器音墙',       body: 'body-alex',     head: 'head-wing',  top: 'top-music',   bottom: 'bottom-sweat',   shoes: 'shoes-sneaker', acc: 'acc-glasses' },
    { name: '赛博 DJ',  desc: '夹克与头盔的机械节拍',       body: 'body-steve',    head: 'head-helm',  top: 'top-jacket',  bottom: 'bottom-cargo',   shoes: 'shoes-boot',    acc: 'acc-glasses' },
  ],
  noir: [
    { name: '午夜爵士', desc: '西装、皮鞋与萨克斯',         body: 'body-steve',    head: 'head-short', top: 'top-suit',    bottom: 'bottom-jeans',   shoes: 'shoes-leather', acc: 'acc-glasses' },
    { name: '暗夜音符', desc: '黑底音符 T 的低吟',          body: 'body-enderman', head: 'head-bald',  top: 'top-music',   bottom: 'bottom-leggings', shoes: 'shoes-boot',   acc: 'acc-glasses' },
    { name: '朋克乐手', desc: '海盗外套与铁血和弦',         body: 'body-villager', head: 'head-band',  top: 'top-pirate',  bottom: 'bottom-jeans',   shoes: 'shoes-boot',    acc: 'acc-sword' },
  ],
  pastel: [
    { name: '奶油甜心', desc: '毛衣与百褶的软萌感',         body: 'body-alex',     head: 'head-buns',  top: 'top-sweater', bottom: 'bottom-pleated', shoes: 'shoes-sneaker', acc: 'acc-pearl' },
    { name: '轻音部',   desc: '轻音少女的放学合奏',         body: 'body-villager', head: 'head-twin',  top: 'top-music',   bottom: 'bottom-skirt',   shoes: 'shoes-leather', acc: 'acc-scarf' },
    { name: '田园牧歌', desc: '长裙与草地的慢板',           body: 'body-alex',     head: 'head-long',  top: 'top-dress',   bottom: 'bottom-long-skirt', shoes: 'shoes-sandal', acc: 'acc-wolf' },
  ],
  natural: [
    { name: '民谣诗人', desc: '衬衫、休闲裤与口琴',         body: 'body-steve',    head: 'head-short', top: 'top-shirt',   bottom: 'bottom-casual',  shoes: 'shoes-leather', acc: 'acc-glasses' },
    { name: '轻快旋律', desc: '音符 T 的通勤爵士',          body: 'body-alex',     head: 'head-pony',  top: 'top-music',   bottom: 'bottom-jeans',   shoes: 'shoes-sneaker', acc: 'acc-backpack' },
    { name: '学院研究', desc: '实验服里的理性节拍',         body: 'body-villager', head: 'head-curly', top: 'top-labcoat', bottom: 'bottom-sweat',   shoes: 'shoes-sneaker', acc: 'acc-glasses' },
  ],
};

// ============================================================
// 5. 照片颜色 → theme / hair / skin
// ============================================================

// 从照片色生成主题（做适度规范化，避免刺眼或死灰）
function buildTheme(color, name) {
  const h = color.h;
  const s = clamp(color.s, 0.18, 0.55);
  const l = clamp(color.l, 0.38, 0.66);
  return {
    id: 'photo-theme',
    name: name || '照片专属',
    primary: hslHex(h, s, l),
    dark: hslHex(h, Math.min(s, 0.6), Math.max(l * 0.72, 0.16)),
    light: hslHex(h, s * 0.75, Math.min(l * 1.32, 0.9)),
  };
}

// 发色：照片中最深的可用色；无则按主色相落到 HAIR_COLORS 就近款
function pickHair(palette) {
  const cand = palette.filter(p => p.l >= 0.04 && p.l <= 0.42);
  let base;
  if (cand.length) {
    base = cand.reduce((a, b) => (a.l <= b.l ? a : b));
  } else {
    const main = palette[0] || { h: 30, s: 0.3, l: 0.3 };
    base = { h: main.h, s: main.s, l: 0.3 };
  }
  const h = base.h, s = clamp(base.s, 0.05, 0.5), l = clamp(base.l, 0.1, 0.38);
  return {
    id: 'photo-hair',
    name: '照片发色',
    color: hslHex(h, s, l),
    light: hslHex(h, Math.min(s * 0.9, 0.5), Math.min(l + 0.14, 0.55)),
  };
}

// 肤色：照片里肤色域（h 10-50）就近映射到现有 4 款 SKINS，保持选择器同步
function pickSkin(palette) {
  const cand = palette.find(p =>
    p.h >= 10 && p.h <= 50 && p.s >= 0.12 && p.s <= 0.7 && p.l >= 0.3 && p.l <= 0.88
  );
  const target = cand || { h: 30, s: 0.35, l: 0.65 };
  let best = SKINS[0], bd = Infinity;
  SKINS.forEach(s => {
    const rgb = hexToRgb(s.color);
    const [h, ss, ll] = rgb2hsl(rgb.r, rgb.g, rgb.b);
    const d = hueDist(h, target.h) / 180 + Math.abs(ss - target.s) + Math.abs(ll - target.l);
    if (d < bd) { bd = d; best = s; }
  });
  return best;
}

// ============================================================
// 6. 候选生成
// ============================================================

const photoState = {
  palette: null,     // [{r,g,b,h,s,l,ratio}]
  feats: null,
  styleKey: null,
  mainIdx: 0,        // 用户点选的主色块
  outfits: [],
};

function buildOutfits() {
  const { palette, styleKey, mainIdx } = photoState;
  const lib = OUTFIT_LIB[styleKey] || OUTFIT_LIB.natural;
  const hair = pickHair(palette);
  const skin = pickSkin(palette);

  // 主题候选色：用户选中的主色优先，其后按 占比×(0.55+饱和度) 取不同色
  const scored = [...palette].sort((a, b) => (b.ratio * (0.55 + b.s)) - (a.ratio * (0.55 + a.s)));
  const chosen = palette[mainIdx] || scored[0];
  const mains = [chosen, ...scored.filter(c => c !== chosen)].slice(0, 3);

  return lib.map((o, i) => ({
    ...o,
    theme: buildTheme(mains[Math.min(i, mains.length - 1)], '照片专属'),
    hair,
    skin,
  }));
}

// ============================================================
// 7. 候选渲染（临时改 state 再还原，不触发 UI 刷新）
// ============================================================

function withOverride(patch, fn) {
  const backup = {};
  Object.keys(patch).forEach(k => { backup[k] = state[k]; state[k] = patch[k]; });
  try { return fn(); }
  finally { Object.keys(backup).forEach(k => { state[k] = backup[k]; }); }
}

function renderComboSVG(o) {
  const patch = {
    theme: o.theme, hair: o.hair, skin: o.skin,
    body: o.body, head: o.head, top: o.top,
    bottom: o.bottom, shoes: o.shoes, accessory: o.acc,
  };
  let inner = '';
  withOverride(patch, () => {
    const order = ['body', 'bottom', 'shoes', 'top', 'head', 'accessory'];
    inner = order.map(slot => {
      const pid = state[slot];
      if (!pid) return '';
      const part = ALL_PARTS[slot].find(p => p.id === pid);
      return part ? renderPartSVG(part, 0.5) : '';
    }).join('');
  });
  const bg = mixWhite(o.theme.light, 0.78);
  return `<svg viewBox="-16 -16 272 320" width="124" height="146" role="img" aria-label="${o.name}">
    <rect x="-16" y="-16" width="272" height="320" rx="14" fill="${bg}"/>
    ${inner}
  </svg>`;
}

function labelOf(slot, id) {
  const p = ALL_PARTS[slot].find(x => x.id === id);
  return p ? p.label : id;
}

// ============================================================
// 8. UI
// ============================================================

// 示例照片（canvas 程序化绘制，方便零门槛体验与自测）
const DEMO_PHOTOS = [
  {
    id: 'sunset', name: '落日余晖',
    draw(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#FFB27A'); g.addColorStop(0.35, '#FF7B6B');
      g.addColorStop(0.6, '#C14E6E'); g.addColorStop(1, '#3B2A52');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#FFE9A8';
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.4, w * 0.15, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,200,140,.5)';
      for (let i = 0; i < 5; i++) ctx.fillRect(w * 0.34, h * (0.62 + i * 0.06), w * 0.32 * (1 - i * 0.15), 3);
      ctx.fillStyle = 'rgba(40,20,60,.85)';
      ctx.fillRect(0, h * 0.78, w, h * 0.22);
    },
  },
  {
    id: 'neon', name: '霓虹夜城',
    draw(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#141433'); g.addColorStop(0.6, '#1E2A52'); g.addColorStop(1, '#0C0C1E');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const neons = ['#FF3E9D', '#22D3EE', '#A855F7', '#F472B6'];
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = neons[i % 4];
        ctx.globalAlpha = 0.85;
        ctx.fillRect((i * 37) % w, (i * 53) % h, 8 + (i % 3) * 6, 4);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#101024';
      ctx.fillRect(w * 0.1, h * 0.45, w * 0.18, h * 0.55);
      ctx.fillRect(w * 0.55, h * 0.35, w * 0.2, h * 0.65);
      ctx.fillStyle = '#22D3EE'; ctx.fillRect(w * 0.12, h * 0.5, w * 0.14, 2);
      ctx.fillStyle = '#FF3E9D'; ctx.fillRect(w * 0.57, h * 0.4, w * 0.16, 2);
    },
  },
  {
    id: 'pastel', name: '粉彩甜品',
    draw(ctx, w, h) {
      ctx.fillStyle = '#FBF3E8'; ctx.fillRect(0, 0, w, h);
      const cols = ['#F6C8D8', '#C9E3F2', '#F6E3B4', '#D9E8D2', '#E8D6F0'];
      const pts = [[0.3, 0.35, 0.22], [0.68, 0.3, 0.16], [0.55, 0.68, 0.2], [0.2, 0.75, 0.13], [0.82, 0.72, 0.11]];
      pts.forEach((p, i) => {
        ctx.fillStyle = cols[i % 5];
        ctx.beginPath(); ctx.arc(p[0] * w, p[1] * h, p[2] * w, 0, 7); ctx.fill();
      });
    },
  },
  {
    id: 'forest', name: '森林晨雾',
    draw(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#DCE5DA'); g.addColorStop(0.5, '#A9BBA6'); g.addColorStop(1, '#7B8F78');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#8FA08B';
      ctx.beginPath(); ctx.moveTo(0, h * 0.5); ctx.lineTo(w * 0.3, h * 0.2); ctx.lineTo(w * 0.55, h * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6E8069';
      ctx.beginPath(); ctx.moveTo(w * 0.45, h * 0.55); ctx.lineTo(w * 0.75, h * 0.15); ctx.lineTo(w, h * 0.55); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5E7060'; ctx.fillRect(0, h * 0.55, w, h * 0.45);
    },
  },
];

function setPsStatus(msg, isErr) {
  const el = document.getElementById('ps-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('err', !!isErr);
}

function analyzeSource(source) {
  const { palette, feats } = extractFromSource(source);
  if (!palette.length) {
    setPsStatus('这张照片色彩太单一，换一张试试', true);
    return;
  }
  photoState.palette = palette;
  photoState.feats = feats;
  photoState.styleKey = judgeStyle(feats);
  photoState.mainIdx = 0;

  // 显示缩略图
  const thumb = document.getElementById('ps-thumb');
  const tctx = thumb.getContext('2d');
  tctx.clearRect(0, 0, thumb.width, thumb.height);
  tctx.drawImage(source, 0, 0, thumb.width, thumb.height);

  document.getElementById('ps-empty').hidden = true;
  document.getElementById('ps-analysis').hidden = false;
  document.getElementById('ps-outfits').hidden = true;
  document.getElementById('ps-generate').disabled = false;
  setPsStatus('');

  renderPaletteBlocks();
  renderFeats();
}

function renderPaletteBlocks() {
  const c = document.getElementById('ps-palette');
  const { palette, mainIdx } = photoState;
  c.innerHTML = palette.map((p, i) => {
    const hex = toHex(Math.round(p.r), Math.round(p.g), Math.round(p.b));
    return `
      <button class="pblock${i === mainIdx ? ' sel' : ''}" data-i="${i}"
        style="background:${hex}" title="${hex} · 占比 ${(p.ratio * 100).toFixed(0)}%">
        <span class="pb-bar" style="width:${Math.max(14, p.ratio * 100)}%"></span>
        <span class="pb-tag">${i === mainIdx ? '主色' : ''}</span>
      </button>`;
  }).join('');
  c.querySelectorAll('.pblock').forEach(btn => {
    btn.addEventListener('click', () => {
      photoState.mainIdx = +btn.dataset.i;
      renderPaletteBlocks();
      renderFeats();
      if (!document.getElementById('ps-outfits').hidden) {
        photoState.outfits = buildOutfits();
        renderOutfits();
      }
    });
  });
}

function renderFeats() {
  const el = document.getElementById('ps-feats');
  const st = STYLES[photoState.styleKey];
  const f = photoState.feats;
  el.innerHTML = `
    <span class="feat-chip">风格判读 · <strong>${st.name}</strong></span>
    <span class="feat-chip">${st.desc}</span>
    <span class="feat-chip">饱和 ${(f.avgS * 100).toFixed(0)}% · 明度 ${(f.avgL * 100).toFixed(0)}%</span>`;
}

function renderOutfits() {
  const wrap = document.getElementById('ps-outfits');
  wrap.hidden = false;
  wrap.innerHTML = photoState.outfits.map((o, i) => `
    <div class="outfit-card">
      <div class="oc-svg">${renderComboSVG(o)}</div>
      <div class="oc-body">
        <h4>${o.name}</h4>
        <p class="oc-desc">${o.desc}</p>
        <div class="oc-parts">
          ${labelOf('top', o.top)} × ${labelOf('bottom', o.bottom)} × ${labelOf('shoes', o.shoes)}
        </div>
        <div class="oc-theme" title="照片提取的主题色">
          <span style="background:${o.theme.light}"></span>
          <span style="background:${o.theme.primary}"></span>
          <span style="background:${o.theme.dark}"></span>
        </div>
        <button class="btn btn--primary oc-apply" data-i="${i}">应用这套形象</button>
      </div>
    </div>`).join('');
  wrap.querySelectorAll('.oc-apply').forEach(btn => {
    btn.addEventListener('click', () => applyOutfit(photoState.outfits[+btn.dataset.i]));
  });
}

// 在调色板选择器末尾补一个"照片专属"chip（点了内置主题后自动消失，符合直觉）
function appendPhotoThemeChip(theme) {
  const c = document.getElementById('palette-swatches');
  c.querySelectorAll('.palette-chip.ps-chip').forEach(b => b.remove());
  c.querySelectorAll('.palette-chip').forEach(b => b.setAttribute('aria-checked', 'false'));
  const chip = document.createElement('button');
  chip.className = 'palette-chip ps-chip';
  chip.setAttribute('aria-checked', 'true');
  chip.title = '照片专属主题色';
  chip.style.background = `linear-gradient(135deg, ${theme.light} 0%, ${theme.primary} 50%, ${theme.dark} 100%)`;
  chip.addEventListener('click', () => {
    state.theme = theme;
    renderAvatar();
  });
  c.appendChild(chip);
}

function applyOutfit(o) {
  state.theme = o.theme;
  state.hair = o.hair;
  state.skin = o.skin;
  state.body = o.body;
  state.head = o.head;
  state.top = o.top;
  state.bottom = o.bottom;
  state.shoes = o.shoes;
  state.accessory = o.acc;

  renderPaletteSwatches();
  renderSkinSwatches();
  appendPhotoThemeChip(o.theme);
  renderPickerGrid();
  renderCurrentSlots();
  renderAvatar();

  const track = document.getElementById('track-name');
  if (track) track.textContent = `照片专属 · ${o.name} · ${o.desc}`;

  document.querySelector('.preview-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setPsStatus(`已应用「${o.name}」，可在下方继续微调各槽位`);
}

function loadFile(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) {
    setPsStatus('请选择图片文件（JPG / PNG / WebP）', true);
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { analyzeSource(img); URL.revokeObjectURL(url); };
  img.onerror = () => { setPsStatus('照片读取失败，请换一张试试', true); URL.revokeObjectURL(url); };
  img.src = url;
}

function initPhotoStudio() {
  const drop = document.getElementById('ps-drop');
  const fileInput = document.getElementById('ps-file');

  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { loadFile(fileInput.files[0]); fileInput.value = ''; });

  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('dragover');
    loadFile(e.dataTransfer.files[0]);
  });

  document.querySelectorAll('.ps-demo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const demo = DEMO_PHOTOS.find(d => d.id === btn.dataset.demo);
      if (!demo) return;
      const c = document.createElement('canvas');
      c.width = 160; c.height = 160;
      demo.draw(c.getContext('2d'), 160, 160);
      analyzeSource(c);
    });
  });

  document.getElementById('ps-generate').addEventListener('click', () => {
    if (!photoState.palette) return;
    photoState.outfits = buildOutfits();
    renderOutfits();
  });
}

initPhotoStudio();
