/* ============================================================
 * Avatar Pixel Studio — 像素小人穿搭工坊
 * 借鉴: Universal LPC Spritesheet (CC-BY-SA 3.0) + Kenney/Pipoya 调色板
 * 所有像素艺术均由代码 grid 现绘, 不复制任何具体 sprite
 * ========================================================== */

'use strict';

// ============================================================
// 1. 调色板 (themes + skins + hair colors)
// ============================================================

// 莫兰迪主题色板（低饱和 / 暖灰底 / 鼠尾草绿主导）
const THEMES = [
  { id: 'moss',      name: '苔绿',   primary: '#9DA89B', dark: '#7B8776', light: '#BCC7B5' },
  { id: 'mist',      name: '雾蓝',   primary: '#9CB0BC', dark: '#7A91A0', light: '#BCCBD3' },
  { id: 'mauve',     name: '灰紫',   primary: '#B8A5B5', dark: '#988595', light: '#D1C5CF' },
  { id: 'camel',     name: '暖驼',   primary: '#C4A992', dark: '#A08873', light: '#DBC6B0' },
  { id: 'rose',      name: '灰粉',   primary: '#C9A5A5', dark: '#A68383', light: '#DCC2C2' },
  { id: 'teal',      name: '烟青',   primary: '#8FA4A5', dark: '#6E8586', light: '#B5C4C5' },
  { id: 'chestnut',  name: '栗棕',   primary: '#A89078', dark: '#857058', light: '#C3B19B' },
  { id: 'latte',     name: '奶咖',   primary: '#C9B8A5', dark: '#A89887', light: '#DDCDBC' },
];

// 莫兰迪肤色（暖米奶油基调）
const SKINS = [
  { id: 'light',  name: '浅瓷', color: '#F2E0CC', shadow: '#D9B89A' },
  { id: 'medium', name: '暖米', color: '#DDC4A4', shadow: '#B8956E' },
  { id: 'tan',    name: '琥珀', color: '#B89878', shadow: '#876650' },
  { id: 'dark',   name: '深陶', color: '#7A5540', shadow: '#52362A' },
];

// 莫兰迪头发色（低饱和）
const HAIR_COLORS = [
  { id: 'ink',     name: '墨黑', color: '#3A3530', light: '#524C44' },
  { id: 'brown',   name: '棕褐', color: '#6A5544', light: '#856E5A' },
  { id: 'sand',    name: '沙金', color: '#C9A878', light: '#D9BC92' },
  { id: 'ember',   name: '暮霞', color: '#A87565', light: '#C19080' },
  { id: 'silver',  name: '银灰', color: '#A8A29E', light: '#C2BCB4' },
  { id: 'smoke',   name: '烟蓝', color: '#7A8B98', light: '#9AA9B5' },
  { id: 'lilac',   name: '藕荷', color: '#9B8A95', light: '#B6A8B0' },
  { id: 'sage',    name: '松针', color: '#7B8776', light: '#9BA296' },
];

// 字符 → 固定色（莫兰迪低饱和版，不随 theme/skin/hair 变化）
const CHAR_FIXED = {
  '.': null,                  // 透明
  'k': '#3F3A33',            // 黑色轮廓（暖深棕）
  'G': '#A8A096',            // 亮灰（莫兰迪）
  'p': '#C9A5A5',            // 灰粉
  'a': '#C7A99B',            // 陶土橙
  'y': '#D9C9B0',            // 米沙黄
  'l': '#A8785E',            // 木亮
  'w': '#F4EDE3',            // 白色（暖米）
  'g': '#8A8275',            // 灰色
  'o': '#C9A878',            // 金色（沙金）
  'i': '#B0A694',            // 银色（暖银）
  'r': '#A87565',            // 红（暮霞）
  '1': '#C9A5A5',            // 浅红（灰粉）
  '2': '#C7A99B',            // 浅橙（陶土）
  '3': '#D9C9B0',            // 浅黄（米沙）
  '4': '#857058',            // 木色
  'n': '#5E6E80',            // 牛仔蓝（沉静）
  'c': '#9BA296',            // 草绿（莫兰迪）
  'C': '#6E7E69',            // 草绿暗
  'e': '#8FA091',            // 绿
  'E': '#6E7E69',            // 绿暗
  't': '#7A5540',            // 木褐
  'T': '#A8785E',            // 木褐亮
  'q': '#8B5E5E',            // 酒红（雾霭）
  'u': '#7A8B98',            // 天蓝（烟蓝）
  'U': '#5E6E80',            // 天蓝暗
  's': '#C9A5B0',            // 粉红（藕荷）
  'S': '#A6838F',            // 粉红深
  'd': '#D9BC92',            // 蜂蜜黄
  'W': '#F9F4EC',            // 纯白（米白）
  'B': '#3F3A33',            // 深夜黑（暖）
  '@': '#7A8B98',            // 蓝（烟蓝）
  '#': '#5E6E80',            // 蓝深
  '+': '#8FA091',            // 翡翠绿（雾绿）
};

// 运行时变量字符
const CHAR_DYNAMIC = {
  'P': () => state.theme.primary,
  'D': () => state.theme.dark,
  'M': () => state.theme.light,
  'h': () => state.hair.color,
  'H': () => state.hair.light,
  'S': () => state.skin.color,
  'm': () => state.skin.shadow,
  'f': () => state.theme.id === 'rose' ? '#D49A8A' : '#D49A8A',  // 腮红 (暖粉)
};

function resolveColor(c) {
  if (CHAR_DYNAMIC[c]) return CHAR_DYNAMIC[c]();
  return CHAR_FIXED[c] || null;
}

// 展开压缩字符 ("4k" -> "kkkk")
function expand(line) {
  return line.replace(/(\d+)([^\d])/g, (_, n, c) => c.repeat(+n));
}

// ============================================================
// 2. 部件定义
// 格式: { id, label, w, h, ox, oy, lines: [str,...] }
// 渲染顺序: 音乐装饰(固定) -> body -> bottom -> shoes -> top -> head -> accessory
// ============================================================

// 画布: 240×288 (viewBox "0 0 240 288"), 网格 60×72, 每格 4×4 像素

