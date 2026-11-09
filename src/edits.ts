export const endpoint = 'https://stream.wikimedia.org/v2/stream/recentchange'
export const minute = 60_000
export const hour = 60 * minute
export const hourStart = (time: number) => Math.floor(time / hour) * hour
export const names: Record<string, string> = { ko: '한국어', en: '영어', ja: '일본어' }

export const sourceNames = {
  wikipedia: '위키백과',
  wiktionary: '위키낱말사전',
  commons: '위키미디어 공용',
} as const
export type Source = keyof typeof sourceNames

export function sourceOf(url: string): Source {
  if (url.startsWith('https://commons.wikimedia.org/')) return 'commons'
  return /^https:\/\/[^/]+\.wiktionary\.org\//.test(url) ? 'wiktionary' : 'wikipedia'
}

export function languageLabel(language: string) {
  return language === 'mul' ? '다국어' : names[language] ?? language.toUpperCase()
}

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

export function readEdit(data: Change | null, now: number, after = now - minute): Edit | null {
  if (!data || data.bot !== false ||
      (data.type !== 'edit' && data.type !== 'new') ||
      typeof data.title !== 'string' || !data.title.trim()) return null

  const host = data.server_name
  if (typeof host !== 'string') return null
  const commons = host === 'commons.wikimedia.org'
  const site = /^([a-z][a-z0-9-]*)\.(wikipedia|wiktionary)\.org$/.exec(host)
  if (commons ? ![0, 6, 14].includes(data.namespace ?? -1) :
      !site || ['www', 'test', 'test2'].includes(site[1]) || data.namespace !== 0) return null
  const at = Number(data.timestamp) * 1000
  if (!Number.isFinite(at) || at <= after || at > now + 10_000) return null

  const language = commons ? 'mul' : site![1]
  const origin = 'https://' + host
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
    key: host + '/' + title,
    url: origin + '/wiki/' + encodeURIComponent(title.replaceAll(' ', '_')),
  }
}

const demoEdits = [
  ['en.wikipedia.org', 'Jazz', 0],
  ['en.wiktionary.org', 'jazz', 0],
  ['commons.wikimedia.org', 'Category:Jazz', 14],
  ['ko.wikipedia.org', '한강', 0],
  ['ko.wiktionary.org', '한강', 0],
  ['ja.wikipedia.org', '月', 0],
  ['commons.wikimedia.org', 'Category:Seoul', 14],
  ['ko.wikipedia.org', '인공지능', 0],
] as const

export function makeDemoEdit(index: number, now: number) {
  const [host, title, namespace] = demoEdits[index % demoEdits.length]
  return readEdit({
    title, server_name: host, bot: false,
    namespace, type: 'edit', comment: '예시 편집 · 본문 표현 정리',
    length: { old: 2500, new: 2518 }, timestamp: Math.floor(now / 1000),
  }, now)
}

type TopicItem = Pick<Edit, 'title' | 'url' | 'language'>
type TopicLink = { item: TopicItem; count: number }
export type Topic = { key: string; title: string; count: number; links: Map<string, TopicLink> }

function keywordTitle(item: TopicItem) {
  if (sourceOf(item.url) !== 'commons') return item.title
  if (item.title.startsWith('File:')) return item.title.slice(5).replace(/\.[a-z0-9]{2,5}$/i, '')
  return item.title.replace(/^Category:/, '')
}

export function topicKey(item: TopicItem) {
  return keywordTitle(item).normalize('NFKC').replace(/[_\s]+/g, ' ').trim().toLowerCase()
}

export function countTitles<T extends TopicItem>(edits: T[], weight: (item: T) => number = () => 1) {
  const counts = new Map<string, Topic>()
  let top: Topic | undefined
  for (const item of edits) {
    const key = topicKey(item)
    const value = weight(item)
    let entry = counts.get(key)
    if (!entry) {
      entry = { key, title: keywordTitle(item), count: 0, links: new Map() }
      counts.set(key, entry)
    }
    entry.count += value
    const link = entry.links.get(item.url)
    if (link) link.count += value
    else entry.links.set(item.url, { item, count: value })
    if (!top || entry.count > top.count) top = entry
  }
  return { counts, top }
}
