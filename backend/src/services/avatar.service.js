const {
  listEnabledComponents,
  getComponentById,
  countComponents,
  insertComponent,
  getUserAvatar,
  upsertUserAvatar,
  createPortraitLog,
} = require('../db/avatar')

const VALID_SLOTS = ['body', 'background', 'head', 'top', 'bottom', 'shoes', 'accessory']
const DEFAULT_THEME_COLOR = '#7C3AED'

// 所有 SVG 部件 viewBox = 0 0 200 240
// 渲染顺序：body → background → head → top → bottom → shoes → accessory
// body 是底模轮廓（颈/肩/躯干），先画在最底层；背景铺在底模后面（z 序上"前-后"）
// 主题色：需要主题色的元素带 class="t"，前端组装时统一注入：
//   <style>.t { fill: var(--avatar-theme, #7C3AED); }</style>
//
// 借鉴开源参考：
//   - avataaars：top 款式 + graphicType 二级搭配（GraphicShirt+Bat/Diamond/Skull）
//     https://github.com/fangpenlin/avataaars-generator （MIT，仅借鉴枚举结构与搭配维度）
//   - beanheads：模块化分槽位 + 独立配色变量
//     https://beanheads.robertbroersma.com
// 我们自写 SVG，避免直接复用对方资产
const SLOT_DEFINITIONS = [
  {
    slot: 'body',
    label: '模型',
    items: [
      {
        label: '标准',
        svgFragment:
          '<path d="M76 84 Q80 80 88 80 L112 80 Q120 80 124 84 L138 100 L138 230 L62 230 L62 100 Z" fill="#FCD9B6"/>',
      },
      {
        label: '纤瘦',
        svgFragment:
          '<path d="M82 84 Q86 80 92 80 L108 80 Q114 80 118 84 L130 102 L130 230 L70 230 L70 102 Z" fill="#FCD9B6"/>',
      },
      {
        label: '壮实',
        svgFragment:
          '<path d="M70 84 Q74 78 84 78 L116 78 Q126 78 130 84 L144 100 L144 230 L56 230 L56 100 Z" fill="#FCD9B6"/>',
      },
      {
        label: '高挑',
        svgFragment:
          '<path d="M78 84 Q82 80 90 80 L110 80 Q118 80 122 84 L136 100 L136 236 L64 236 L64 100 Z" fill="#FCD9B6"/>',
      },
    ],
  },
  {
    slot: 'background',
    label: '背景',
    items: [
      {
        label: '柔光渐变',
        themeHint: '#7C3AED',
        svgFragment:
          '<defs><linearGradient id="bg-soft" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#EDE9FE"/><stop offset="100%" stop-color="#FBCFE8"/></linearGradient></defs><rect x="0" y="0" width="200" height="240" fill="url(#bg-soft)"/>',
      },
      {
        label: '极光',
        themeHint: '#06B6D4',
        svgFragment:
          '<defs><linearGradient id="bg-aurora" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#22D3EE"/><stop offset="60%" stop-color="#7C3AED"/><stop offset="100%" stop-color="#1E1B4B"/></linearGradient></defs><rect x="0" y="0" width="200" height="240" fill="url(#bg-aurora)"/>',
      },
      {
        label: '网格',
        themeHint: '#A78BFA',
        svgFragment:
          '<rect x="0" y="0" width="200" height="240" fill="#F5F3FF"/><g stroke="#DDD6FE" stroke-width="1"><path d="M0 30 H200"/><path d="M0 60 H200"/><path d="M0 90 H200"/><path d="M0 120 H200"/><path d="M0 150 H200"/><path d="M0 180 H200"/><path d="M0 210 H200"/><path d="M30 0 V240"/><path d="M60 0 V240"/><path d="M90 0 V240"/><path d="M120 0 V240"/><path d="M150 0 V240"/><path d="M180 0 V240"/></g>',
      },
      {
        label: '夜空',
        themeHint: '#1E1B4B',
        svgFragment:
          '<rect x="0" y="0" width="200" height="240" fill="#0F172A"/><circle cx="40" cy="50" r="1.5" fill="#F8FAFC"/><circle cx="160" cy="35" r="1" fill="#F8FAFC"/><circle cx="100" cy="80" r="1.2" fill="#F8FAFC"/><circle cx="60" cy="120" r="1" fill="#F8FAFC"/><circle cx="170" cy="150" r="1.5" fill="#F8FAFC"/><circle cx="30" cy="190" r="1" fill="#F8FAFC"/><circle cx="120" cy="200" r="1.3" fill="#F8FAFC"/><circle cx="80" cy="30" r="0.8" fill="#F8FAFC"/><circle cx="190" cy="100" r="1" fill="#F8FAFC"/><path d="M30 60 Q60 40 90 60" stroke="#F8FAFC" stroke-width="0.5" fill="none" opacity="0.4"/>',
      },
      {
        label: '波点',
        themeHint: '#EC4899',
        svgFragment:
          '<rect x="0" y="0" width="200" height="240" fill="#FDF2F8"/><g fill="#F9A8D4"><circle cx="20" cy="20" r="3"/><circle cx="60" cy="50" r="3"/><circle cx="100" cy="30" r="3"/><circle cx="140" cy="60" r="3"/><circle cx="180" cy="40" r="3"/><circle cx="40" cy="100" r="3"/><circle cx="80" cy="130" r="3"/><circle cx="120" cy="110" r="3"/><circle cx="160" cy="140" r="3"/><circle cx="30" cy="180" r="3"/><circle cx="70" cy="210" r="3"/><circle cx="110" cy="190" r="3"/><circle cx="150" cy="220" r="3"/><circle cx="180" cy="190" r="3"/></g>',
      },
      {
        label: '纯紫',
        themeHint: '#7C3AED',
        svgFragment: '<rect x="0" y="0" width="200" height="240" fill="#7C3AED"/>',
      },
      {
        label: '纯白',
        themeHint: '#E5E7EB',
        svgFragment: '<rect x="0" y="0" width="200" height="240" fill="#FFFFFF"/>',
      },
      {
        label: '雾灰',
        themeHint: '#94A3B8',
        svgFragment:
          '<defs><linearGradient id="bg-fog" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#F1F5F9"/><stop offset="100%" stop-color="#CBD5E1"/></linearGradient></defs><rect x="0" y="0" width="200" height="240" fill="url(#bg-fog)"/>',
      },
    ],
  },
  {
    slot: 'head',
    label: '发型',
    items: [
      {
        label: '短发',
        svgFragment:
          '<ellipse cx="100" cy="60" rx="26" ry="30" fill="#FCD9B6"/><path d="M74 50 Q100 28 126 50 L126 62 Q100 52 74 62 Z" fill="#3F3F46"/><circle cx="91" cy="62" r="2" fill="#1F2937"/><circle cx="109" cy="62" r="2" fill="#1F2937"/><path d="M93 76 Q100 80 107 76" stroke="#9A3412" stroke-width="1.5" fill="none"/>',
      },
      {
        label: '长发',
        svgFragment:
          '<ellipse cx="100" cy="60" rx="26" ry="30" fill="#FCD9B6"/><path d="M70 50 Q100 22 130 50 L132 130 Q120 105 100 100 Q80 105 68 130 Z" fill="#7C2D12"/><circle cx="91" cy="62" r="2" fill="#1F2937"/><circle cx="109" cy="62" r="2" fill="#1F2937"/><path d="M93 76 Q100 80 107 76" stroke="#9A3412" stroke-width="1.5" fill="none"/>',
      },
      {
        label: '马尾',
        svgFragment:
          '<ellipse cx="100" cy="60" rx="26" ry="30" fill="#FCD9B6"/><path d="M74 50 Q100 28 130 50 L132 56 Q150 58 148 76 L135 70 Q100 52 74 62 Z" fill="#1F2937"/><path d="M148 76 Q168 110 152 138 L140 130 Q156 100 142 80 Z" fill="#1F2937"/><circle cx="91" cy="62" r="2" fill="#1F2937"/><circle cx="109" cy="62" r="2" fill="#1F2937"/><path d="M93 76 Q100 80 107 76" stroke="#9A3412" stroke-width="1.5" fill="none"/>',
      },
      {
        label: '波波头',
        svgFragment:
          '<ellipse cx="100" cy="60" rx="26" ry="30" fill="#FCD9B6"/><path d="M72 48 Q100 24 128 48 L130 88 Q100 78 70 88 Z" fill="#1F2937"/><circle cx="91" cy="62" r="2" fill="#1F2937"/><circle cx="109" cy="62" r="2" fill="#1F2937"/><path d="M93 76 Q100 80 107 76" stroke="#9A3412" stroke-width="1.5" fill="none"/>',
      },
      {
        label: '卷发',
        svgFragment:
          '<ellipse cx="100" cy="60" rx="28" ry="30" fill="#FCD9B6"/><g fill="#7C2D12"><circle cx="76" cy="48" r="10"/><circle cx="100" cy="40" r="10"/><circle cx="124" cy="48" r="10"/><circle cx="70" cy="68" r="9"/><circle cx="130" cy="68" r="9"/></g><circle cx="91" cy="62" r="2" fill="#1F2937"/><circle cx="109" cy="62" r="2" fill="#1F2937"/><path d="M93 76 Q100 80 107 76" stroke="#9A3412" stroke-width="1.5" fill="none"/>',
      },
      {
        label: '麻花辫',
        svgFragment:
          '<ellipse cx="100" cy="60" rx="26" ry="30" fill="#FCD9B6"/><path d="M74 50 Q100 28 126 50 L128 78 L120 84 L100 78 L80 84 L72 78 Z" fill="#92400E"/><g fill="#92400E"><path d="M76 78 L82 130 L74 132 Z"/><path d="M124 78 L118 130 L126 132 Z"/></g><circle cx="91" cy="62" r="2" fill="#1F2937"/><circle cx="109" cy="62" r="2" fill="#1F2937"/><path d="M93 76 Q100 80 107 76" stroke="#9A3412" stroke-width="1.5" fill="none"/>',
      },
      {
        label: '齐刘海',
        svgFragment:
          '<ellipse cx="100" cy="60" rx="26" ry="30" fill="#FCD9B6"/><path d="M74 48 L126 48 L124 60 Q100 54 76 60 Z" fill="#1F2937"/><path d="M74 50 Q100 38 126 50 L128 100 Q100 90 72 100 Z" fill="#1F2937"/><circle cx="91" cy="66" r="2" fill="#1F2937"/><circle cx="109" cy="66" r="2" fill="#1F2937"/><path d="M93 78 Q100 82 107 78" stroke="#9A3412" stroke-width="1.5" fill="none"/>',
      },
      {
        label: '丸子头',
        svgFragment:
          '<ellipse cx="100" cy="60" rx="26" ry="30" fill="#FCD9B6"/><circle cx="100" cy="34" r="14" fill="#7C2D12"/><path d="M76 50 Q100 42 124 50 L126 70 L74 70 Z" fill="#7C2D12"/><circle cx="91" cy="62" r="2" fill="#1F2937"/><circle cx="109" cy="62" r="2" fill="#1F2937"/><path d="M93 76 Q100 80 107 76" stroke="#9A3412" stroke-width="1.5" fill="none"/>',
      },
      {
        label: '寸头',
        svgFragment:
          '<ellipse cx="100" cy="60" rx="26" ry="30" fill="#FCD9B6"/><path d="M76 44 Q100 30 124 44 L126 60 Q100 50 74 60 Z" fill="#1F2937"/><circle cx="91" cy="62" r="2" fill="#1F2937"/><circle cx="109" cy="62" r="2" fill="#1F2937"/><path d="M93 76 Q100 80 107 76" stroke="#9A3412" stroke-width="1.5" fill="none"/>',
      },
      {
        label: '双马尾',
        svgFragment:
          '<ellipse cx="100" cy="60" rx="26" ry="30" fill="#FCD9B6"/><path d="M74 50 Q100 28 126 50 L128 60 Q100 50 72 60 Z" fill="#A21CAF"/><path d="M70 56 Q60 80 64 130 L72 132 Q76 100 76 76 Z" fill="#A21CAF"/><path d="M130 56 Q140 80 136 130 L128 132 Q124 100 124 76 Z" fill="#A21CAF"/><circle cx="91" cy="62" r="2" fill="#1F2937"/><circle cx="109" cy="62" r="2" fill="#1F2937"/><path d="M93 76 Q100 80 107 76" stroke="#9A3412" stroke-width="1.5" fill="none"/>',
      },
      {
        label: '戴帽',
        svgFragment:
          '<ellipse cx="100" cy="60" rx="26" ry="30" fill="#FCD9B6"/><path d="M62 40 Q100 12 138 40 L138 56 L62 56 Z" fill="#1F2937"/><rect x="58" y="54" width="84" height="6" fill="#0F172A"/><circle cx="91" cy="68" r="2" fill="#1F2937"/><circle cx="109" cy="68" r="2" fill="#1F2937"/><path d="M93 80 Q100 84 107 80" stroke="#9A3412" stroke-width="1.5" fill="none"/>',
      },
      {
        label: '披肩发',
        svgFragment:
          '<ellipse cx="100" cy="60" rx="26" ry="30" fill="#FCD9B6"/><path d="M68 50 Q100 18 132 50 L138 130 Q120 110 100 108 Q80 110 62 130 Z" fill="#4C1D95"/><circle cx="91" cy="62" r="2" fill="#1F2937"/><circle cx="109" cy="62" r="2" fill="#1F2937"/><path d="M93 76 Q100 80 107 76" stroke="#9A3412" stroke-width="1.5" fill="none"/>',
      },
    ],
  },
  {
    slot: 'top',
    label: '上衣',
    items: [
      {
        label: '素 T 恤',
        themeHint: '#7C3AED',
        svgFragment:
          '<path class="t" d="M68 95 L82 88 L100 95 L118 88 L132 95 L138 110 L128 116 L128 168 L72 168 L72 116 L62 110 Z"/><path class="t" d="M82 88 Q100 100 118 88"/>',
      },
      {
        label: '卫衣',
        themeHint: '#0EA5E9',
        svgFragment:
          '<path class="t" d="M62 96 L80 86 L100 96 L120 86 L138 96 L142 115 L130 122 L130 172 L70 172 L70 122 L58 115 Z"/><path class="t" d="M82 92 Q100 106 118 92 L116 112 Q100 122 84 112 Z"/><rect x="92" y="150" width="16" height="14" rx="2" fill="#0F172A" opacity="0.4"/>',
      },
      {
        label: '西装',
        svgFragment:
          '<path d="M62 96 L82 86 L100 96 L118 86 L138 96 L142 115 L130 122 L130 172 L70 172 L70 122 L58 115 Z" fill="#1E293B"/><path d="M82 86 L100 96 L118 86 L114 172 L100 165 L86 172 Z" fill="#F8FAFC"/><path d="M98 96 L100 130 L102 96 Z" fill="#7C3AED"/>',
      },
      {
        label: 'T恤-骷髅',
        themeHint: '#7C3AED',
        svgFragment:
          '<path class="t" d="M68 95 L82 88 L100 95 L118 88 L132 95 L138 110 L128 116 L128 168 L72 168 L72 116 L62 110 Z"/><path class="t" d="M82 88 Q100 100 118 88"/><g fill="#0F172A"><circle cx="88" cy="125" r="5"/><circle cx="112" cy="125" r="5"/><path d="M86 138 Q100 132 114 138 L110 148 L100 142 L90 148 Z"/></g>',
      },
      {
        label: 'T恤-星星',
        themeHint: '#7C3AED',
        svgFragment:
          '<path class="t" d="M68 95 L82 88 L100 95 L118 88 L132 95 L138 110 L128 116 L128 168 L72 168 L72 116 L62 110 Z"/><path class="t" d="M82 88 Q100 100 118 88"/><path d="M100 120 L104 130 L114 130 L106 137 L109 147 L100 141 L91 147 L94 137 L86 130 L96 130 Z" fill="#FBBF24"/>',
      },
      {
        label: 'T恤-闪电',
        themeHint: '#7C3AED',
        svgFragment:
          '<path class="t" d="M68 95 L82 88 L100 95 L118 88 L132 95 L138 110 L128 116 L128 168 L72 168 L72 116 L62 110 Z"/><path class="t" d="M82 88 Q100 100 118 88"/><path d="M104 118 L92 138 L100 138 L96 150 L110 130 L102 130 Z" fill="#FBBF24"/>',
      },
      {
        label: 'T恤-钻石',
        themeHint: '#7C3AED',
        svgFragment:
          '<path class="t" d="M68 95 L82 88 L100 95 L118 88 L132 95 L138 110 L128 116 L128 168 L72 168 L72 116 L62 110 Z"/><path class="t" d="M82 88 Q100 100 118 88"/><path d="M100 118 L116 128 L100 152 L84 128 Z" fill="#22D3EE"/><path d="M100 118 L92 128 L100 128 Z M100 128 L108 128 L100 152 Z" fill="#0EA5E9" opacity="0.6"/>',
      },
      {
        label: '卫衣-闪电',
        themeHint: '#0EA5E9',
        svgFragment:
          '<path class="t" d="M62 96 L80 86 L100 96 L120 86 L138 96 L142 115 L130 122 L130 172 L70 172 L70 122 L58 115 Z"/><path class="t" d="M82 92 Q100 106 118 92 L116 112 Q100 122 84 112 Z"/><rect x="92" y="150" width="16" height="14" rx="2" fill="#0F172A" opacity="0.4"/><path d="M104 120 L92 140 L100 140 L96 154 L110 132 L102 132 Z" fill="#FBBF24"/>',
      },
      {
        label: '卫衣-数字',
        themeHint: '#0EA5E9',
        svgFragment:
          '<path class="t" d="M62 96 L80 86 L100 96 L120 86 L138 96 L142 115 L130 122 L130 172 L70 172 L70 122 L58 115 Z"/><path class="t" d="M82 92 Q100 106 118 92 L116 112 Q100 122 84 112 Z"/><text x="100" y="158" font-family="Arial Black" font-size="22" font-weight="900" fill="#FBBF24" text-anchor="middle">7</text>',
      },
      {
        label: '背心',
        themeHint: '#1F2937',
        svgFragment:
          '<path class="t" d="M70 96 L86 88 L100 96 L114 88 L130 96 L138 110 L132 120 L132 168 L68 168 L68 120 L62 110 Z"/><path d="M86 88 L100 110 L114 88" stroke="#0F172A" stroke-width="1.5" fill="none"/>',
      },
      {
        label: '毛衣',
        themeHint: '#7F1D1D',
        svgFragment:
          '<path class="t" d="M62 94 L78 84 L100 94 L122 84 L138 94 L144 116 L130 124 L130 172 L70 172 L70 124 L56 116 Z"/><path d="M82 102 Q90 112 100 108 Q110 112 118 102 M82 116 Q90 126 100 122 Q110 126 118 116 M82 130 Q90 140 100 136 Q110 140 118 130 M82 144 Q90 154 100 150 Q110 154 118 144 M82 158 Q90 164 100 162 Q110 164 118 158" stroke="#4C1D95" stroke-width="0.8" fill="none" opacity="0.5"/>',
      },
      {
        label: '衬衫',
        themeHint: '#F8FAFC',
        svgFragment:
          '<path d="M68 95 L82 88 L100 95 L118 88 L132 95 L138 110 L128 116 L128 168 L72 168 L72 116 L62 110 Z" fill="#F8FAFC" stroke="#94A3B8" stroke-width="0.8"/><path d="M100 95 L100 165" stroke="#94A3B8" stroke-width="0.8"/><g fill="#7C3AED"><circle cx="100" cy="108" r="1.5"/><circle cx="100" cy="125" r="1.5"/><circle cx="100" cy="142" r="1.5"/><circle cx="100" cy="159" r="1.5"/></g>',
      },
    ],
  },
  {
    slot: 'bottom',
    label: '下装',
    items: [
      {
        label: '牛仔裤',
        svgFragment:
          '<path d="M72 168 L128 168 L132 230 L108 230 L100 188 L92 230 L68 230 Z" fill="#3B82F6"/><path d="M100 168 L132 188" stroke="#1E40AF" stroke-width="1" fill="none"/>',
      },
      {
        label: '休闲裤',
        themeHint: '#92400E',
        svgFragment:
          '<path class="t" d="M72 168 L128 168 L132 230 L108 230 L100 188 L92 230 L68 230 Z"/>',
      },
      {
        label: '半裙',
        themeHint: '#EC4899',
        svgFragment:
          '<path class="t" d="M72 168 L128 168 L138 215 Q100 205 62 215 Z"/>',
      },
      {
        label: '阔腿裤',
        themeHint: '#1F2937',
        svgFragment:
          '<path class="t" d="M68 168 L132 168 L142 232 L106 232 L100 190 L94 232 L58 232 Z"/>',
      },
      {
        label: '运动裤',
        svgFragment:
          '<path d="M72 168 L128 168 L132 228 L108 228 L100 190 L92 228 L68 228 Z" fill="#1F2937"/><path d="M68 172 L72 172 M128 172 L132 172" stroke="#F8FAFC" stroke-width="0.8"/><path d="M72 168 L132 168" stroke="#FBBF24" stroke-width="1"/>',
      },
      {
        label: '短裤',
        themeHint: '#10B981',
        svgFragment:
          '<path class="t" d="M72 168 L128 168 L132 200 L108 200 L100 178 L92 200 L68 200 Z"/>',
      },
    ],
  },
  {
    slot: 'shoes',
    label: '鞋',
    items: [
      {
        label: '运动鞋',
        themeHint: '#7C3AED',
        svgFragment:
          '<ellipse cx="85" cy="234" rx="18" ry="5" fill="#F8FAFC"/><ellipse cx="115" cy="234" rx="18" ry="5" fill="#F8FAFC"/><path class="t" d="M67 232 Q70 224 85 224 L100 232 Z"/><path class="t" d="M100 232 Q115 224 132 224 Q134 230 132 234 Z"/>',
      },
      {
        label: '皮鞋',
        svgFragment:
          '<ellipse cx="85" cy="234" rx="18" ry="5" fill="#1F2937"/><ellipse cx="115" cy="234" rx="18" ry="5" fill="#1F2937"/>',
      },
      {
        label: '靴子',
        svgFragment:
          '<path d="M70 200 L100 200 L100 236 L68 236 Z" fill="#7C2D12"/><path d="M100 200 L130 200 L130 236 L98 236 Z" fill="#7C2D12"/><rect x="68" y="232" width="32" height="4" fill="#1F2937"/><rect x="98" y="232" width="32" height="4" fill="#1F2937"/>',
      },
      {
        label: '凉鞋',
        themeHint: '#92400E',
        svgFragment:
          '<ellipse cx="85" cy="234" rx="16" ry="4" fill="#92400E"/><ellipse cx="115" cy="234" rx="16" ry="4" fill="#92400E"/><path class="t" d="M70 230 L100 226 L130 230"/>',
      },
      {
        label: '拖鞋',
        svgFragment:
          '<ellipse cx="85" cy="236" rx="16" ry="3" fill="#0EA5E9"/><ellipse cx="115" cy="236" rx="16" ry="3" fill="#0EA5E9"/><path d="M75 228 Q85 220 95 228" stroke="#0EA5E9" stroke-width="3" fill="none"/>',
      },
    ],
  },
  {
    slot: 'accessory',
    label: '配饰',
    items: [
      {
        label: '耳机',
        themeHint: '#7C3AED',
        svgFragment:
          '<path class="t" d="M76 60 Q100 38 124 60" stroke-width="3" fill="none" stroke="currentColor"/><rect class="t" x="68" y="60" width="10" height="14" rx="2"/><rect class="t" x="122" y="60" width="10" height="14" rx="2"/>',
      },
      {
        label: '墨镜',
        svgFragment:
          '<rect x="78" y="58" width="18" height="10" rx="2" fill="#0F172A"/><rect x="104" y="58" width="18" height="10" rx="2" fill="#0F172A"/><path d="M96 62 H104" stroke="#0F172A" stroke-width="2"/>',
      },
      {
        label: '项链',
        svgFragment:
          '<path d="M85 92 Q100 108 115 92" stroke="#FBBF24" stroke-width="2" fill="none"/><circle cx="100" cy="108" r="4" fill="#FBBF24"/>',
      },
      {
        label: '棒球帽',
        themeHint: '#0EA5E9',
        svgFragment:
          '<path class="t" d="M62 56 Q100 24 138 56 L138 60 L62 60 Z"/><path d="M58 60 Q100 64 142 60 L142 66 Q100 70 58 66 Z" fill="#0F172A"/>',
      },
      {
        label: '围巾',
        themeHint: '#DC2626',
        svgFragment:
          '<path class="t" d="M68 96 L132 96 L130 110 L70 110 Z"/><path class="t" d="M70 110 L78 138 L86 138 L84 110 Z"/><path class="t" d="M116 110 L124 138 L130 138 L128 110 Z"/>',
      },
      {
        label: '口罩',
        svgFragment:
          '<path d="M80 70 Q100 76 120 70 L120 90 Q100 96 80 90 Z" fill="#06B6D4" opacity="0.85"/><path d="M88 78 Q100 82 112 78" stroke="#FFFFFF" stroke-width="1.5" fill="none"/>',
      },
      {
        label: '手表',
        themeHint: '#1F2937',
        svgFragment:
          '<rect x="140" y="120" width="14" height="14" rx="2" class="t"/><rect x="142" y="105" width="10" height="16" fill="#7C2D12"/><rect x="142" y="134" width="10" height="16" fill="#7C2D12"/>',
      },
      {
        label: '单肩包',
        themeHint: '#92400E',
        svgFragment:
          '<path class="t" d="M44 140 L60 130 L62 168 L46 178 Z"/><path d="M48 132 Q60 122 64 130" stroke="#7C2D12" stroke-width="1.5" fill="none"/>',
      },
    ],
  },
]

