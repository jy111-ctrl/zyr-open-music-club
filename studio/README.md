# Avatar Studio · 像素音乐小人穿搭编辑器

open-music-club 生态下的**形象装扮工作室**。纯 SVG 像素画，前端零依赖；后端 Node 原生 HTTP + SQLite 持久化，clone 下来即可运行。

四个栏目，左侧导航切换：

| 栏目 | 说明 |
| --- | --- |
| **换装工坊** | 手动搭配 6 个槽位：体型 / 发型 / 上衣 / 下装 / 鞋 / 配饰，8 套莫兰迪配色主题 |
| **自动换装** | 7 套风格预设（街头 / 学院 / 舞台 / 冒险 / 度假 / 现场 / 居家）一键摇号，支持锁定槽位、保持配色、最近 6 套回滚 |
| **照片定制** | 上传照片 → 提取组合色块 → 6 风格判读 → 生成 3 套专属候选，一键应用回工坊 |
| **我的形象** | 形象库：保存 / 套用 / 设为当前 / 删除，数据落在 SQLite |

---

## 快速开始

需要 **Node.js ≥ 22.5.0**（后端使用内置 `node:sqlite`，不依赖任何 npm 包）。

```bash
# 1. 启动
node serve.js
# 或 npm start

# 2. 打开
# http://127.0.0.1:8123/index.html
```

首次启动会自动创建 `data/avatar.sqlite` 并建表，无需手动初始化。

> 本项目**零依赖**：不需要 `npm install`。
> `runtime/` 目录仅为本机存档的 Node 二进制，已在 `.gitignore` 中忽略，克隆后请使用系统自带的 Node。

---

## 页面结构

```
左侧固定导航（264px）
├─ 品牌头        Avatar Studio / Open Music Club
├─ Styling
│   ├─ 换装工坊   手动搭配
│   ├─ 自动换装   预设摇号
│   └─ 照片定制   照片生成形象
├─ Library
│   └─ 我的形象   形象库（SQLite）
└─ 底部状态      DB 连接状态 · 驱动版本

右侧主区域
├─ 页头（标题 + 副标题 + 保存形象按钮）
├─ 视图容器（四选一，hash 路由 #/manual #/auto #/photo #/saved）
└─ 页脚
```

设计语言沿用 open-music-club：暖米奶油底 `#ECE5DA`、莫兰迪低饱和配色、DM Serif Display 衬线标题 + Inter 正文、点状纸纹、底部固定播放条。

---

## 文件说明

### 运行必需（4 + 1 后端）

| 文件 | 作用 |
| --- | --- |
| `index.html` | 页面骨架：侧栏导航 + 四视图 + 弹窗 + Toast |
| `style.css` | 全部样式（含侧栏、视图、响应式断点 1240 / 1080 / 760） |
| `app.js` | 调色板、6 类部件字符画定义、装饰层、SVG 渲染器、手动换装逻辑 |
| `photo.js` | 照片定制引擎：色彩聚类、风格判读、候选生成 |
| `views.js` | 视图路由、自动换装引擎、保存形象、形象库 CRUD、离线降级 |
| `serve.js` | 静态服务 + REST API + SQLite 数据层 |

### 校验 / 测试

| 文件 | 作用 |
| --- | --- |
| `verify.js` | 部件字符画权威校验（行宽 / 游程展开 / 调色板） |
| `fine_check.js` | 渲染器校验（一格一色矩形数、孤立像素、3×3 同色块） |
| `decor_check.js` | 装饰层校验（音符 / 琴键 / 频谱等元素齐备） |
| `test-photo-logic.js` | 照片定制 32 用例（vm 沙箱，无需浏览器） |
| `test-views-logic.js` | 视图 / 摇号 / 锁定 / 降级 26 用例 |
| `test-api-smoke.js` | API 冒烟（静态资源 + 全量 CRUD，需先启动服务） |
| `snapshot.js` / `dump_grid.js` | 多层合成灰度网格，用于肉眼核对对齐 |

```bash
npm test           # 前端逻辑四件套
node test-api-smoke.js   # 需另开终端先 node serve.js
```

---

## 数据库配置

全部集中在 `serve.js` 顶部：

```js
const DB_CONFIG = {
  dir:  path.join(ROOT, 'data'),   // 数据库目录
  file: 'avatar.sqlite',           // 库文件名
  table: 'avatar_outfits',         // 数据表名
};
```

改 `dir` 即可切换到外部磁盘或共享目录；改 `file` / `table` 可隔离多套数据。

表结构（`avatar_outfits`，19 列）：

```
id, name,
theme_id, theme_name, theme_primary, theme_dark, theme_light,
skin_id, hair_id,
body_id, head_id, top_id, bottom_id, shoes_id, accessory_id,
source (manual|auto|photo), is_current, thumb, created_at, updated_at
```

索引：`idx_outfits_current (is_current)`、`idx_outfits_created (created_at DESC)`。
`is_current` 全表唯一，`POST /api/outfits/:id/current` 会先清零再置位。

---

## REST API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 驱动 / 表名 / 库路径 / 记录数 |
| GET | `/api/outfits` | 形象列表（当前形象置顶） |
| POST | `/api/outfits` | 新建形象 |
| GET | `/api/outfits/:id` | 单条详情 |
| PATCH / PUT | `/api/outfits/:id` | 局部 / 全量更新 |
| DELETE | `/api/outfits/:id` | 删除 |
| GET | `/api/outfits/current` | 当前形象 |
| POST | `/api/outfits/:id/current` | 设为当前形象 |

服务不可达时前端自动降级到 `localStorage`（key `avatar-studio/outfits`），侧栏底部显示「离线模式」，恢复后重新拉取服务端数据。

---

## 渲染要点

- 画布 240×288，网格 **30×36**，每格 8×8 像素（`PX=8`）
- 部件格式 `{ id, label, w, h, ox, oy, lines: [str] }`，`lines` 用游程压缩（数字 + 字符），**因此 lines 内不能出现数字字符**
- 渲染顺序：音乐装饰层 → 体型 → 下装 → 鞋 → 上衣 → 发型 → 配饰
- 每个像素格渲染为**一个纯色实心矩形**，仅描边色 `#3F3A33` 走细线框（内缩 25%）
- 装饰层（五线谱 / 钢琴键 / 木吉他 / 均衡器 / 漂浮音符）用独立常量 `DPX=4`，与人物网格解耦

---

## 在仓库中的位置

本目录是上层仓库中的一个独立子项目：

```
信息系统设计/
├─ studio/    ← 本目录，可独立运行的前端成品
├─ backend/     omc 后端 avatar 模块（Node + Express 版）
├─ vendor/      第三方网易云音乐 API 存档
└─ runtime/     本机 Node 二进制（已 gitignore）
```

`node serve.js` 只依赖本目录内的 6 个运行文件与 `data/`，与其余三个目录无耦合。

---

## License

MIT