// ----- BODY (4 款 · 星露谷 Q 版骨架: 大头 / 细颈 / 窄肩 / 短腿) -----
// 14 宽 × 22 高, ox=8, oy=8
// 分段: 头 y0-7 / 颈 y8 / 肩 y9 / 身+臂 y10-13 / 腰 y14 / 臀 y15 / 腿 y16-19 / 脚 y20-21
// 五官: 眼 2×2 (B 瞳孔 + W 高光), 腮红 f 在眼角下方, 嘴 mm 居中
const BODY_PARTS = [
  { id: 'body-steve', label: '标准', w: 14, h: 22, ox: 8, oy: 8,
    lines: [
      '...SSSSSSSS...',
      '.SSSSSSSSSSSS.',
      '.SSSSSSSSSSSS.',
      '.SSBBSSSSBBSS.',
      '.SSWBSSSSWBSS.',
      '.SfSSSSSSSSfS.',
      '.SSSSSmmSSSSS.',
      '..SSSSSSSSSS..',
      '.....SSSS.....',
      '..SSSSSSSSSS..',
      '.SS.SSSSSS.SS.',
      '.SS.SSSSSS.SS.',
      '.SS.SSSSSS.SS.',
      '.SS.SSSSSS.SS.',
      '..SSSSSSSSSS..',
      '...SSSSSSSS...',
      '....nnnnnn....',
      '....nnnnnn....',
      '....nnnnnn....',
      '....nnnnnn....',
      '....nnnnnn....',
      '....nnnnnn....',
    ],
  },
  { id: 'body-alex', label: '纤细', w: 14, h: 22, ox: 8, oy: 8,
    lines: [
      '...SSSSSSSS...',
      '..SSSSSSSSSS..',
      '.SSSSSSSSSSSS.',
      '.SSBBSSSSBBSS.',
      '.SSWBSSSSWBSS.',
      '.SfSSSSSSSSfS.',
      '.SSSSSmmSSSSS.',
      '..SSSSSSSSSS..',
      '.....SSSS.....',
      '...SSSSSSSS...',
      '..S.SSSSSS.S..',
      '..S.SSSSSS.S..',
      '..S.SSSSSS.S..',
      '..S.SSSSSS.S..',
      '...SSSSSSSS...',
      '....SSSSSS....',
      '.....nnnn.....',
      '.....nnnn.....',
      '.....nnnn.....',
      '.....nnnn.....',
      '.....nnnn.....',
      '.....nnnn.....',
    ],
  },
  { id: 'body-villager', label: '圆润', w: 14, h: 22, ox: 8, oy: 8,
    lines: [
      '...SSSSSSSS...',
      '.SSSSSSSSSSSS.',
      '.SSSSSSSSSSSS.',
      '.SSBBSSSSBBSS.',
      '.SSWBSSSSWBSS.',
      '.SfSSSSSSSSfS.',
      '.SSSSSmmSSSSS.',
      '..SSSSSSSSSS..',
      '.....SSSS.....',
      '..SSSSSSSSSS..',
      '..SSSSSSSSSS..',
      '.SSSSSSSSSSSS.',
      '.SSSSSSSSSSSS.',
      '.SSSSSSSSSSSS.',
      '.SSSSSSSSSSSS.',
      '..SSSSSSSSSS..',
      '....nnnnnn....',
      '...nnnnnnnn...',
      '...nnnnnnnn...',
      '...nnnnnnnn...',
      '...nnnnnnnn...',
      '....nnnnnn....',
    ],
  },
  { id: 'body-enderman', label: '高瘦', w: 14, h: 22, ox: 8, oy: 8,
    lines: [
      '....SSSSSS....',
      '...SSSSSSSS...',
      '..SSSSSSSSSS..',
      '..SBBSSSSBBS..',
      '..SWBSSSSWBS..',
      '..fSSSSSSSSf..',
      '...SSSmmSSS...',
      '...SSSSSSSS...',
      '.....SSSS.....',
      '.....SSSS.....',
      '...SSSSSSSS...',
      '..S.SSSSSS.S..',
      '..S.SSSSSS.S..',
      '..S.SSSSSS.S..',
      '..S.SSSSSS.S..',
      '...SSSSSSSS...',
      '....SSSSSS....',
      '....nnnnnn....',
      '....nnnnnn....',
      '....nnnnnn....',
      '....nnnnnn....',
      '....nnnnnn....',
    ],
  },
];

// ----- HEAD / HAIR (12 款 · 覆盖 BODY 头部 y=0-9, 与头型圆角对齐) -----
// 14 宽 × 10 高, ox=8, oy=8
// 结构: row0-2 刘海 / row3-7 两侧鬓发(中央露脸) / row8-9 长发可垂到肩
const HEAD_PARTS = [
  { id: 'head-short', label: '短发', w: 14, h: 10, ox: 8, oy: 8,
    lines: [
      '...hhhhhhhh...',
      '.hhhhhhhhhhhh.',
      '.hhhhhhhhhhhh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '..............',
      '..............',
    ],
  },
  { id: 'head-long', label: '长发', w: 14, h: 10, ox: 8, oy: 8,
    lines: [
      '...hhhhhhhh...',
      '.hhhhhhhhhhhh.',
      '.hhhhhhhhhhhh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hhh......hhh.',
      '.hh........hh.',
      '.hh........hh.',
    ],
  },
  { id: 'head-pony', label: '马尾', w: 14, h: 10, ox: 8, oy: 8,
    lines: [
      '...hhhhhhhh...',
      '.hhhhhhhhhhhh.',
      '.hhhhhhhhhhhh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '..............',
      '..............',
    ],
  },
  { id: 'head-twin', label: '双马尾', w: 14, h: 10, ox: 8, oy: 8,
    lines: [
      '...hhhhhhhh...',
      '.hhhhhhhhhhhh.',
      '.hhhhhhhhhhhh.',
      'hhh........hhh',
      'hhh........hhh',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '..............',
    ],
  },
  { id: 'head-bald', label: '光头', w: 14, h: 10, ox: 8, oy: 8,
    lines: [
      '..............',
      '..............',
      '..............',
      '..............',
      '..............',
      '..............',
      '..............',
      '..............',
      '..............',
      '..............',
    ],
  },
  { id: 'head-curly', label: '卷发', w: 14, h: 10, ox: 8, oy: 8,
    lines: [
      '.h.hh.hh.hh.h.',
      '.hhhhhhhhhhhh.',
      '.hhhhhhhhhhhh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '..............',
      '..............',
    ],
  },
  { id: 'head-buns', label: '双丸子', w: 14, h: 10, ox: 8, oy: 8,
    lines: [
      'hh..........hh',
      'hhh........hhh',
      '.hhhhhhhhhhhh.',
      '.hhhhhhhhhhhh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '..............',
      '..............',
    ],
  },
  { id: 'head-band', label: '头巾', w: 14, h: 10, ox: 8, oy: 8,
    lines: [
      '...rrrrrrrr...',
      '.rrrrrrrrrrrr.',
      '.rrrrrrrrrrrr.',
      '..rrrrrrrrrr..',
      '..hh......hh..',
      '..hh......hh..',
      '..hh......hh..',
      '..hh......hh..',
      '..............',
      '..............',
    ],
  },
  { id: 'head-pointy', label: '尖耳', w: 14, h: 10, ox: 8, oy: 8,
    lines: [
      '..h........h..',
      '..hhhhhhhhhh..',
      '.hhhhhhhhhhhh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '..............',
      '..............',
    ],
  },
  { id: 'head-wing', label: '翅膀帽', w: 14, h: 10, ox: 8, oy: 8,
    lines: [
      'h............h',
      '.hhhhhhhhhhhh.',
      '.hhhhhhhhhhhh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '..............',
      '..............',
    ],
  },
  { id: 'head-crown', label: '王冠', w: 14, h: 10, ox: 8, oy: 8,
    lines: [
      '...o.oo.oo.o..',
      '.hhoooooooohh.',
      '.hhhhhhhhhhhh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '.hh........hh.',
      '..............',
      '..............',
    ],
  },
  { id: 'head-helm', label: '头盔', w: 14, h: 10, ox: 8, oy: 8,
    lines: [
      '...gggggggg...',
      '.gggggggggggg.',
      '.gggggggggggg.',
      '.gg........gg.',
      '.gg........gg.',
      '..g........g..',
      '..gggggggggg..',
      '..............',
      '..............',
      '..............',
    ],
  },
];

