# Open Music Club 上线部署包

> 目标：把 `kk0827-006X/open-music-club` 部署成可通过 HTTPS 访问的真实站点。
> 适用：Ubuntu 22.04 / 24.04（Debian 12 同样可用），单机部署。
> 生成日期：2026-10-27

---

## 一、先说清楚：哪些步骤必须由你完成

| 步骤 | 为什么我做不了 | 你需要的凭据 |
| --- | --- | --- |
| 1. 改 DNS A 记录 | 域名 `webkk.xyz` 的 NS 在 Cloudflare，改记录要登录你的账号 | Cloudflare 账号（或 API Token） |
| 2. 在服务器装 Node/Redis | 需要 SSH 登录那台机器 | 服务器 IP + SSH 账号/私钥 |
| 3. 签 TLS 证书 | 域名必须已指向该服务器、80 端口可达 | 依赖第 1、2 步完成 |
| 4. 开安全组 80/443 | 云厂商控制台权限 | 阿里云/Azure 控制台 |

**你把服务器 IP + SSH 凭据给我，并确认 DNS 由我来改（或你给我 Cloudflare Token），我可以直接执行第 1~4 步。**

---

## 二、部署拓扑（单机版，推荐课程项目使用）

```
        浏览器
          │  HTTPS :443
          ▼
     ┌─────────────┐
     │    Nginx    │  ① 签发/续期证书  ② 443 终结 TLS
     │             │  ③ 静态页直接吐 dist  ④ /api/ 反代到 Node
     └──────┬──────┘
            │ HTTP 127.0.0.1:3000（仅回环，公网不可达）
            ▼
     ┌─────────────┐        ┌──────────────┐
     │    Node     │◄──────►│    Redis     │  会话 + 限流
     │  (Express)  │        │ 127.0.0.1:6379│
     └──────┬──────┘        └──────────────┘
            │
     ┌──────▼──────┐
     │   SQLite    │  /srv/open-music-club/shared/data/
     │  + storage  │  /srv/open-music-club/shared/storage/
     └─────────────┘
```

对外只开 **80（ACME 校验 + 跳转）** 和 **443**；3000 与 6379 只监听回环。

## 三、通信协议清单（部署后实际使用）

| 协议 | 链路 | 端口 | 说明 |
| --- | --- | --- | --- |
| HTTPS (TLS 1.2/1.3) | 浏览器 → Nginx | 443 | 唯一公网入口，HSTS 可选 |
| HTTP | Nginx → Node | 127.0.0.1:3000 | 同机回环，不出网卡 |
| Redis 协议 | Node → Redis | 127.0.0.1:6379 | 会话与限流，设 requirepass |
| SMTP | Node → 邮件服务 | 465/587 | 可选，默认关闭 |
| DNS | 解析域名 | 53 | Cloudflare |
| ACME | certbot ↔ Let's Encrypt | 80/443 | 仅签发与续期时 |

本系统**没有** WebSocket / MQTT / gRPC / DTU / 串口 组件，全部是 HTTP 请求-响应。

## 四、上线顺序（照着做，顺序不能乱）

```bash
# 0. 把本目录整个传到服务器
scp -r deploy/ root@你的服务器IP:/tmp/omc-deploy/

# 1. 装运行时（Node 22 官方包 + pnpm + Redis + Nginx + certbot + ufw）
sudo bash /tmp/omc-deploy/01-install-runtime.sh

# 2. 拉代码、装依赖、构建前端、建目录与软链
sudo bash /tmp/omc-deploy/02-deploy-app.sh

# 3. 生成 .env（随机密钥、管理员密码都在这里）
sudo bash /tmp/omc-deploy/03-env.sh 你的域名

# 4. 加固 Redis（复用上一步生成的密码，顺序反了会连不上）
sudo bash /tmp/omc-deploy/04-redis.sh

# 5. 装 systemd + 初始化管理员 + 启动
sudo bash /tmp/omc-deploy/05-systemd.sh

# 6. 配 Nginx（HTTP 版，先验证站点通不通）
sudo bash /tmp/omc-deploy/06-nginx.sh 你的域名

# 7. 去 Cloudflare 加 A 记录（见 dns/DNS记录清单.md），等解析生效后签证书
sudo bash /tmp/omc-deploy/07-tls.sh 你的域名

# 8. 备份（可加 --install-cron 装每日任务）
sudo bash /tmp/omc-deploy/08-backup.sh --install-cron

# 9. 自动验收
sudo bash /tmp/omc-deploy/09-verify.sh https://你的域名
```

