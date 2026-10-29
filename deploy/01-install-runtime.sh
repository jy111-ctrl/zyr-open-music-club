#!/usr/bin/env bash
# 安装 Node 22 + pnpm + Redis + Nginx + certbot
# 用法: sudo bash 01-install-runtime.sh
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-22.23.4}"
NODE_DIR="/usr/local/lib/node-${NODE_VERSION}"

echo "==> 1/6 系统基础包"
apt-get update -y
apt-get install -y curl ca-certificates gnupg rsync sqlite3 ufw

echo "==> 2/6 Node.js ${NODE_VERSION}（官方二进制，避免 apt 版本过旧）"
if [ ! -x "${NODE_DIR}/bin/node" ]; then
  arch="$(uname -m)"
  case "$arch" in
    x86_64) node_arch="linux-x64" ;;
    aarch64|arm64) node_arch="linux-arm64" ;;
    *) echo "不支持的架构: $arch"; exit 1 ;;
  esac
  tmp="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${node_arch}.tar.xz" -o "${tmp}/node.tar.xz"
  mkdir -p "$(dirname "${NODE_DIR}")"
  tar -xJf "${tmp}/node.tar.xz" -C "${tmp}"
  mv "${tmp}/node-v${NODE_VERSION}-${node_arch}" "${NODE_DIR}"
  rm -rf "${tmp}"
fi
ln -sf "${NODE_DIR}/bin/node" /usr/local/bin/node
ln -sf "${NODE_DIR}/bin/npm"  /usr/local/bin/npm
ln -sf "${NODE_DIR}/bin/npx"  /usr/local/bin/npx
node -v

echo "==> 3/6 pnpm（corepack）"
corepack enable || true
corepack prepare pnpm@12.3.4 --activate || npm i -g pnpm@12.3.4
pnpm -v

echo "==> 4/6 Redis"
apt-get install -y redis-server

echo "==> 5/6 Nginx + certbot"
apt-get install -y nginx certbot python3-certbot-nginx

echo "==> 6/6 防火墙（只放 22/80/443；云安全组需另外放行）"
ufw allow 22/tcp   || true
ufw allow 80/tcp   || true
ufw allow 443/tcp  || true
ufw --force enable || true
ufw status || true

echo
echo "完成。下一步：sudo bash 02-deploy-app.sh"
