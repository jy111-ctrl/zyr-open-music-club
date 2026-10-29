#!/usr/bin/env bash
# SQLite 一致性备份 + storage 同步
# 用法: sudo bash 08-backup.sh            执行一次
#       sudo bash 08-backup.sh --install-cron  安装每天 03:30 的定时任务
set -euo pipefail

APP_ROOT="/srv/open-music-club"
DB="${APP_ROOT}/shared/data/open-music-club.sqlite"
DEST="${APP_ROOT}/shared/backups"
KEEP_DAYS="${KEEP_DAYS:-14}"

if [ "${1:-}" = "--install-cron" ]; then
  cat > /etc/cron.d/omc-backup <<EOF
30 3 * * * root KEEP_DAYS=${KEEP_DAYS} bash $(readlink -f "$0") >> /var/log/omc-backup.log 2>&1
EOF
  chmod 644 /etc/cron.d/omc-backup
  echo "已安装 /etc/cron.d/omc-backup（每天 03:30）"
  exit 0
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "${DEST}"

# WAL 模式下不能直接 cp，必须用 sqlite3 的在线备份
if [ -f "${DB}" ]; then
  sqlite3 "${DB}" ".backup '${DEST}/db-${STAMP}.sqlite'"
  echo "数据库备份: ${DEST}/db-${STAMP}.sqlite ($(du -h "${DEST}/db-${STAMP}.sqlite" | cut -f1))"
else
  echo "跳过：数据库尚不存在（${DB}）"
fi

# 上传文件增量同步
if command -v rsync >/dev/null; then
  rsync -a --delete "${APP_ROOT}/shared/storage/" "${DEST}/storage/"
  echo "storage 已同步到 ${DEST}/storage"
fi

# 保留最近 N 天
find "${DEST}" -maxdepth 1 -name 'db-*.sqlite' -mtime "+${KEEP_DAYS}" -delete
find "${DEST}" -maxdepth 1 -name '*.env' -mtime "+${KEEP_DAYS}" -delete

# 恢复演练提示
echo
echo "恢复方法："
echo "  systemctl stop omc"
echo "  cp ${DEST}/db-<时间戳>.sqlite ${DB}"
echo "  systemctl start omc"
