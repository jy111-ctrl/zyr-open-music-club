# 信息系统设计 · 课程项目仓库

按功能把文件分成 4 个目录。其中 **`studio/` 是可以直接跑起来的成品**，`backend/` 是它的后端原型，`vendor/` 与 `runtime/` 属于外带资料。

```
信息系统设计/
├─ studio/    像素音乐小人穿搭编辑器（前端成品，可独立运行）
├─ backend/   omc 后端 avatar 模块（数据层 / 路由层 / 业务层）
├─ vendor/    第三方网易云音乐 API 存档
├─ runtime/   本机 Node 二进制（gitignore，不入库）
└─ .gitignore
```

---

## studio/ — 像素音乐小人穿搭编辑器 ⭐ 主成品

**作用**：可视化编辑像素音乐小人形象，四个栏目由左侧导航切换。

| 栏目 | 功能 |
| --- | --- |
| 换装工坊 | 手动搭配 6 个槽位（体型 / 发型 / 上衣 / 下装 / 鞋 / 配饰），8 套莫兰迪配色 |
| 自动换装 | 7 套风格预设一键摇号，支持锁定槽位、保持配色、最近 6 套回滚 |
| 照片定制 | 上传照片 → 提取组合色块 → 风格判读 → 生成 3 套专属候选 |
| 我的形象 | 形象库 CRUD，数据落在 SQLite |

**内部结构**

```
studio/
├─ index.html      页面骨架：侧栏导航 + 四视图 + 弹窗 + Toast
├─ style.css       全部样式（含响应式断点 1240 / 1080 / 760）
├─ app.js          调色板、6 类部件字符画、装饰层、SVG 渲染器
├─ photo.js        照片定制引擎：色彩聚类、风格判读、候选生成
├─ views.js        视图路由、自动换装引擎、保存形象、形象库
├─ serve.js        静态服务 + REST API + SQLite 数据层
├─ package.json    start / dev / verify / test / smoke
├─ README.md       详细文档（数据库配置、API、渲染要点）
├─ data/           SQLite 数据库（首次启动自动建表）
└─ tests/          8 个校验脚本
```

**运行**（需要 Node ≥ 22.5，用了内置 `node:sqlite`，零 npm 依赖）

```bash
cd studio
node serve.js
# 打开 http://127.0.0.1:8123/index.html
```

**tests/ 内 8 个脚本的分工**

| 脚本 | 校验对象 |
| --- | --- |
| `verify.js` | 部件字符画（行宽 / 游程展开 / 调色板） |
| `fine_check.js` | 渲染器（一格一色矩形数、孤立像素、同色块） |
| `decor_check.js` | 装饰层元素（五线谱 / 琴键 / 吉他 / 均衡器） |
| `test-photo-logic.js` | 照片定制 32 用例 |
| `test-views-logic.js` | 视图 / 摇号 / 锁定 / 离线降级 26 用例 |
| `test-api-smoke.js` | API 冒烟 20 用例（需先启动服务） |
| `snapshot.js` | 导出静态 SVG 快照，肉眼比对 |
| `dump_grid.js` | 合成 ASCII 灰度网格，核对部件对齐 |

---

## backend/ — omc 后端 avatar 模块

**作用**：`studio/` 的后端原型，把形象数据从浏览器搬到服务端，走 Node + Express + SQLite 的分层结构。目前 `studio/` 用的是自己内置的轻量 `serve.js`，本目录保留的是更完整的工程化版本，供后续接入 open-music-club 主站使用。

```
backend/
├─ src/            后端源码（当前版本，以此为准）
│   ├─ db/         数据访问层：avatar 表结构、CRUD、种子数据
│   ├─ routes/     路由层：HTTP API 定义与参数校验
│   └─ services/   业务层：部件组装、配色回落、搭配校验
├─ web/avatar/     配套的页面模板（index / style / app）
├─ tests/          后端单元测试 avatar.test.js
├─ snippets/       往主站接入时要用的补丁片段
│   ├─ database.js.avatar-schema.sql      建表 SQL
│   ├─ app.js.avatar-snippet.diff         路由注册补丁
│   └─ migrate-body-2026-09-28.js         体型字段迁移脚本
└─ legacy-src/     早期裁剪版留档（仅存档，不参与运行）
```

> `snippets/` 是给 open-music-club 主站用的：把 SQL 贴进 `database.js`、把 diff 贴进 `app.js` 的路由注册处即可接入。

---

## vendor/ — 第三方 API 存档

**作用**：`vendor/api-enhanced` 是网易云音乐第三方 API 服务的完整副本，用于课程演示中提供音乐数据接口（搜索、歌词、评论、歌单等）。

- 与 `studio/`、`backend/` **没有代码依赖**，属于外带资料
- 内含自己的 `node_modules/`，已被 `.gitignore` 忽略
- 若要单独运行，进入该目录按其自带说明启动（需自备 Node 环境）

---

## runtime/ — 本机运行时

**作用**：本机存档的 Node.js 二进制（`node.exe` + npm），用于在没有全局 Node 的机器上启动服务。

- 体积数十 MB，**已在 `.gitignore` 中排除**，不会上传 GitHub
- 克隆本仓库后请用系统自带的 Node（≥ 22.5）运行，无需此目录

---

## 上传 GitHub 前须知

| 目录 | 是否入库 | 原因 |
| --- | --- | --- |
| `studio/` | ✅ 入库 | 主成品 |
| `backend/` | ✅ 入库 | 后端源码 |
| `vendor/` | ⚠️ 按需 | 第三方代码，若只想展示自己作品可不传 |
| `runtime/` | ❌ 已排除 | 二进制，体积大 |
| `studio/data/*.sqlite-wal` | ❌ 已排除 | SQLite 运行时副产物，主库 `avatar.sqlite` 保留 |

建议的首次提交：

```bash
git init
git add .
git status        # 确认没有 runtime/ 与 node_modules/ 被选中
git commit -m "feat: 像素音乐小人穿搭编辑器 + omc 后端 avatar 模块"
```
