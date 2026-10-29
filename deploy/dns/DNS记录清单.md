# DNS 记录配置清单

> 当前实测（2026-10-27）：`webkk.xyz` 的 NS 指向 Cloudflare，**A / AAAA 记录均为空**，
> `www.webkk.xyz` 不存在。也就是说域名目前解析不到任何服务器。

## 一、需要添加的记录

| 类型 | 名称 | 值 | TTL | 代理状态 |
| --- | --- | --- | --- | --- |
| A | `@`（即 webkk.xyz） | **你的服务器公网 IP** | Auto (300) | **仅 DNS（灰云）** |
| AAAA | — | 暂不添加 | — | — |
| CNAME | `www` | 暂不添加 | — | — |

**为什么必须是灰云**：橙云（Cloudflare 代理）会改变真实客户端 IP、拦截 ACME 校验、
并让 `TRUST_PROXY_HOPS=1` 的假设失效。首轮上线务必用灰云，等证书与整条链路稳定后再评估。

## 二、Cloudflare 操作路径

1. 登录 https://dash.cloudflare.com
2. 选择 `webkk.xyz`
3. 左侧 **DNS → Records → Add record**
4. Type 选 `A`，Name 填 `@`，IPv4 address 填服务器 IP，Proxy status 选 **DNS only**
5. Save

## 三、验证解析

```bash
# Linux 服务器
dig +short webkk.xyz A
getent hosts webkk.xyz

# Windows
nslookup webkk.xyz 8.8.8.8
```

返回你填的 IP 即为生效。Cloudflare 通常 1~5 分钟，最长不超过 TTL。

## 四、常见问题

| 现象 | 原因 |
| --- | --- |
| 解析到 `104.x.x.x` / `172.6x.x.x` | 开了橙云，改成 DNS only |
| `dig` 无输出 | 记录没保存，或 NS 还没生效 |
| 解析对了但打不开 | 安全组没放 80/443，或 Nginx 没起来 |
| certbot 报 challenge 失败 | 橙云拦截，或 80 端口被防火墙拦 |

## 五、安全组 / 防火墙放行清单

| 端口 | 协议 | 来源 | 用途 |
| --- | --- | --- | --- |
| 22 | TCP | 仅你的管理 IP | SSH |
| 80 | TCP | 0.0.0.0/0 | ACME 校验 + 跳转 HTTPS |
| 443 | TCP | 0.0.0.0/0 | 业务 |
| 3000 | — | **不开放** | 仅 Node 本机监听 |
| 6379 | — | **不开放** | 仅 Redis 回环监听 |

## 六、中国内地服务器的合规提醒

若服务器在中国内地，通过域名提供网站服务通常需要 **ICP 备案**。
仓库自带的部署文档明确写道：不能将「境外入口 + 境内后端」定性为已绕开备案，
上线前应向云厂商确认。这一点是合规问题，技术手段无法替代。
