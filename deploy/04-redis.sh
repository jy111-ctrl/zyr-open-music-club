#!/usr/bin/env bash
# Redis 加固：只监听回环 + 密码（复用 03-env.sh 生成的那个）+ AOF
# 用法: sudo bash 04-redis.sh
# 注意：必须先跑 03-env.sh，否则密码对不上，应用会连不上 Redis
set -euo pipefail

CONF="/etc/redis/redis.conf"
ENV_FILE="/srv/open-music-club/shared/.env"

[ -f "${CONF}" ] || { echo "找不到 ${CONF}"; exit 1; }
[ -f "${ENV_FILE}" ] || { echo "缺少 ${ENV_FILE}，请先运行 03-env.sh 你的域名"; exit 1; }

REDIS_PASSWORD="$(grep '^REDIS_PASSWORD=' "${ENV_FILE}" | cut -d= -f2- | tr -d '\r')"
[ -n "${REDIS_PASSWORD}" ] || { echo "${ENV_FILE} 里没有 REDIS_PASSWORD"; exit 1; }

cp "${CONF}" "${CONF}.bak.$(date +%s)"

sed -i -E 's/^#?\s*bind .*/bind 127.0.0.1 ::1/' "${CONF}"
sed -i -E 's/^#?\s*protected-mode .*/protected-mode yes/' "${CONF}"
sed -i -E 's/^#?\s*appendonly .*/appendonly yes/' "${CONF}"
sed -i -E 's/^#?\s*maxmemory .*/maxmemory 256mb/' "${CONF}"
sed -i -E 's/^#?\s*maxmemory-policy .*/maxmemory-policy allkeys-lru/' "${CONF}"

if grep -q '^requirepass ' "${CONF}"; then
  sed -i -E "s/^requirepass .*/requirepass ${REDIS_PASSWORD}/" "${CONF}"
else
  echo "requirepass ${REDIS_PASSWORD}" >> "${CONF}"
fi

systemctl restart redis-server
systemctl enable redis-server

echo "==> 未认证应该被拒绝（会看到 NOAUTH）"
redis-cli ping 2>&1 | head -2 || true
echo "==> 认证后应返回 PONG"
redis-cli -a "${REDIS_PASSWORD}" --no-auth-warning ping

echo
echo "Redis 已加固：仅回环 + requirepass + AOF"
