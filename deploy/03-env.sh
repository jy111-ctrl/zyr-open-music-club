#!/usr/bin/env bash
# 生成生产环境变量文件（必须在 04-redis.sh 之前执行）
# 用法: sudo bash 03-env.sh 你的域名
set -euo pipefail

DOMAIN="${1:?用法: bash 03-env.sh music.example.com}"
APP_ROOT="/srv/open-music-club"
ENV_FILE="${APP_ROOT}/shared/.env"

mkdir -p "${APP_ROOT}/shared/data" "${APP_ROOT}/shared/storage/music" \
         "${APP_ROOT}/shared/storage/covers" "${APP_ROOT}/shared/storage/temp" \
         "${APP_ROOT}/shared/runtime-tmp" "${APP_ROOT}/shared/backups"

if [ -f "${ENV_FILE}" ]; then
  cp "${ENV_FILE}" "${ENV_FILE}.bak.$(date +%s)"
  echo "已备份旧 .env"
fi

SESSION_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
TOTP_KEY="$(openssl rand -base64 32 | tr -d '\n')"
REDIS_PASSWORD="$(openssl rand -hex 24)"
ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-14)"

cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
PUBLIC_ORIGIN=https://${DOMAIN}
TRUST_PROXY_HOPS=1

SESSION_SECRET=${SESSION_SECRET}
SESSION_IDLE_TIMEOUT_MINUTES=480
TOTP_ENCRYPTION_KEY=${TOTP_KEY}

DATABASE_PATH=${APP_ROOT}/shared/data/open-music-club.sqlite
REDIS_URL=redis://:${REDIS_PASSWORD}@127.0.0.1:6379
REDIS_PASSWORD=${REDIS_PASSWORD}

REQUEST_TIMEOUT_MS=30000
HEADERS_TIMEOUT_MS=10000
KEEP_ALIVE_TIMEOUT_MS=5000

ADMIN_EMAIL=admin@${DOMAIN}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_NICKNAME=管理员

MAX_UPLOAD_MB=100

MAIL_ENABLED=false
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=club@${DOMAIN}
MAIL_ADMIN_TO=admin@${DOMAIN}
EOF

chmod 600 "${ENV_FILE}"
chown -R omc:omc "${APP_ROOT}/shared" 2>/dev/null || true

echo "已生成 ${ENV_FILE}"
echo
echo "  域名        : https://${DOMAIN}"
echo "  管理员邮箱  : admin@${DOMAIN}"
echo "  管理员密码  : ${ADMIN_PASSWORD}     <-- 只显示这一次，请保存"
echo
echo "下一步：sudo bash 04-redis.sh"