// ----- TOP (18 款 · 覆盖 BODY 颈/肩/躯干 y=8-14) -----
// 14 宽 × 7 高, ox=8, oy=16
// 列位: 袖 x1-2 与 x11-12 / 空 x3 与 x10 / 身 x4-9 (与 BODY 手臂、躯干严格对齐)
const TOP_PARTS = [
  { id: 'top-tshirt', label: 'T 恤', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '.....DDDD.....',
      '.PPPPPPPPPPPP.',
      '.PP.DPPPPD.PP.',
      '.PP.DPPPPD.PP.',
      '.PP.DPPPPD.PP.',
      '.DD.DPPPPD.DD.',
      '..DDDDDDDDDD..',
    ],
  },
  { id: 'top-shirt', label: '衬衫', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '.....wwww.....',
      '.PPPPPPPPPPPP.',
      '.PP.DwwwwD.PP.',
      '.PP.DPPPPD.PP.',
      '.PP.DPPPPD.PP.',
      '.DD.DPPPPD.DD.',
      '..DDDDDDDDDD..',
    ],
  },
  { id: 'top-hoodie', label: '卫衣', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '....DDDDDD....',
      'DPPPPPPPPPPPPD',
      '.PP.DPPPPD.PP.',
      '.PP.DwwwwD.PP.',
      '.PP.DPPPPD.PP.',
      '.DD.DPPPPD.DD.',
      '..DDDDDDDDDD..',
    ],
  },
  { id: 'top-jacket', label: '夹克', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '....iiiiii....',
      '.PPPPPPPPPPPP.',
      '.PP.DiiiiD.PP.',
      '.PP.DiiiiD.PP.',
      '.PP.DPPPPD.PP.',
      '.DD.DPPPPD.DD.',
      '..DDDDDDDDDD..',
    ],
  },
  { id: 'top-armor', label: '胸甲', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '....gggggg....',
      '.gPPPPPPPPPPg.',
      '.gPPPooooPPPg.',
      '.gPPPooooPPPg.',
      '.gPPPPPPPPPPg.',
      '.gDPPPPPPPPDg.',
      '..gggggggggg..',
    ],
  },
  { id: 'top-cape', label: '斗篷', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '......oo......',
      'DPPPPPPPPPPPPD',
      'DPPPPPPPPPPPPD',
      '.PPPPPPPPPPPP.',
      '.DPPPPPPPPPPD.',
      '..DPPPPPPPPD..',
      '...DDDDDDDD...',
    ],
  },
  { id: 'top-dress', label: '连衣裙', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '.....wwww.....',
      '.PPPPPPPPPPPP.',
      '.PP.DPPPPD.PP.',
      '.PP.DPPPPD.PP.',
      '.PP.DwwwwD.PP.',
      '.DD.DPPPPD.DD.',
      '..PPPPPPPPPP..',
    ],
  },
  { id: 'top-vest', label: '工装背心', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '.....DDDD.....',
      '..PPPPPPPPPP..',
      '..PPPPPPPPPP..',
      '..PPwwwwwwPP..',
      '..PPwwwwwwPP..',
      '..PPPPPPPPPP..',
      '..DDDDDDDDDD..',
    ],
  },
  { id: 'top-apron', label: '围裙', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '.....DDDD.....',
      '..wwwwwwwwww..',
      '.ww.wwwwww.ww.',
      '.ww.wwwwww.ww.',
      '.ww.wwDDww.ww.',
      '.ww.wwwwww.ww.',
      '..wwwwwwwwww..',
    ],
  },
  { id: 'top-star', label: '星星 T', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '.....DDDD.....',
      '.PPPPPPPPPPPP.',
      '.PP.DddddD.PP.',
      '.PP.DddddD.PP.',
      '.PP.DddddD.PP.',
      '.DD.DPPPPD.DD.',
      '..DDDDDDDDDD..',
    ],
  },
  { id: 'top-melon', label: '西瓜 T', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '.....DDDD.....',
      '.PPPPPPPPPPPP.',
      '.PP.DrrrrD.PP.',
      '.PP.DrrrrD.PP.',
      '.PP.DCCCCD.PP.',
      '.DD.DPPPPD.DD.',
      '..DDDDDDDDDD..',
    ],
  },
  { id: 'top-music', label: '音符 T', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '.....uuuu.....',
      '.PPPPPPPPPPPP.',
      '.PP.DuuuuD.PP.',
      '.PP.DuuuuD.PP.',
      '.PP.DuuuuD.PP.',
      '.DD.DPPPPD.DD.',
      '..DDDDDDDDDD..',
    ],
  },
  { id: 'top-sweater', label: '毛衣', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '.....DDDD.....',
      '.PPPPPPPPPPPP.',
      '.PP.DyyyyD.PP.',
      '.PP.DPPPPD.PP.',
      '.PP.DyyyyD.PP.',
      '.DD.DPPPPD.DD.',
      '..DDDDDDDDDD..',
    ],
  },
  { id: 'top-suit', label: '西装', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '.....wwww.....',
      '.PPPPPPPPPPPP.',
      '.PP.DwwwwD.PP.',
      '.PP.DqqqqD.PP.',
      '.PP.DqqqqD.PP.',
      '.DD.DwwwwD.DD.',
      '..DDDDDDDDDD..',
    ],
  },
  { id: 'top-navy', label: '海军外套', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '.....wwww.....',
      '.UUUUUUUUUUUU.',
      '.UU.UwwwwU.UU.',
      '.UU.UUooUU.UU.',
      '.UU.UUUUUU.UU.',
      '.DD.UUUUUU.DD.',
      '..UUUUUUUUUU..',
    ],
  },
  { id: 'top-wetsuit', label: '潜水服', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '.....DDDD.....',
      '.PPPPPPPPPPPP.',
      '.PP.DMMMMD.PP.',
      '.PP.DPPPPD.PP.',
      '.PP.DMMMMD.PP.',
      '.DD.DPPPPD.DD.',
      '..DDDDDDDDDD..',
    ],
  },
  { id: 'top-labcoat', label: '实验服', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '.....iiii.....',
      '..wwwwwwwwww..',
      '.ww.wwwwww.ww.',
      '.ww.wwwwww.ww.',
      '.ww.wwiiww.ww.',
      '.ww.wwwwww.ww.',
      '..wwwwwwwwww..',
    ],
  },
  { id: 'top-pirate', label: '海盗外套', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '.....wwww.....',
      '.qqqqqqqqqqqq.',
      '.qq.qwwwwq.qq.',
      '.qq.qooooq.qq.',
      '.qq.qqqqqq.qq.',
      '.DD.qqqqqq.DD.',
      '..qqqqqqqqqq..',
    ],
  },

];


