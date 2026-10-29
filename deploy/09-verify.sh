#!/usr/bin/env bash
# 上线自动验收
# 用法: sudo bash 09-verify.sh https://你的域名
set -uo pipefail

BASE="${1:?用法: bash 09-verify.sh https://music.example.com}"
BASE="${BASE%/}"
pass=0; fail=0
ok(){ echo "  [PASS] $1"; pass=$((pass+1)); }
no(){ echo "  [FAIL] $1"; fail=$((fail+1)); }

echo "== 1. 服务状态 =="
systemctl is-active --quiet omc && ok "omc.service 运行中" || no "omc.service 未运行"
systemctl is-active --quiet redis-server && ok "redis 运行中" || no "redis 未运行"
systemctl is-active --quiet nginx && ok "nginx 运行中" || no "nginx 未运行"

echo "== 2. 端口暴露面（3000/6379 不应出现在公网） =="
ss -lntp 2>/dev/null | grep -E ':(3000|6379)\b' | grep -v '127.0.0.1' | grep -v '\[::1\]' && no "3000/6379 对外监听" || ok "3000/6379 仅回环"

echo "== 3. HTTPS 与 TLS =="
code=$(curl -sS -o /dev/null -w '%{http_code}' "${BASE}/health" || echo 000)
[ "$code" = "200" ] && ok "/health 返回 200" || no "/health 返回 ${code}"
body=$(curl -sS "${BASE}/health" || true)
echo "     $body"
echo | openssl s_client -connect "${BASE#https://}:443" -servername "${BASE#https://}" 2>/dev/null | grep -q 'Verify return code: 0' \
  && ok "证书链校验通过" || no "证书链异常"

echo "== 4. HTTP 应跳转到 HTTPS =="
redir=$(curl -sS -o /dev/null -w '%{http_code}' "http://${BASE#https://}/" || echo 000)
{ [ "$redir" = "301" ] || [ "$redir" = "308" ]; } && ok "HTTP 跳转 (${redir})" || no "HTTP 未跳转 (${redir})"

echo "== 5. 首页与静态资源 =="
html=$(curl -sS "${BASE}/" || true)
echo "$html" | grep -qi '<div id="root"' && ok "首页 HTML 正常" || no "首页内容异常"
asset=$(echo "$html" | grep -o '/assets/[^"]*\.js' | head -1 || true)
if [ -n "$asset" ]; then
  acode=$(curl -sS -o /dev/null -w '%{http_code}' "${BASE}${asset}")
  [ "$acode" = "200" ] && ok "静态资源 ${asset} 200" || no "静态资源 ${acode}"
fi

echo "== 6. 上传限制（Nginx 需 ≥ 100MB） =="
hdr=$(curl -sS -I "${BASE}/api/auth/me" 2>/dev/null | head -1 || true)
echo "     $hdr"

echo "== 7. 数据库与目录 =="
[ -f /srv/open-music-club/shared/data/open-music-club.sqlite ] && ok "SQLite 已创建" || no "SQLite 不存在"
[ -L /srv/open-music-club/current/storage ] && ok "storage 软链到位" || no "storage 未软链（发布会丢文件）"

echo
echo "结果：通过 ${pass} 项，失败 ${fail} 项"
[ "${fail}" -eq 0 ] || exit 1