> **第 3 步必须在第 4 步之前**：`04-redis.sh` 会从 `.env` 里读取 `REDIS_PASSWORD` 写进 redis.conf。
> 顺序反了会出现「应用连不上 Redis」而日志只说认证失败的情况。

## 五、目录布局（部署后）

```
/srv/open-music-club/
├── releases/<git-sha>/     每次发布一份，含 node_modules 与 frontend/dist
├── current -> releases/...  systemd 的 WorkingDirectory
└── shared/
    ├── .env                 环境变量（600，omc 用户可读）
    ├── data/                SQLite 主库
    ├── storage/             music / covers / temp（用户上传，必须持久）
    ├── runtime-tmp/         网易云运行临时目录
    └── backups/             每日备份
```

> ⚠️ **关键坑**：项目里 `storageRoot` 默认是 `path.resolve('storage')`，即相对 **当前工作目录**。
> systemd 的 WorkingDirectory 指向 `current`，如果不做软链，上传的音乐会写进 release 目录，**下次发布就丢**。
> `02-deploy-app.sh` 会自动创建 `current/storage -> ../shared/storage` 软链，请不要删。

---

## 六、常见失败与排查

| 现象 | 原因 | 排查 |
| --- | --- | --- |
| 502 Bad Gateway | Node 没起来 | `systemctl status omc` / `journalctl -u omc -n 100` |
| 413 Request Entity Too Large | Nginx 上传限制 | 确认 `client_max_body_size 110m` |
| 登录后立刻掉线 | Cookie 不落盘 / Redis 不通 | 检查 `REDIS_URL`、`secure` Cookie 与 HTTPS |
| 上传成功但重启后文件没了 | storage 没做软链 | `ls -l /srv/open-music-club/current/storage` |
| 证书签发失败 | DNS 未生效或 80 被墙 | `dig +short 域名`，安全组放行 80 |
| `SQLITE_BUSY` | 多进程同时写 | 只跑单实例，勿开多 worker |

---

## 七、本目录文件说明

| 文件 | 作用 |
| --- | --- |
| `01-install-runtime.sh` | 装 Node 22、pnpm、Redis、Nginx、certbot、ufw |
| `02-deploy-app.sh` | 拉代码、装依赖、构建前端、建目录与软链、设权限 |
| `03-env.sh` | 生成 `.env`（随机 SESSION_SECRET / TOTP 密钥 / Redis 密码 / 管理员密码） |
| `04-redis.sh` | Redis 只监听回环 + 密码 + AOF |
| `05-systemd.sh` | 安装 `omc.service`、初始化管理员、启动 |
| `06-nginx.sh` | 安装 HTTP 站点配置（签证书前验证用） |
| `07-tls.sh` | certbot 签发 + 自动续期 + 切换 HTTPS 配置 |
| `08-backup.sh` | SQLite 一致性备份 + storage 同步，可装 cron |
| `09-verify.sh` | 自动验收：服务、端口暴露面、TLS、首页、静态资源、软链 |
| `nginx/omc-http.conf` | 纯 HTTP 站点（签证书前用） |
| `nginx/omc-https.conf` | 最终 HTTPS 站点（证书签发后用） |
| `nginx/Caddyfile` | 用 Caddy 替代 Nginx 的方案（自动证书） |
| `env/.env.production.example` | 生产环境变量模板（逐项注释） |
| `dns/DNS记录清单.md` | Cloudflare/A 记录怎么填、怎么验证 |
| `双机方案-WireGuard.md` | 若采用「海外入口 + 国内后端」的进阶方案 |
