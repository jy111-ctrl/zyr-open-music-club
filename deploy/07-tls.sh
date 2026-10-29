#!/usr/bin/env bash
# 签发证书并切换到 HTTPS 配置
# 用法: sudo bash 07-tls.sh 你的域名
set -euo pipefail

DOMAIN="${1:?用法: bash 07-tls.sh music.example.com}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMAIL="${CERT_EMAIL:-admin@${DOMAIN}}"

echo "==> 1/4 检查 DNS 是否已指向本机"
SERVER_IP="$(curl -sS --max-time 10 https://api.ipify.org || true)"
RESOLVED="$(getent hosts "${DOMAIN}" | awk '{print $1}' | head -1 || true)"
echo "  域名解析: ${RESOLVED:-<无>}"
echo "  本机公网: ${SERVER_IP:-<未知>}"
if [ -n "${RESOLVED}" ] && [ -n "${SERVER_IP}" ] && [ "${RESOLVED}" != "${SERVER_IP}" ]; then
  echo "  ⚠️ 解析与本机公网 IP 不一致。若使用 Cloudflare 橙云代理，请先改为「仅 DNS」(灰云)。"
  echo "  仍要继续可加 FORCE=1 重跑。"
  [ "${FORCE:-0}" = "1" ] || exit 1
fi

echo "==> 2/4 申请证书"
certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect

echo "==> 3/4 换成 HTTPS 站点配置（含 HSTS / 上传大小 / 超时）"
sed "s/__DOMAIN__/${DOMAIN}/g" "${HERE}/nginx/omc-https.conf" > /etc/nginx/sites-available/omc.conf
nginx -t
systemctl reload nginx

echo "==> 4/4 校验续期"
systemctl list-timers | grep -i certbot || true
certbot renew --dry-run

echo
echo "完成：https://${DOMAIN}"
echo "下一步：sudo bash 09-verify.sh https://${DOMAIN}"
