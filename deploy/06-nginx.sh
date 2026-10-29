#!/usr/bin/env bash
# 安装 HTTP 版站点（签证书前先验证）
# 用法: sudo bash 06-nginx.sh 你的域名
set -euo pipefail

DOMAIN="${1:?用法: bash 06-nginx.sh music.example.com}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="/etc/nginx/sites-available/omc.conf"
mkdir -p /var/www/html

sed "s/__DOMAIN__/${DOMAIN}/g" "${HERE}/nginx/omc-http.conf" > "${CONF}"
ln -sfn "${CONF}" /etc/nginx/sites-enabled/omc.conf
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

echo "==> 本机自测"
curl -sS -o /dev/null -w "http://127.0.0.1/health -> %{http_code}\n" -H "Host: ${DOMAIN}" http://127.0.0.1/health || true
curl -sS -o /dev/null -w "首页 -> %{http_code}\n" -H "Host: ${DOMAIN}" http://127.0.0.1/ || true

echo
echo "若返回 200，去把域名 A 记录指向本机公网 IP，然后跑：sudo bash 07-tls.sh ${DOMAIN}"