// ----- BOTTOM (12 款 · 覆盖 BODY 臀/腿 y=15-19) -----
// 14 宽 × 5 高, ox=8, oy=23
// 列位: 腰 x3-10 / 腿 x4-9, 裤腿留侧边阴影 D 出立体感
const BOTTOM_PARTS = [
  { id: 'bottom-jeans', label: '牛仔裤', w: 14, h: 5, ox: 8, oy: 23,
    lines: [
      '...DttttttD...',
      '....DnnnnD....',
      '....DnnnnD....',
      '....DnnnnD....',
      '....DDnnDD....',
    ],
  },
  { id: 'bottom-sweat', label: '运动裤', w: 14, h: 5, ox: 8, oy: 23,
    lines: [
      '....wwwwww....',
      '....DPPPPD....',
      '....DPPPPD....',
      '....DPPPPD....',
      '....DDDDDD....',
    ],
  },
  { id: 'bottom-long-skirt', label: '长裙', w: 14, h: 5, ox: 8, oy: 23,
    lines: [
      '....DDDDDD....',
      '....DPPPPD....',
      '....DPPPPD....',
      '...DPPPPPPD...',
      '...DPPPPPPD...',
    ],
  },
  { id: 'bottom-skirt', label: '半裙', w: 14, h: 5, ox: 8, oy: 23,
    lines: [
      '....DDDDDD....',
      '....DPPPPD....',
      '...DPPPPPPD...',
      '..DPPPPPPPPD..',
      '..DDDDDDDDDD..',
    ],
  },
  { id: 'bottom-shorts', label: '短裤', w: 14, h: 5, ox: 8, oy: 23,
    lines: [
      '...DPPPPPPD...',
      '....DPPPPD....',
      '....DPPPPD....',
      '....DDDDDD....',
      '..............',
    ],
  },
  { id: 'bottom-overall', label: '背带裤', w: 14, h: 5, ox: 8, oy: 23,
    lines: [
      '...DPPPPPPD...',
      '...DwPPPPwD...',
      '....DPPPPD....',
      '....DPPPPD....',
      '....DDDDDD....',
    ],
  },
  { id: 'bottom-casual', label: '休闲裤', w: 14, h: 5, ox: 8, oy: 23,
    lines: [
      '....DDDDDD....',
      '....DPPPPD....',
      '....DPPPPD....',
      '....DPPPPD....',
      '....DDDDDD....',
    ],
  },
  { id: 'bottom-cargo', label: '工装裤', w: 14, h: 5, ox: 8, oy: 23,
    lines: [
      '...DeeeeeeD...',
      '...DwTTTTwD...',
      '....DeeeeD....',
      '....DeeeeD....',
      '....DDDDDD....',
    ],
  },
  { id: 'bottom-swim', label: '沙滩裤', w: 14, h: 5, ox: 8, oy: 23,
    lines: [
      '....uuuuuu....',
      '....DuuuuD....',
      '....DwwwwD....',
      '.....uuuu.....',
      '..............',
    ],
  },
  { id: 'bottom-leggings', label: '打底裤', w: 14, h: 5, ox: 8, oy: 23,
    lines: [
      '...DPPPPPPD...',
      '....DPPPPD....',
      '....DPPPPD....',
      '....DPPPPD....',
      '.....DPPD.....',
    ],
  },
  { id: 'bottom-pleated', label: '百褶裙', w: 14, h: 5, ox: 8, oy: 23,
    lines: [
      '....DDDDDD....',
      '....DPPPPD....',
      '...DPPPPPPD...',
      '..DPPPPPPPPD..',
      '.DPPPPPPPPPPD.',
    ],
  },
  { id: 'bottom-qipao', label: '旗袍裙', w: 14, h: 5, ox: 8, oy: 23,
    lines: [
      '....oooooo....',
      '....DqqqqD....',
      '...DqqqqqqD...',
      '...DqqooqqD...',
      '...DqqqqqqD...',
    ],
  },

];


// ----- SHOES (5 款 · 覆盖 BODY 脚 y=20-21) -----
// 14 宽 × 2 高, ox=8, oy=28
// 鞋面比脚略宽(x3-10)做出圆头小鞋, 鞋底用暗色压边
const SHOES_PARTS = [
  { id: 'shoes-sneaker', label: '运动鞋', w: 14, h: 2, ox: 8, oy: 28,
    lines: [
      '...PPPPPPPP...',
      '...DDwwwwDD...',
    ],
  },
  { id: 'shoes-boot', label: '靴子', w: 14, h: 2, ox: 8, oy: 28,
    lines: [
      '...DttttttD...',
      '...DBBBBBBD...',
    ],
  },
  { id: 'shoes-sandal', label: '凉鞋', w: 14, h: 2, ox: 8, oy: 28,
    lines: [
      '....PP..PP....',
      '....DD..DD....',
    ],
  },
  { id: 'shoes-slipper', label: '拖鞋', w: 14, h: 2, ox: 8, oy: 28,
    lines: [
      '...DwwwwwwD...',
      '...DttttttD...',
    ],
  },
  { id: 'shoes-leather', label: '皮鞋', w: 14, h: 2, ox: 8, oy: 28,
    lines: [
      '...DPPPPPPD...',
      '...DBBBBBBD...',
    ],
  },

];


