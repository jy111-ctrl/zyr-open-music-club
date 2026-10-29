#!/usr/bin/env bash
# 安装 systemd 服务、初始化管理员、启动
# 用法: sudo bash 05-systemd.sh
set -euo pipefail

APP_ROOT="/srv/open-music-club"
ENV_FILE="${APP_ROOT}/shared/.env"
UNIT="/etc/systemd/system/omc.service"

[ -x /usr/local/bin/node ] || { echo "找不到 node，请先跑 01-install-runtime.sh"; exit 1; }
[ -f "${ENV_FILE}" ] || { echo "缺少 .env，请先跑 03-env.sh"; exit 1; }

cat > "${UNIT}" <<'EOF'
[Unit]
Description=Open Music Club
After=network-online.target redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=omc
Group=omc
WorkingDirectory=/srv/open-music-club/current
EnvironmentFile=/srv/open-music-club/shared/.env
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/node src/server.js
Restart=always
RestartSec=3
StartLimitBurst=5
StartLimitIntervalSec=60

NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictRealtime=true
LockPersonality=true
ReadWritePaths=/srv/open-music-club/shared

StandardOutput=journal
StandardError=journal
SyslogIdentifier=omc

[Install]
WantedBy=multi-user.target
EOF

echo "==> 1/3 初始化数据库与首个管理员"
cd "${APP_ROOT}/current"
set -a; . "${ENV_FILE}"; set +a
runuser -u omc -- /usr/local/bin/node src/db/init.js || true

echo "==> 2/3 启用服务"
systemctl daemon-reload
systemctl enable omc
systemctl restart omc

echo "==> 3/3 状态"
sleep 3
systemctl --no-pager --lines=20 status omc || true
echo
echo "若出现 '已启动' 即成功；失败看 journalctl -u omc -n 100 --no-pager"
echo "下一步：sudo bash 06-nginx.sh 你的域名"
