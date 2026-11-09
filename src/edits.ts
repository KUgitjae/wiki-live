export const endpoint = 'https://stream.wikimedia.org/v2/stream/recentchange'
export const minute = 60_000
export const hour = 60 * minute
export const hourStart = (time: number) => Math.floor(time / hour) * hour
export const names: Record<string, string> = { ko: '한국어', en: '영어', ja: '일본어' }

export type Edit = {
  id: string | null
  key: string
  title: string
  language: string
  url: string
  at: number
  link: [url: string, label: string]
  note: string
  delta: number | null
}

type Change = {
  title?: unknown
  server_name?: unknown
  timestamp?: unknown
  comment?: unknown
  bot?: boolean
  namespace?: number
  type?: string
  id?: number
  meta?: { id?: string }
  revision?: { new?: number; old?: number }
  length?: { new?: number; old?: number }
}

export function readEdit(data: Change | null, now: number): Edit | null {
  if (!data || data.bot !== false || data.namespace !== 0 ||
      (data.type !== 'edit' && data.type !== 'new') ||
      typeof data.title !== 'string' || !data.title.trim()) return null

  const site = typeof data.server_name === 'string' &&
    /^([a-z][a-z0-9-]*)\.wikipedia\.org$/.exec(data.server_name)
  if (!site || ['www', 'test', 'test2'].includes(site[1])) return null
  const at = Number(data.timestamp) * 1000
  if (!Number.isFinite(at) || at <= now - minute || at > now + 10_000) return null

  const language = site[1]
  const origin = 'https://' + site[0]
  const title = data.title
  const revision = data.revision?.new
  const previous = data.revision?.old
  const positiveId = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0
  let link: Edit['link'] = [
    origin + '/w/index.php?action=history&title=' + encodeURIComponent(title), '수정 이력 ↗',
  ]
  if (positiveId(revision)) {
    link = positiveId(previous)
      ? [origin + '/w/index.php?diff=' + revision + '&oldid=' + previous, '전후 비교 ↗']
      : [origin + '/w/index.php?oldid=' + revision, '해당 판본 ↗']
  }

  const oldLength = data.length?.old ?? (data.type === 'new' ? 0 : null)
  const newLength = data.length?.new
  const delta = oldLength != null && newLength != null &&
    Number.isFinite(oldLength) && Number.isFinite(newLength) ? newLength - oldLength : null
  return {
    id: data.meta?.id || (data.id != null ? language + ':' + data.id : null),
    link, delta, at, title, language,
    note: typeof data.comment === 'string' ? data.comment.trim() : '',
    key: site[0] + '/' + title,
    url: origin + '/wiki/' + encodeURIComponent(title.replaceAll(' ', '_')),
  }
}

export const demoEdits = [
  ['ko', '한강'], ['en', 'Jazz'], ['ja', '月'], ['ko', '한강'],
  ['en', 'Red panda'], ['ko', '서울특별시'], ['ja', '富士山'], ['en', 'Jazz'],
]

export function makeDemoEdit(index: number, now: number) {
  const [language, title] = demoEdits[index % demoEdits.length]
  return readEdit({
    title, server_name: language + '.wikipedia.org', bot: false,
    namespace: 0, type: 'edit', comment: '예시 편집 · 본문 표현 정리',
    length: { old: 2500, new: 2518 }, timestamp: Math.floor(now / 1000),
  }, now)
}

export function countTitles(edits: Edit[]) {
  const counts = new Map<string, { edit: Edit; count: number }>()
  let top: { edit: Edit; count: number } | undefined
  for (const edit of edits) {
    const entry = counts.get(edit.key) ?? { edit, count: 0 }
    entry.count++
    counts.set(edit.key, entry)
    if (!top || entry.count > top.count) top = entry
  }
  return { counts, top }
}