// ----- ACCESSORY (8 款 · 脸部配件对齐五官 / 手持与宠物在左侧空列) -----
const ACCESSORY_PARTS = [
  { id: 'acc-glasses', label: '眼镜', w: 14, h: 4, ox: 8, oy: 10,
    lines: [
      '..kkkk..kkkk..',
      '.kk..kkkk..kk.',
      '..k..k..k..k..',
      '..kkkk..kkkk..',
    ],
  },
  { id: 'acc-scarf', label: '围巾', w: 14, h: 6, ox: 8, oy: 15,
    lines: [
      '....DDDDDD....',
      '....PPPPPP....',
      '....DDDDDD....',
      '....PPPPPP....',
      '....PP..PP....',
      '....DD..DD....',
    ],
  },
  { id: 'acc-backpack', label: '双肩包', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '..DD......DD..',
      '.DPD......DPD.',
      '.DPD......DPD.',
      '.DPD......DPD.',
      '..DD......DD..',
      '..............',
      '..............',
    ],
  },
  { id: 'acc-sword', label: '钻石剑', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '......Mu......',
      '......Mu......',
      '......Mu......',
      '......Mu......',
      '.....oMMo.....',
      '......tt......',
      '......oo......',
    ],
  },
  { id: 'acc-pickaxe', label: '镐', w: 14, h: 7, ox: 8, oy: 16,
    lines: [
      '....kkkkkk....',
      '...kUiiiiUk...',
      '....kkkkkk....',
      '......tT......',
      '......Tt......',
      '......tT......',
      '......tt......',
    ],
  },
  { id: 'acc-pearl', label: '宝石', w: 14, h: 6, ox: 8, oy: 17,
    lines: [
      '......oo......',
      '.....qWWq.....',
      '....qW++Wq....',
      '....qW++Wq....',
      '.....qWWq.....',
      '......qq......',
    ],
  },
  { id: 'acc-wolf', label: '小狗', w: 14, h: 6, ox: 8, oy: 30,
    lines: [
      '...gg....gg...',
      '...gggggggg...',
      '...gBBggBBg...',
      '...ggkkkkgg...',
      '....gggggg....',
      '....gg..gg....',
    ],
  },
  { id: 'acc-ocelot', label: '小猫', w: 14, h: 6, ox: 8, oy: 30,
    lines: [
      '...dd....dd...',
      '...dddddddd...',
      '...dBddddBd...',
      '...ddkkkkdd...',
      '....dddddd....',
      '....dd..dd....',
    ],
  },

];


/* 星露谷农场场景装饰层（替换原音乐氛围装饰层）
 * 单位：DPX = 4px 像素块；画布固定 240×288
 * 与人物网格（PX=8）解耦，保证背景布局不随人物网格切换而变形
 */
// ----- MUSIC DECOR (2026-10-14: 背景槽位移除，改为固定音乐氛围装饰层) -----
// 乐符 / 木吉他 / 钢琴键盘 / 五线谱 / 均衡器 围绕在人物周围，颜色随主题色板联动
const PX = 8;
const W = 30, H = 36;

// 装饰层像素单位：固定 4px，与人物网格 DPX=8 解耦，保证背景布局/元素大小不变
const DPX = 4;


function bgRect(x, y, w, h, color, opacity) {
  const op = opacity != null ? ` opacity="${opacity}"` : '';
  return `<rect x="${x*DPX}" y="${y*DPX}" width="${w*DPX}" height="${h*DPX}" fill="${color}"${op}/>`;
}

function bgPixel(x, y, color, opacity) {
  return bgRect(x, y, 1, 1, color, opacity);
}

// 像素印章：把形状数组里的 # 落成 8px 方块（自动裁剪到画布内）
function stampShape(shape, gx, gy, color, opacity) {
  const wSh = shape[0]?.length || 0, hSh = shape.length;
  if ((gx + wSh) * DPX > 240) gx = Math.max(0, 240 / DPX - wSh);   // 自动左移防越界
  if ((gy + hSh) * DPX > 288) gy = Math.max(0, 288 / DPX - hSh);   // 自动上移防越界
  const rects = [];
  shape.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '#') {
        const op = opacity != null ? ` opacity="${opacity}"` : '';
        rects.push(`<rect x="${(gx+c)*DPX}" y="${(gy+r)*DPX}" width="${DPX}" height="${DPX}" fill="${color}"${op}/>`);
      }
    });
  });
  return rects.join('');
}

// 八分音符 ♪ (10 宽 × 16 高)
const NOTE8 = [
  '....#',
  '...##',
  '...#.',
  '...#.',
  '...#.',
  '...#.',
  '.###.',
  '.###.',
];

// 连梁双音符 ♫ (18 宽 × 16 高)
const NOTE_BEAMED = [
  '#########',
  '#########',
  '#......#.',
  '#......#.',
  '#......#.',
  '#......#.',
  '###...###',
  '###...###',
];

// 立式木吉他 (16 宽 × 40 高，字符→颜色)
const GUITAR = [
  '...kk...',
  '..kttk..',
  '..kttk..',
  '...kk...',
  '..kiik..',
  '..kiik..',
  '..kiik..',
  '..kiik..',
  '..kiik..',
  '...kk...',
  '..kiik..',
  '.k4ii4k.',
  '.k4BB4k.',
  'k4BBBB4k',
  'k444444k',
  'kTTTTTTk',
  'kttttttk',
  '.k4444k.',
  '.k4444k.',
  '..kkkk..',
];
const GUITAR_COLORS = {
  k: '#3F3A33', t: '#7A5540', '4': '#857058',
  T: '#A8785E', B: '#2E2A24', i: '#D9C9B0',
};

function renderGuitar(gx, gy) {
  const rects = [];
  GUITAR.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const color = GUITAR_COLORS[ch];
      if (color) rects.push(`<rect x="${(gx+c)*DPX}" y="${(gy+r)*DPX}" width="${DPX}" height="${DPX}" fill="${color}"/>`);
    });
  });
  return rects.join('');
}

