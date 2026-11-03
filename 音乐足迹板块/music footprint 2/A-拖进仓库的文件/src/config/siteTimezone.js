// 站点时区：数据库里的时间列保存的是 UTC，展示与“按天/按小时”统计都要换算到站点时区。
// 默认 UTC+8（北京时间），可用 SITE_TIMEZONE_OFFSET_MINUTES 覆盖，例如 -300 表示 UTC-5。
const DEFAULT_SITE_TIMEZONE_OFFSET_MINUTES = 480

function readTimezoneOffsetMinutes(env = process.env) {
  const raw = env.SITE_TIMEZONE_OFFSET_MINUTES
  if (raw === undefined || String(raw).trim() === '') return DEFAULT_SITE_TIMEZONE_OFFSET_MINUTES
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < -1440 || value > 1440) {
    return DEFAULT_SITE_TIMEZONE_OFFSET_MINUTES
  }
  return value
}

module.exports = {
  DEFAULT_SITE_TIMEZONE_OFFSET_MINUTES,
  readTimezoneOffsetMinutes,
}