function ensureDefaultComponents(database) {
  if (countComponents(database) > 0) return 0
  let inserted = 0
  const insertAll = database.transaction(() => {
    for (const def of SLOT_DEFINITIONS) {
      def.items.forEach((item, index) => {
        insertComponent(database, {
          slot: def.slot,
          label: item.label,
          svgFragment: item.svgFragment,
          themeHint: item.themeHint ?? null,
          sortOrder: index,
        })
        inserted += 1
      })
    }
  })
  insertAll()
  return inserted
}

function isValidHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

function resolveSlotIds(database, payload) {
  const normalized = {}
  for (const slot of VALID_SLOTS) {
    const camelKey = `${slot}Id`
    const snakeKey = `${slot}_id`
    const raw = payload?.[camelKey] ?? payload?.[snakeKey] ?? null
    if (raw === null || raw === undefined || raw === '') {
      normalized[slot] = null
      continue
    }
    if (!Number.isInteger(raw)) {
      const error = new Error(`槽位 ${slot} 的组件 ID 无效`)
      error.status = 400
      throw error
    }
    const component = getComponentById(database, raw)
    if (!component || component.slot !== slot || !component.enabled) {
      const error = new Error(`槽位 ${slot} 的组件不存在或已禁用`)
      error.status = 400
      throw error
    }
    normalized[slot] = raw
  }
  return normalized
}