// 音乐氛围装饰层：所有元素分散到画面四周（顶部条带/四角/底部条带），
// 中央留空给人物（人物占 x_px=64-120, y_px=64-232）
function renderMusicDecor() {
  const t = state.theme;
  const out = [];
  const CW = 240, CH = 288;   // 画布像素尺寸（固定 240×288）

  // 1) 全画布柔和底色（极淡，让主题色渗入四角）
  out.push(`<rect x="0" y="0" width="${CW}" height="${CH}" fill="${t.light}" opacity="0.22"/>`);

  // 2) 中央"聚光"：人物背后一个柔和椭圆高光，让人物在视觉上浮起
  out.push(`<ellipse cx="${CW/2}" cy="148" rx="70" ry="92" fill="${t.light}" opacity="0.55"/>`);

  // ========== 顶部条带（人物头顶之上，y_px=0-50）==========
  // 3) 五线谱：拆成两段短谱，左右各 1 段，中间留空给"音符"装饰
  //    左段：x_px=0-70；右段：x_px=170-200（缩短让出右上角给吉他）
  for (let i = 0; i < 5; i++) {
    out.push(`<rect x="0"  y="${20 + i*5}" width="70" height="1" fill="${t.dark}" opacity="0.28"/>`);
    out.push(`<rect x="170" y="${20 + i*5}" width="30" height="1" fill="${t.dark}" opacity="0.28"/>`);
  }
  // 3b) 五线谱左右段各自加一条短竖线（终止线感）
  out.push(`<rect x="70"  y="20" width="1" height="20" fill="${t.dark}" opacity="0.30"/>`);
  out.push(`<rect x="170" y="20" width="1" height="20" fill="${t.dark}" opacity="0.30"/>`);

  // ========== 左上角（x_px=0-50, y_px=0-50）==========
  // 4) 黑胶唱片：圆形 + 同心环 + 中心点
  const vx = 22, vy = 22, vr = 16;
  out.push(`<circle cx="${vx}" cy="${vy}" r="${vr}" fill="#1a1a1a"/>`);
  out.push(`<circle cx="${vx}" cy="${vy}" r="${vr-2}" fill="none" stroke="#3a3a3a" stroke-width="0.8" opacity="0.7"/>`);
  out.push(`<circle cx="${vx}" cy="${vy}" r="${vr-5}" fill="none" stroke="#3a3a3a" stroke-width="0.6" opacity="0.5"/>`);
  out.push(`<circle cx="${vx}" cy="${vy}" r="${vr-9}" fill="none" stroke="#3a3a3a" stroke-width="0.5" opacity="0.4"/>`);
  const centerColor = (t.primary === '#FFFFFF' || t.primary === '#000000') ? '#7C3AED' : t.primary;
  out.push(`<circle cx="${vx}" cy="${vy}" r="2.5" fill="${centerColor}"/>`);
  // 唱片高光
  out.push(`<path d="M ${vx-12} ${vy-8} A ${vr-3} ${vr-3} 0 0 1 ${vx-4} ${vy-12}" stroke="#ffffff" stroke-width="1.2" fill="none" opacity="0.25"/>`);

  // 4b) 左上角音符 ♪（贴在唱片右下角）
  out.push(stampShape(NOTE8, 8, 9, t.primary, 0.85));

  // ========== 右上角（x_px=190-240, y_px=0-60）==========
  // 5) 缩小版吉他（8 宽 × 12 高，紧贴右上角）
  out.push(renderGuitarMini(52, 2));

  // 5b) 右上角音符 ♫（贴在吉他下方）
  out.push(stampShape(NOTE_BEAMED, 52, 14, t.dark, 0.80));

  // ========== 底部条带（人物脚下，y_px=240-288）==========
  // 6) 左下角：钢琴键盘（6 白键 + 3 黑键，紧凑 18×4 列）
  for (let i = 0; i < 6; i++) {
    out.push(`<rect x="${i*3*DPX}" y="${67*DPX}" width="${3*DPX}" height="${4*DPX}" fill="#F4EDE3" stroke="#3F3A33" stroke-width="0.4"/>`);
  }
  // 6b) 黑键（C 大调音型：每 3 键组的第 1、2 键后面嵌黑键）
  [3, 6, 15].forEach(cx => {
    out.push(`<rect x="${(cx-0.5)*DPX}" y="${67*DPX}" width="${1.5*DPX}" height="${2.5*DPX}" fill="#3F3A33"/>`);
  });
  // 6c) 键盘上方一行金色装饰条（"键盘光"）
  out.push(`<rect x="0" y="${67*DPX - 1.5}" width="${18*DPX}" height="1" fill="#C9A878" opacity="0.6"/>`);

  // 7) 右下角：EQ 均衡器（4 根不同高度竖条 + 顶帽 + 底座）
  [[46, 5, t.primary], [49, 8, t.dark], [52, 4, t.primary], [55, 6, '#C9A878']].forEach(([gx, hh, c]) => {
    out.push(bgRect(gx, 71-hh, 2, hh, c, 0.85));
    out.push(bgRect(gx, 71-hh, 2, 1, '#ffffff', 0.4));  // 顶帽高光
  });
  // 7b) EQ 底座（细线 + 4 个旋钮圆）
  out.push(`<rect x="${45*DPX}" y="${71*DPX}" width="${14*DPX}" height="1" fill="${t.dark}" opacity="0.6"/>`);
  for (let i = 0; i < 4; i++) {
    out.push(`<circle cx="${(47+i*3)*DPX}" cy="${71*DPX+3}" r="1.6" fill="${t.dark}" opacity="0.7"/>`);
  }

  // 8) 右侧中部装饰：低八度大谱号 ♬（避开人物右侧，x>50）
  out.push(`<circle cx="${54*DPX}" cy="${28*DPX}" r="6" fill="none" stroke="${t.dark}" stroke-width="1.2" opacity="0.55"/>`);
  out.push(`<circle cx="${54*DPX}" cy="${28*DPX}" r="2" fill="${t.primary}" opacity="0.65"/>`);
  [[0, -10], [4, -8], [-4, 6], [0, 8]].forEach(([dx, dy]) => {
    out.push(`<circle cx="${54*DPX + dx}" cy="${28*DPX + dy}" r="1" fill="${t.primary}" opacity="0.55"/>`);
  });

  // 9) 左侧中部装饰：磁带卷轴（双圆 + 中间细带）
  out.push(`<circle cx="${3*DPX}" cy="${32*DPX}" r="5" fill="none" stroke="${t.dark}" stroke-width="1" opacity="0.55"/>`);
  out.push(`<circle cx="${3*DPX}" cy="${32*DPX}" r="2" fill="${t.primary}" opacity="0.55"/>`);
  out.push(`<circle cx="${3*DPX + 22}" cy="${32*DPX}" r="5" fill="none" stroke="${t.dark}" stroke-width="1" opacity="0.55"/>`);
  out.push(`<circle cx="${3*DPX + 22}" cy="${32*DPX}" r="2" fill="${t.primary}" opacity="0.55"/>`);
  out.push(`<rect x="${3*DPX + 4}" y="${32*DPX - 0.5}" width="14" height="1" fill="${t.dark}" opacity="0.45"/>`);

  // 10) 漂浮音符：限定在画面边角（远离中央人物区）
  out.push(stampShape(NOTE8, 0, 14, t.primary, 0.85));        // 左中下
  out.push(stampShape(NOTE8, 56, 0, '#C9A878', 0.85));        // 右上角
  out.push(stampShape(NOTE_BEAMED, 0, 60, t.dark, 0.70));     // 左下角
  out.push(stampShape(NOTE8, 55, 62, t.primary, 0.75));       // 右下角

  // 11) 金色闪光点：撒在四角（音符余韵）
  [[5, 6], [56, 6], [5, 65], [57, 65], [30, 1], [32, 1], [30, 70], [32, 70]].forEach(([gx, gy]) => {
    out.push(`<rect x="${gx*DPX-1}" y="${gy*DPX-1}" width="2" height="2" fill="#C9A878" opacity="0.85"/>`);
  });

  return out.join('');
}

