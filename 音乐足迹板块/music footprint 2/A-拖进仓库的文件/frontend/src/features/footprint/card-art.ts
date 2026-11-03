import type { MemoryCard } from "../../services/music/footprint.ts"
import { formatDate, formatDuration } from "./format.ts"

// 回忆卡片用纯 SVG 绘制：既能直接显示在页面上，也能原样下载成图片文件，
// 不依赖 canvas 或任何新的第三方库。
const WIDTH = 480
const HEIGHT = 660

function escapeXml(value: string): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character] as string)
}

function clip(value: string, length: number): string {
  const text = String(value ?? '')
  return text.length > length ? `${text.slice(0, length)}…` : text
}

export function createCardSvg(card: Pick<MemoryCard, 'title' | 'data'>, nickname = ''): string {
  const data = card.data
  const tracks = data.tracks.slice(0, 6)
  const notes = data.notes.slice(0, 2)
  let cursor = 188
  const trackRows = tracks.map((track, index) => {
    const y = cursor
    cursor += 46
    return `<text x="44" y="${y}" fill="#8a7a63" font-size="13" font-family="Helvetica, Arial, sans-serif">${String(index + 1).padStart(2, '0')}</text>
      <text x="78" y="${y}" fill="#24231d" font-size="15" font-family="Helvetica, Arial, sans-serif">${escapeXml(clip(track.title, 18))}</text>
      <text x="78" y="${y + 18}" fill="#8a7a63" font-size="12" font-family="Helvetica, Arial, sans-serif">${escapeXml(clip(track.artist, 24))}</text>`
  }).join('\n      ')
  const noteRows = notes.map((note) => {
    cursor += 16
    const y = cursor
    cursor += 34
    return `<text x="44" y="${y}" fill="#6d5f4b" font-size="12.5" font-family="Georgia, 'Songti SC', serif">「${escapeXml(clip(note.content, 34))}」</text>`
  }).join('\n      ')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="音乐足迹回忆卡片">
  <defs>
    <linearGradient id="omc-card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f6efe2"/>
      <stop offset="55%" stop-color="#efe4cf"/>
      <stop offset="100%" stop-color="#e3d3b7"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" rx="18" fill="url(#omc-card)"/>
  <rect x="16" y="16" width="${WIDTH - 32}" height="${HEIGHT - 32}" rx="12" fill="none" stroke="#b77922" stroke-opacity=".38"/>
  <text x="44" y="62" fill="#b77922" font-size="11" letter-spacing="4" font-family="Helvetica, Arial, sans-serif">MUSIC FOOTPRINT</text>
  <text x="44" y="104" fill="#24231d" font-size="27" font-weight="700" font-family="Helvetica, Arial, sans-serif">${escapeXml(clip(card.title, 16))}</text>
  <text x="44" y="132" fill="#8a7a63" font-size="13" font-family="Helvetica, Arial, sans-serif">${formatDate(data.period.from)} — ${formatDate(data.period.to)}</text>
  <line x1="44" y1="152" x2="${WIDTH - 44}" y2="152" stroke="#b77922" stroke-opacity=".28"/>
  <text x="44" y="180" fill="#8a7a63" font-size="11" letter-spacing="2" font-family="Helvetica, Arial, sans-serif">SELECTED TRACKS / ${data.trackCount} 段声音</text>
  ${trackRows}
  ${noteRows}
  <line x1="44" y1="${HEIGHT - 108}" x2="${WIDTH - 44}" y2="${HEIGHT - 108}" stroke="#b77922" stroke-opacity=".28"/>
  <text x="44" y="${HEIGHT - 80}" fill="#24231d" font-size="30" font-weight="700" font-family="Helvetica, Arial, sans-serif">${data.trackCount}</text>
  <text x="44" y="${HEIGHT - 62}" fill="#8a7a63" font-size="11" font-family="Helvetica, Arial, sans-serif">次播放记录</text>
  <text x="190" y="${HEIGHT - 80}" fill="#24231d" font-size="30" font-weight="700" font-family="Helvetica, Arial, sans-serif">${formatDuration(data.totalDurationMs)}</text>
  <text x="190" y="${HEIGHT - 62}" fill="#8a7a63" font-size="11" font-family="Helvetica, Arial, sans-serif">陪伴时长</text>
  <text x="336" y="${HEIGHT - 80}" fill="#24231d" font-size="20" font-weight="700" font-family="Helvetica, Arial, sans-serif">${escapeXml(clip(data.highlight?.title || '—', 8))}</text>
  <text x="336" y="${HEIGHT - 62}" fill="#8a7a63" font-size="11" font-family="Helvetica, Arial, sans-serif">听得最多</text>
  <text x="${WIDTH - 44}" y="${HEIGHT - 26}" text-anchor="end" fill="#a3907a" font-size="10.5" letter-spacing="2" font-family="Helvetica, Arial, sans-serif">OPEN MUSIC CLUB${nickname ? ` / ${escapeXml(clip(nickname, 12))}` : ''}</text>
</svg>`
}

// 下载走 Blob + 临时链接，不经过网络，也不引入额外依赖。
export function downloadCardSvg(card: Pick<MemoryCard, 'title' | 'data'>, nickname = ''): void {
  const blob = new Blob([createCardSvg(card, nickname)], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${card.title.replace(/[\\/:*?"<>|]/g, '_')}.svg`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
