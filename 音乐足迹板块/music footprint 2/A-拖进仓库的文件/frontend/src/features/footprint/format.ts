// 足迹里的时间是服务端写入的 UTC 文本（SQLite CURRENT_TIMESTAMP 保存的就是 UTC）。
// 直接 new Date('2026-10-20 00:30:00') 会被当成浏览器本地时间，上海时区下会把 UTC 00:30
// 显示成 00:30（正确应为 08:30），跨午夜的记录也会被分到错误的日期。
// 所以先补上 Z 按 UTC 解析，再按本地时区渲染，与后端按站点时区分组保持一致。
function toDate(value: string): Date | null {
  if (!value) return null
  const raw = String(value).trim().replace(' ', 'T')
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)
  const date = new Date(hasZone ? raw : `${raw}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function pad(value: number) { return String(value).padStart(2, '0') }

export function formatClock(value: string): string {
  const date = toDate(value)
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '—'
}

export function formatDate(value: string): string {
  const date = toDate(value)
  return date ? `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}` : '—'
}

export function dayKey(value: string): string {
  const date = toDate(value)
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '未知日期'
}

// 时光轴分组标题：今天 / 昨天 / 具体日期 + 星期。
export function dayLabel(value: string): string {
  const date = toDate(value)
  if (!date) return '未知日期'
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const yesterday = new Date(today.getTime() - 86_400_000)
  const yesterdayKey = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`
  const key = dayKey(value)
  if (key === todayKey) return '今天'
  if (key === yesterdayKey) return '昨天'
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${week}`
}

// 时长用中文单位，避免 "PT3H" 这类机器格式出现在界面上。
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(Number(ms) || 0))
  const minutes = Math.floor(total / 60000)
  const hours = Math.floor(minutes / 60)
  if (hours >= 10) return `${hours} 小时`
  if (hours >= 1) return `${hours} 小时 ${minutes % 60} 分钟`
  if (minutes >= 1) return `${minutes} 分钟`
  return `${Math.floor(total / 1000)} 秒`
}

export function formatTrackDuration(ms: number): string {
  const seconds = Math.max(0, Math.round((Number(ms) || 0) / 1000))
  return `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`
}

export function formatRelative(value: string): string {
  const date = toDate(value)
  if (!date) return '—'
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return formatDate(value)
}