function getMyAvatar(database, userId) {
  const row = getUserAvatar(database, userId)
  const components = listEnabledComponents(database)
  return {
    avatar: row
      ? {
          userId: row.user_id,
          slots: {
            body: row.body_id,
            background: row.background_id,
            head: row.head_id,
            top: row.top_id,
            bottom: row.bottom_id,
            shoes: row.shoes_id,
            accessory: row.accessory_id,
          },
          themeColor: row.theme_color,
          updatedAt: row.updated_at,
        }
      : null,
    components,
  }
}

function updateMyAvatar(database, userId, payload) {
  const resolved = resolveSlotIds(database, payload)
  const themeColor =
    payload?.themeColor && isValidHexColor(payload.themeColor)
      ? payload.themeColor
      : DEFAULT_THEME_COLOR
  const persisted = upsertUserAvatar(database, userId, {
    bodyId: resolved.body,
    backgroundId: resolved.background,
    headId: resolved.head,
    topId: resolved.top,
    bottomId: resolved.bottom,
    shoesId: resolved.shoes,
    accessoryId: resolved.accessory,
    themeColor,
  })
  createPortraitLog(database, {
    userId,
    source: 'manual',
    snapshot: { ...resolved, themeColor },
    status: 'accepted',
  })
  return persisted
}

function createAvatarService({ database }) {
  if (!database) {
    throw new Error('createAvatarService 必须传入 database')
  }
  ensureDefaultComponents(database)
  return {
    getMyAvatar: (userId) => getMyAvatar(database, userId),
    updateMyAvatar: (userId, payload) =>
      updateMyAvatar(database, userId, payload),
    listComponents: () => listEnabledComponents(database),
  }
}

module.exports = {
  VALID_SLOTS,
  DEFAULT_THEME_COLOR,
  SLOT_DEFINITIONS,
  ensureDefaultComponents,
  createAvatarService,
  _internal: {
    resolveSlotIds,
    isValidHexColor,
  },
}