# 把换装工坊并入 open-music-club 仓库
# 用法: powershell -ExecutionPolicy Bypass -File .\apply-to-repo.ps1 -RepoPath "D:\path\to\open-music-club"
param(
  [Parameter(Mandatory = $true)][string]$RepoPath,
  [string]$StudioSource = "D:\桌面文件夹\信管数据包\信息系统设计\studio"
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path (Join-Path $RepoPath 'package.json'))) {
  throw "RepoPath 不像是 open-music-club 仓库：$RepoPath"
}

Write-Host "==> 1/4 复制 studio 静态资源到 frontend/public/avatar"
$avatarDir = Join-Path $RepoPath 'frontend\public\avatar'
New-Item -ItemType Directory -Force -Path $avatarDir | Out-Null
foreach ($f in 'index.html', 'style.css', 'app.js', 'photo.js', 'views.js', 'README.md') {
  $src = Join-Path $StudioSource $f
  if (-not (Test-Path $src)) { throw "缺少源文件: $src" }
  Copy-Item $src (Join-Path $avatarDir $f) -Force
  Write-Host "    copied $f"
}

Write-Host "==> 2/4 改写接口前缀 /api -> /avatar-api"
$views = Join-Path $avatarDir 'views.js'
$text = Get-Content $views -Raw
if ($text -match "/avatar-api") {
  Write-Host "    已改过，跳过"
} else {
  $text = $text.Replace("fetch('/api' + path", "fetch('/avatar-api' + path")
  Set-Content -Path $views -Value $text -NoNewline -Encoding UTF8
  Write-Host "    views.js 已改写"
}

Write-Host "==> 3/4 在 UserPage.tsx 插入入口按钮"
$userPage = Join-Path $RepoPath 'frontend\src\features\user\UserPage.tsx'
if (-not (Test-Path $userPage)) { throw "找不到 $userPage" }
$page = Get-Content $userPage -Raw
if ($page -match 'data-user-avatar-entry') {
  Write-Host "    已存在，跳过"
} else {
  $anchor = "          onItemClick={index => changeSection(sections[index].id)} />`n        <p className=""user-sidebar-foot"">"
  if (-not $page.Contains($anchor)) {
    throw "锚点文本不匹配，请手动插入 user-page-snippet.tsx 的内容（放在 LineSidebar 之后、user-sidebar-foot 之前）"
  }
  $snippet = Get-Content (Join-Path $here 'user-page-snippet.tsx') -Raw
  $page = $page.Replace($anchor, "          onItemClick={index => changeSection(sections[index].id)} />`n" + $snippet + "        <p className=""user-sidebar-foot"">")
  Set-Content -Path $userPage -Value $page -NoNewline -Encoding UTF8
  Write-Host "    UserPage.tsx 已插入"
}

Write-Host "==> 4/4 追加样式"
$css = Join-Path $RepoPath 'frontend\src\styles\user.css'
$cssText = if (Test-Path $css) { Get-Content $css -Raw } else { "" }
if ($cssText -match '\.user-avatar-entry') {
  Write-Host "    样式已存在，跳过"
} else {
  Add-Content -Path $css -Value (Get-Content (Join-Path $here 'user.css.snippet.css') -Raw) -Encoding UTF8
  Write-Host "    user.css 已追加"
}

Write-Host ""
Write-Host "完成。下一步："
Write-Host "  cd `"$RepoPath\frontend`""
Write-Host "  npm run build    # 或 pnpm build"
Write-Host ""
Write-Host "本地调试还需要启动 avatar 子站服务："
Write-Host "  node `"$StudioSource\serve.js`"     # 监听 127.0.0.1:8123"
Write-Host "并把 /avatar-api -> 127.0.0.1:8123/api 反向代理到主站（见 README 第六节）"
