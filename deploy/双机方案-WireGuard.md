# 进阶：双机方案（海外入口 + 国内后端）

> 只有当**必须在境外提供 HTTPS 入口**时才需要这套。课程演示建议直接用单机版。

```
成员浏览器 ── HTTPS:443 ──► 海外机（Nginx + 前端 dist + 证书）
                                   │
                                   └── WireGuard UDP:51820 ──► 国内机（Express + Redis + SQLite + storage）
```

## 1. 海外机（只做入口）

只装 Nginx、certbot、wireguard-tools；**不装 Node、不跑数据库**。

```bash
apt-get install -y nginx certbot python3-certbot-nginx wireguard-tools
```

WireGuard 配置 `/etc/wireguard/wg0.conf`：

```ini
[Interface]
Address = 10.77.0.1/24
ListenPort = 51820
PrivateKey = <海外机私钥>

[Peer]
PublicKey = <国内机公钥>
AllowedIPs = 10.77.0.2/32
```

## 2. 国内机（跑完整业务）

```ini
[Interface]
Address = 10.77.0.2/24
PrivateKey = <国内机私钥>

[Peer]
PublicKey = <海外机公钥>
Endpoint = <海外机公网IP>:51820
AllowedIPs = 10.77.0.1/32
PersistentKeepalive = 25
```

Node 只绑定内网地址：

```bash
HOST=10.77.0.2
```

## 3. 海外机 Nginx 改法

```nginx
location /api/ {
    proxy_pass http://10.77.0.2:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

静态文件仍由海外机直接提供：

```nginx
root /srv/omc-dist;   # 只上传 frontend/dist，不上传源码与 .env
```

## 4. 必须注意的三点

1. **`TRUST_PROXY_HOPS=1`**：只有海外 Nginx 这一层 HTTP 代理；WireGuard 不算 HTTP 层。
2. **国内机安全组**：3000 只允许来源 `10.77.0.1`，不要对公网开放。
3. **前端与后端必须同一 SHA 发布**，禁止新 dist 配旧后端。
