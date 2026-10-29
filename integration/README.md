# 换装工坊并入主站 —— 改动说明

把 `zyr-open-music-club`（像素音乐小人穿搭编辑器）并进主站 `open-music-club`
的「用户 → 我的」板块，侧栏新增一个 **换装工坊 / AVATAR STUDIO** 入口，点击跳转到编辑器。

## 一、整体方案

```
主站前台 React (5174/443)
  └─ 用户页侧栏 ──[换装工坊]──►  /avatar/          ← 静态子站（studio 的 5 个文件）
                                    │
                                    └─ fetch /avatar-api/*  ← 同源代理
                                            │
                                     Avatar 子站服务 (8123)  ← studio/serve.js
                                            │
                                     studio/data/avatar.sqlite
```

**为什么这么接**：`studio` 是独立小站，自带 `serve.js`（Node 原生 http + `node:sqlite`），
和主站的 Express + better-sqlite3 是两套技术栈。硬改成 React 组件成本高、风险大，
所以用「挂子路径 + 独立进程 + 同源代理」的方式并入：主站只加一个按钮，
编辑器保持原来能跑的状态，两边数据互不干扰。

**为什么接口要改名前缀**：studio 前端原本请求 `/api/*`，会和主站 `/api/*` 撞车，
所以复制到主站时把它改成 `/avatar-api/*`，由代理转发到子站真正的 `/api/*`。

## 二、改了哪些文件

| 文件 | 改动 |
| --- | --- |
| `frontend/public/avatar/`（新增） | 复制 studio 的 `index.html`、`style.css`、`app.js`、`photo.js`、`views.js`、`README.md` |
| `frontend/public/avatar/views.js` | 第 200 行 `fetch('/api' + path` → `fetch('/avatar-api' + path` |
| `frontend/src/features/user/UserPage.tsx` | 侧栏 `LineSidebar` 之后插入「换装工坊」按钮 |
| `frontend/src/styles/user.css` | 追加 `.user-avatar-entry` 样式 |
| `boot-local.js`（本地演示用） | 增加 `/avatar-api/*` → `127.0.0.1:8123/api/*` 代理 |

生产环境对应的是 nginx 的两条 location，而不是 `boot-local.js`（见第六节）。

## 三、一键应用到你的仓库

在 PowerShell 里：

```powershell
cd D:\桌面文件夹\信管数据包\信息系统设计\integration
powershell -ExecutionPolicy Bypass -File .\apply-to-repo.ps1 -RepoPath "你的 open-music-club 仓库路径"
```

脚本会做四件事：
1. 把 `studio/` 的 6 个运行文件复制到 `frontend/public/avatar/`
2. 改写 `views.js` 的接口前缀
3. 在 `UserPage.tsx` 插入入口按钮（已存在则跳过）
4. 向 `user.css` 追加样式（已存在则跳过）

执行完 `cd frontend && npm run build`（或 `pnpm build:web`）即可。

## 四、本地验证结果（2026-10-28 实测）

| 检查项 | 结果 |
| --- | --- |
| `/avatar/` 静态页 | 200，14260 字节 |
| `/avatar/style.css`、`app.js`、`views.js` | 200，43522 / 42738 / 31167 字节 |
| `/avatar-api/health` | 200 `{"ok":true,"driver":"node:sqlite",...,"count":2}` |
| `/avatar-api/outfits` | 200，返回 2 套真实装扮 |
| 主站 `/health` | 200，未受影响 |
| 用户页入口按钮 | 存在（`[data-user-avatar-entry]`） |
| 点击跳转 | → `/avatar/#/manual`，标题 `Avatar Studio · Open Music Club` |

## 五、当前限制（答辩可能被问）

1. **形象库是全站共享的**：`studio` 的 `avatar_outfits` 表没有 `user_id`，
   所有用户看到同一批形象。要按用户隔离，需要给表加 `user_id` 字段，
   并在 `serve.js` 的接口里按登录用户过滤。
2. **子站接口没有鉴权**：`/avatar-api/*` 任何人可直接访问。
   生产环境应把 `location /avatar-api/` 也放进 `requireLogin` 保护范围，
   或在 nginx 层校验会话。
3. **两套数据库**：主站 `open-music-club.sqlite` 与子站 `avatar.sqlite` 独立，
   备份时要一起备份（见 `deploy/10-avatar-studio.sh`）。

## 六、部署到服务器（在上线脚本基础上加两步）

见 `deploy/10-avatar-studio.sh`：它会安装 `omc-avatar.service`（8123 端口），
并向 nginx 追加两条 location。要点：

```nginx
# 静态子站
location /avatar/ {
    alias /srv/open-music-club/current/frontend/dist/avatar/;
    try_files $uri $uri/ /avatar/index.html;
}
# 子站接口
location /avatar-api/ {
    proxy_pass http://127.0.0.1:8123/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

注意 `proxy_pass` 末尾的 `/api/` 会做路径替换：`/avatar-api/outfits` → `/api/outfits`。