// 缩小版立式木吉他（8 宽 × 12 高，紧贴右上角）
const GUITAR_MINI = [
  '..kttk..',
  '..kttk..',
  '..kttk..',
  '..kttk..',
  '..kttk..',
  '..kttk..',
  '.k4BB4k.',
  'kBBBBBBk',
  'k444444k',
  'kTTTTTTk',
  'kttttttk',
  '.kkkkkk.',
];
function renderGuitarMini(gx, gy) {
  const rects = [];
  GUITAR_MINI.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const color = GUITAR_COLORS[ch];
      if (color) rects.push(`<rect x="${(gx+c)*DPX}" y="${(gy+r)*DPX}" width="${DPX}" height="${DPX}" fill="${color}"/>`);
    });
  });
  return rects.join('');
}
const SLOT_ORDER = ['body', 'bottom', 'shoes', 'top', 'head', 'accessory'];
const SLOT_LABELS = {
  body: '体型 / BODY',
  bottom: '下装 / BOTTOM',
  shoes: '鞋子 / SHOES',
  top: '上装 / TOP',
  head: '头部 / HEAD',
  accessory: '配饰 / ACC',
};

// 合并所有部件
const ALL_PARTS = {
  body: BODY_PARTS,
  head: HEAD_PARTS,
  top: TOP_PARTS,
  bottom: BOTTOM_PARTS,
  shoes: SHOES_PARTS,
  accessory: ACCESSORY_PARTS,
};

// ============================================================
// 3. State
// ============================================================

const state = {
  theme: THEMES[0],
  skin: SKINS[0],
  hair: HAIR_COLORS[0],
  body: 'body-steve',
  head: 'head-short',
  top: 'top-tshirt',
  bottom: 'bottom-overall',
  shoes: 'shoes-sneaker',
  accessory: 'acc-glasses',
};

// ============================================================
// 4. 渲染器（60×72 微缩版：每格 4×4 像素，紧贴无间隙，X 型 4 子格自动多色）
// ============================================================

// 颜色微调：amt > 0 向白靠拢（提亮），amt < 0 向黑靠拢（压暗）
function shadeColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) {
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
  } else {
    const p = 1 + amt;
    r = Math.round(r * p); g = Math.round(g * p); b = Math.round(b * p);
  }
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// 单个像素格的细腻绘制（4×4 像素 = 4 个 2×2 子方块紧贴无间隙）：
//   左上 hi（受光）/ 右上 main / 左下 main / 右下 lo（背光）
//   无 gap、无圆角、无视邻居光影条 — 块与块紧贴，色彩靠"不同色搭配"出层次
function renderFineCell(x, y, s, color) {
  // 正常像素块：一格 = 一个纯色方块，不再在格内穿插 hi/lo 子格
  // 仅描边色（k 字符 #3F3A33）走细描边路径，保证轮廓轻盈
  if (color === '#3F3A33') {
    const m = +(s * 0.25).toFixed(2);
    const inner = +(s - 2 * m).toFixed(2);
    return `<rect x="${x + m}" y="${y + m}" width="${inner}" height="${inner}" fill="none" stroke="${color}" stroke-width="0.6"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${color}"/>`;
}

// 通用细腻网格渲染：cellAt(col,row) -> 颜色或 null（越界返回 null）
function renderFineGrid(cellAt, ox, oy, rows, cols, scale) {
  const s = PX * scale;
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = cellAt(c, r);
      if (!color) continue;
      out.push(renderFineCell((ox + c) * s, (oy + r) * s, s, color));
    }
  }
  return out.join('');
}

// 把部件的 30 列宽字符画升采样到 60 列宽返回（每字符拆 2 子格，每行拆 2 行）
function partCellAccessor(part) {
  const cells = [];
  let cols = 0;
  for (let row = 0; row < part.lines.length; row++) {
    const line = expand(part.lines[row]);
    const subRow = [];
    for (let i = 0; i < line.length; i++) subRow.push(resolveColor(line[i]));
    cells.push(subRow);
    if (subRow.length > cols) cols = subRow.length;
  }
  return {
    cols,
    rows: cells.length,
    at: (c, r) => (r < 0 || r >= cells.length || c < 0 || c >= cells[r].length) ? null : cells[r][c],
  };
}

function renderPartSVG(part, scale = 1) {
  if (part.render) {
    // 函数式渲染（历史接口）
    return part.render();
  }
  const acc = partCellAccessor(part);
  return renderFineGrid(acc.at, part.ox, part.oy, acc.rows, acc.cols, scale);
}

// 把 6 个槽位的部件按渲染顺序合成到 60×72 全局网格（后面画的覆盖前面）
function buildCompositeGrid() {
  const grid = Array.from({ length: H }, () => new Array(W).fill(null));
  SLOT_ORDER.forEach(slot => {
    const partId = state[slot];
    if (!partId) return;
    const part = ALL_PARTS[slot].find(p => p.id === partId);
    if (!part) return;
    const acc = partCellAccessor(part);
    for (let r = 0; r < acc.rows; r++) {
      for (let c = 0; c < acc.cols; c++) {
        const color = acc.at(c, r);
        if (!color) continue;
        const gx = part.ox + c, gy = part.oy + r;
        if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
        grid[gy][gx] = color;
      }
    }
  });
  return grid;
}

