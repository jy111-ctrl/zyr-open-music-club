#!/usr/bin/env bash
# 安装 Avatar Studio 子站服务（8123），并向 Nginx 追加 /avatar/ 与 /avatar-api/
# 用法: sudo bash 10-avatar-studio.sh 你的域名
# 前提: 已跑完 01~07（主站已在 3000 端口运行、Nginx 已配好 HTTPS）
set -euo pipefail

DOMAIN="${1:?用法: bash 10-avatar-studio.sh webkk.xyz}"
APP_ROOT="/srv/open-music-club"
CURRENT="${APP_ROOT}/current"
STUDIO_DIR="${CURRENT}/avatar-studio"
DATA_DIR="${APP_ROOT}/shared/avatar-data"
UNIT="/etc/systemd/system/omc-avatar.service"

echo "==> 1/4 准备代码与数据目录"
# 仓库里 studio 的源码放在 avatar-studio/（或从 zyr 仓库复制到该目录）
[ -d "${STUDIO_DIR}" ] || { echo "缺少 ${STUDIO_DIR}（请把 studio 的 index.html/style.css/app.js/photo.js/views.js/serve.js 放进去）"; exit 1; }
mkdir -p "${DATA_DIR}"
chown -R omc:omc "${DATA_DIR}"

# serve.js 默认把数据库放在自己目录的 data/ 下；这里软链到 shared，保证发布不丢
rm -rf "${STUDIO_DIR}/data"
ln -sfn "${DATA_DIR}" "${STUDIO_DIR}/data"
chown -h omc:omc "${STUDIO_DIR}/data"

echo "==> 2/4 安装 systemd 服务"
cat > "${UNIT}" <<EOF
[Unit]
Description=Open Music Club - Avatar Studio
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=omc
Group=omc
WorkingDirectory=${STUDIO_DIR}
ExecStart=/usr/local/bin/node ${STUDIO_DIR}/serve.js
Restart=always
RestartSec=3

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DATA_DIR}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable omc-avatar
systemctl restart omc-avatar
sleep 2
systemctl --no-pager --lines=10 status omc-avatar || true

echo "==> 3/4 验证子站"
curl -sS http://127.0.0.1:8123/api/health || echo "（子站未响应，看 journalctl -u omc-avatar）"

echo "==> 4/4 向 Nginx 追加两条 location"
CONF="/etc/nginx/sites-available/omc.conf"
if grep -q 'location /avatar/' "${CONF}"; then
  echo "    已存在，跳过"
else
  # 在最后一个 } 之前插入（简单粗暴但可用；建议人工核对 nginx -t）
  python3 - "$CONF" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
block = '''
    # ---- Avatar Studio 静态子站 ----
    location /avatar/ {
        alias /srv/open-music-club/current/frontend/dist/avatar/;
        try_files $uri $uri/ /avatar/index.html;
    }

    # ---- Avatar Studio 接口（/avatar-api/x -> 127.0.0.1:8123/api/x）----
    location /avatar-api/ {
        proxy_pass http://127.0.0.1:8123/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
'''
i = s.rfind('}')
open(p, 'w').write(s[:i] + block + s[i:])
PY
  nginx -t && systemctl reload nginx
fi

echo
echo "完成。访问 https://${DOMAIN}/avatar/ ，并在「用户」页点「换装工坊」应能跳过去。"
echo "别忘了把 avatar.sqlite 一起纳入备份：08-backup.sh 已包含 shared 目录。"
