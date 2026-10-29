#!/usr/bin/env bash
# 部署应用：拉代码、装依赖、构建、建目录与软链
# 用法: sudo bash 02-deploy-app.sh [git仓库地址] [分支]
set -euo pipefail

REPO_URL="${1:-https://github.com/kk0827-006X/open-music-club.git}"
BRANCH="${2:-main}"
APP_ROOT="/srv/open-music-club"
APP_USER="omc"
RELEASE_DIR="${APP_ROOT}/releases/$(date +%Y%m%d-%H%M%S)"

echo "==> 1/7 创建运行用户 ${APP_USER}"
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "${APP_USER}"
fi

echo "==> 2/7 目录结构"
mkdir -p "${APP_ROOT}/releases" "${APP_ROOT}/shared/data" \
         "${APP_ROOT}/shared/storage/music" "${APP_ROOT}/shared/storage/covers" \
         "${APP_ROOT}/shared/storage/temp" "${APP_ROOT}/shared/runtime-tmp" \
         "${APP_ROOT}/shared/backups"

echo "==> 3/7 克隆 Release ${RELEASE_DIR}"
git clone --depth 1 --branch "${BRANCH}" --recurse-submodules "${REPO_URL}" "${RELEASE_DIR}"

echo "==> 4/7 安装依赖（含 vendor/api-enhanced 子模块）"
cd "${RELEASE_DIR}"
export PATH="/usr/local/bin:${PATH}"
pnpm install --frozen-lockfile

echo "==> 5/7 构建前端 → frontend/dist"
pnpm build:web

echo "==> 6/7 软链共享目录（关键：上传文件不能落在 release 里）"
# storageRoot 默认 = cwd/storage，因此必须软链到 shared，否则发布会丢用户文件
rm -rf "${RELEASE_DIR}/storage"
ln -sfn "${APP_ROOT}/shared/storage" "${RELEASE_DIR}/storage"
mkdir -p "${RELEASE_DIR}/data"
rm -rf "${RELEASE_DIR}/data"
ln -sfn "${APP_ROOT}/shared/data" "${RELEASE_DIR}/data"

echo "==> 7/7 切换 current 并设权限"
ln -sfn "${RELEASE_DIR}" "${APP_ROOT}/current"
chown -R "${APP_USER}:${APP_USER}" "${APP_ROOT}/shared"
chown -R root:root "${APP_ROOT}/releases"
chown -h "${APP_USER}:${APP_USER}" "${APP_ROOT}/current"

# nginx(www-data) 必须能穿过 releases 读到 frontend/dist，所以给 a+rX；
# shared 里有 .env 和用户文件，只给属主，保持 750。
chmod 755 "${APP_ROOT}" "${APP_ROOT}/releases" "${RELEASE_DIR}"
chmod -R a+rX "${RELEASE_DIR}"
chmod 750 "${APP_ROOT}/shared"
chmod 600 "${APP_ROOT}/shared/.env" 2>/dev/null || true

echo
echo "完成。当前版本："
readlink -f "${APP_ROOT}/current"
echo "下一步：sudo bash 03-redis-harden.sh"