// 大预览：装饰层垫底 + 合成后的人物整体细腻渲染（无投影，靠多色搭配出层次）
function renderAvatar() {
  const svg = document.getElementById('avatar-svg');
  const grid = buildCompositeGrid();
  const at = (c, r) => (r < 0 || r >= H || c < 0 || c >= W) ? null : grid[r][c];
  const out = [];
  // 音乐氛围装饰层：最先画，垫在人物身后
  out.push(renderMusicDecor());
  out.push(renderFineGrid(at, 0, 0, H, W, 1));
  svg.innerHTML = out.join('');
  renderPlayerThumb();
  // 同步 CSS 变量
  document.documentElement.style.setProperty('--avatar-theme', state.theme.primary);
  document.documentElement.style.setProperty('--avatar-theme-dark', state.theme.dark);
  document.documentElement.style.setProperty('--avatar-theme-light', state.theme.light);
}

// 渲染：包含预览缩略图（部件本身缩到 1/4 大小）
function renderThumbnail(part, scale) {
  return renderPartSVG(part, scale);
}

// ============================================================
// 5. UI 渲染
// ============================================================

function renderPaletteSwatches() {
  const container = document.getElementById('palette-swatches');
  container.innerHTML = THEMES.map(t => `
    <button
      class="palette-chip"
      style="background: linear-gradient(135deg, ${t.light} 0%, ${t.primary} 50%, ${t.dark} 100%);"
      data-theme-id="${t.id}"
      aria-checked="${t.id === state.theme.id}"
      title="${t.name}主题色"
    ></button>
  `).join('');
  container.querySelectorAll('.palette-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.theme = THEMES.find(t => t.id === btn.dataset.themeId);
      renderPaletteSwatches();
      renderAvatar();
    });
  });
}

function renderSkinSwatches() {
  const container = document.getElementById('skin-swatches');
  container.innerHTML = SKINS.map(s => `
    <button
      class="skin-chip"
      style="background: ${s.color};"
      data-skin-id="${s.id}"
      aria-checked="${s.id === state.skin.id}"
      title="${s.name}肤色"
    ></button>
  `).join('');
  container.querySelectorAll('.skin-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.skin = SKINS.find(s => s.id === btn.dataset.skinId);
      renderSkinSwatches();
      renderAvatar();
    });
  });
}

// 假时长，让播放列表行更"音乐站"
const SLOT_DURATIONS = {
  body: '01:18', bottom: '00:55',
  shoes: '00:32', top: '01:04', head: '00:48', accessory: '00:21',
};

function renderCurrentSlots() {
  const ul = document.getElementById('current-slots');
  ul.innerHTML = SLOT_ORDER.map(slot => {
    const partId = state[slot];
    const part = partId ? ALL_PARTS[slot].find(p => p.id === partId) : null;
    const thumb = part ? renderThumbnail(part, 0.25) : '';
    return `<li class="${part ? '' : 'empty'}">
      <div class="slot-thumb">${thumb}</div>
      <div class="slot-info">
        <strong>${SLOT_LABELS[slot]}</strong>
        <span class="slot-id">${part ? part.label : '尚未选择'}</span>
      </div>
      <span class="slot-duration">${SLOT_DURATIONS[slot]}</span>
    </li>`;
  }).join('');
}

// 底部播放器条：渲染当前形象小缩略图
function renderPlayerThumb() {
  const wrap = document.getElementById('player-thumb');
  if (!wrap) return;
  const svg = document.getElementById('avatar-svg').cloneNode(true);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('viewBox', '0 0 240 288');
  svg.style.width = '40px';
  svg.style.height = '48px';
  wrap.innerHTML = '';
  wrap.appendChild(svg);

  // 同步"正在装扮中"标题
  const track = document.getElementById('track-name');
  if (track) {
    const equipped = SLOT_ORDER.filter(s => state[s]).length;
    track.textContent = `已选 ${equipped} / 6 槽位 · ${state.theme.name}主题`;
  }
}

function renderPickerGrid() {
  const grid = document.getElementById('picker-grid');
  grid.innerHTML = SLOT_ORDER.map((slot, idx) => {
    const parts = ALL_PARTS[slot];
    const cards = parts.map(p => {
      const pressed = state[slot] === p.id ? 'true' : 'false';
      const svg = renderThumbnail(p, 0.25);
      return `
        <button class="option" data-slot="${slot}" data-part-id="${p.id}" aria-pressed="${pressed}">
          <svg viewBox="0 0 ${W*PX*0.5} ${H*PX*0.5}" width="60" height="72">${svg}</svg>
          <span>${p.label}</span>
        </button>
      `;
    }).join('');
    const orderNo = String(idx + 1).padStart(2, '0');
    return `
      <div class="slot-card">
        <header>
          <h3><span class="slot-order">#${orderNo}</span>${SLOT_LABELS[slot]}</h3>
          <button class="clear" data-clear-slot="${slot}">清除</button>
        </header>
        <div class="options">${cards}</div>
      </div>
    `;
  }).join('');

  // 绑定选项点击
  grid.querySelectorAll('.option').forEach(btn => {
    btn.addEventListener('click', () => {
      const slot = btn.dataset.slot;
      const partId = btn.dataset.partId;
      state[slot] = partId;
      renderPickerGrid();
      renderCurrentSlots();
      renderAvatar();
    });
  });

  // 绑定清除按钮
  grid.querySelectorAll('.clear').forEach(btn => {
    btn.addEventListener('click', () => {
      const slot = btn.dataset.clearSlot;
      state[slot] = null;
      renderPickerGrid();
      renderCurrentSlots();
      renderAvatar();
    });
  });
}

// ============================================================
// 6. 初始化
// ============================================================

function init() {
  renderPaletteSwatches();
  renderSkinSwatches();
  renderCurrentSlots();
  renderPickerGrid();
  renderAvatar();
  renderPlayerThumb();

  const updated = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date());
  document.getElementById('updated-at').textContent = `${updated}`;

  // 进度时间随机微动
  const cur = document.getElementById('progress-current');
  let seconds = 0;
  setInterval(() => {
    seconds = (seconds + 1) % 480;
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    if (cur) cur.textContent = `${m}:${s}`;
  }, 1000);
}

init();