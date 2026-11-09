import { hour, readEdit, type Edit, type Source } from './edits'

const interval = 20_000
const overlap = 30_000

const feeds = [
  { host: 'en.wiktionary.org', source: 'wiktionary', namespace: '0' },
  { host: 'ko.wiktionary.org', source: 'wiktionary', namespace: '0' },
  { host: 'ja.wiktionary.org', source: 'wiktionary', namespace: '0' },
  { host: 'commons.wikimedia.org', source: 'commons', namespace: '0|6|14' },
] as const

type Change = {
  rcid: number
  title: string
  timestamp: string
  ns: number
  type: 'edit' | 'new'
  comment?: string
  revid?: number
  old_revid?: number
  oldlen?: number
  newlen?: number
  bot?: boolean
}
type Feed = typeof feeds[number]
type Reply = {
  query?: { recentchanges?: Change[] }
  continue?: Record<string, string>
  error?: { info?: string }
}
export type Health = 'loading' | 'active' | 'retry'

async function scan(
  feed: Feed, after: number, before: number, signal: AbortSignal, add: (edit: Edit) => void,
) {
  const url = new URL('https://' + feed.host + '/w/api.php')
  url.search = new URLSearchParams({
    action: 'query', list: 'recentchanges', format: 'json', formatversion: '2', origin: '*',
    rcstart: new Date(after).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    rcend: new Date(before).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    rcdir: 'newer', rclimit: '100', rcnamespace: feed.namespace,
    rcshow: '!bot', rctype: 'edit|new', rcprop: 'title|ids|timestamp|comment|sizes|flags',
  }).toString()

  let continuation: Reply['continue']
  do {
    const request = new URL(url)
    for (const [key, value] of Object.entries(continuation ?? {})) request.searchParams.set(key, value)
    const response = await fetch(request, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('RecentChanges HTTP ' + response.status)
    const data: Reply = await response.json()
    if (data.error || !Array.isArray(data.query?.recentchanges)) {
      throw new Error(data.error?.info ?? 'RecentChanges 응답 오류')
    }
    if (signal.aborted) return
    for (const change of data.query.recentchanges) {
      if (!Number.isSafeInteger(change.rcid)) continue
      const edit = readEdit({
        server_name: feed.host,
        title: change.title,
        timestamp: Date.parse(change.timestamp) / 1000,
        namespace: change.ns,
        type: change.type,
        bot: change.bot === true,
        comment: change.comment,
        meta: { id: feed.host + ':' + change.rcid },
        revision: { old: change.old_revid, new: change.revid },
        length: { old: change.oldlen, new: change.newlen },
      }, Date.now(), after - 1000)
      if (edit) add(edit)
    }
    continuation = data.continue
  } while (continuation && !signal.aborted)
}

export function watchRecentChanges(
  start: number, add: (edit: Edit) => void, setHealth: (source: Source, health: Health) => void,
) {
  const controller = new AbortController()
  const health = new Map<Feed['host'], Health>()
  const timers = new Map<Feed['host'], ReturnType<typeof setTimeout>>()

  for (const feed of feeds) {
    let cursor = start
    async function poll() {
      const before = Date.now()
      try {
        await scan(feed, Math.max(start, cursor - overlap, before - hour), before, controller.signal, add)
        if (controller.signal.aborted) return
        cursor = before
        health.set(feed.host, 'active')
      } catch {
        if (controller.signal.aborted) return
        health.set(feed.host, 'retry')
      }
      const states = feeds.filter(item => item.source === feed.source).map(item => health.get(item.host))
      setHealth(feed.source, states.includes('active') ? 'active' : states.every(state => state === 'retry') ? 'retry' : 'loading')
      timers.set(feed.host, setTimeout(poll, interval))
    }
    void poll()
  }
  return () => {
    controller.abort()
    for (const timer of timers.values()) clearTimeout(timer)
  }
}
