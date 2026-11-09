import { useEffect, useRef, useState } from 'react'
import { saveEdits } from './archive'
import { endpoint, hour, makeDemoEdit, minute, readEdit, sourceOf, topicKey, type Edit, type Source } from './edits'
import { watchRecentChanges, type Health } from './recentChanges'

export const slots = [
  [0, 25, 12], [1, 75, 34], [0, 75, 12], [1, 25, 34], [0, 50, 57],
] as const

type Bubble = { edit: Edit; slot: number; updated: number }
type Snapshot = { edits: Edit[]; recent: Edit[]; bubbles: Bubble[]; now: number }
const emptySnapshot = (): Snapshot => ({ edits: [], recent: [], bubbles: [], now: Date.now() })

export function useLiveEdits(demo: boolean, language: string, bubbleLifetime: number) {
  const [snapshot, setSnapshot] = useState(emptySnapshot)
  const [status, setStatus] = useState('연결 중')
  const [health, setHealth] = useState<Partial<Record<Source, Health>>>({})
  const [archiveVersion, setArchiveVersion] = useState(0)
  const languageRef = useRef(language)
  const lifetimeRef = useRef(bubbleLifetime)
  const resetBubbles = useRef<() => void>(() => {})

  useEffect(() => {
    languageRef.current = language
    resetBubbles.current()
  }, [language])

  useEffect(() => {
    lifetimeRef.current = bubbleLifetime
  }, [bubbleLifetime])

  useEffect(() => {
    let edits: Edit[] = []
    const recent = new Map<Source, Edit[]>()
    let pending: Edit[] = []
    const bubbles = new Map<string, Bubble>()
    const seen = new Map<string, number>()
    let nextSlot = 0
    let lastBubble = -Infinity
    let live = true
    let stream: EventSource | undefined
    let demoTimer: ReturnType<typeof setInterval> | undefined
    let stopRecentChanges: (() => void) | undefined
    const openedAt = Math.floor(Date.now() / 1000) * 1000
    const historyStart = openedAt - hour
    let caughtUp = false

    function expireBubbles(now: number) {
      for (const [key, bubble] of bubbles) {
        if (bubble.updated + lifetimeRef.current <= now) bubbles.delete(key)
      }
    }

    function publish() {
      const now = Date.now()
      edits = edits.filter(edit => edit.at > now - hour)
      for (const [source, rows] of recent) {
        recent.set(source, rows.sort((a, b) => b.at - a.at).slice(0, 200))
      }
      for (const [id, at] of seen) if (at <= now - hour) seen.delete(id)
      expireBubbles(now)
      const feed = [...recent.values()].flat().sort((a, b) => b.at - a.at)
      setSnapshot({ edits: edits.slice(), recent: feed, bubbles: [...bubbles.values()], now })
    }

    function addBubble(edit: Edit, now: number) {
      expireBubbles(now)
      const key = topicKey(edit)
      const existing = bubbles.get(key)
      if (existing) {
        bubbles.set(key, { ...existing, edit, updated: now })
        return
      }
      if (now - lastBubble < 650) return
      const occupied = new Set([...bubbles.values()].map(bubble => bubble.slot))
      for (let offset = 0; offset < slots.length; offset++) {
        const slot = (nextSlot + offset) % slots.length
        if (occupied.has(slot)) continue
        bubbles.set(key, { edit, slot, updated: now })
        nextSlot = (slot + 1) % slots.length
        lastBubble = now
        return
      }
    }

    function addEdit(edit: Edit | null, historical = false) {
      if (!edit) return
      const now = Date.now()
      if (edit.id && seen.has(edit.id)) return
      if (edit.id) seen.set(edit.id, now)
      edits.push(edit)
      const source = sourceOf(edit.url)
      const rows = recent.get(source) ?? []
      rows.push(edit)
      recent.set(source, rows)
      if (historical) return
      if (!demo && edit.id) pending.push(edit)
      if (languageRef.current === 'all' || languageRef.current === edit.language) addBubble(edit, now)
    }

    async function flush() {
      if (!pending.length) return
      const batch = pending
      pending = []
      const saved = await saveEdits(batch)
      if (!live) return
      if (saved) setArchiveVersion(version => version + 1)
      else pending.unshift(...batch.filter(edit => edit.at > Date.now() - minute))
    }

    function onVisibility() {
      if (document.hidden) void flush()
    }

    resetBubbles.current = () => {
      bubbles.clear()
      nextSlot = 0
      lastBubble = -Infinity
      publish()
    }

    setHealth({})
    if (!demo) {
      stopRecentChanges = watchRecentChanges(historyStart,
        edit => addEdit(edit, edit.at < openedAt),
        (source, next) => setHealth(previous => ({ ...previous, [source]: next })),
      )
    }
    if (demo) {
      setStatus('데모 · 예시 데이터')
      let index = 0
      const emit = () => addEdit(makeDemoEdit(index++, Date.now()))
      emit()
      demoTimer = setInterval(emit, 1050)
    } else if (typeof EventSource === 'undefined') {
      setStatus('이 브라우저는 실시간 연결을 지원하지 않아요.')
    } else {
      setStatus('연결 중')
      const url = new URL(endpoint)
      url.searchParams.set('since', new Date(historyStart).toISOString())
      stream = new EventSource(url)
      stream.onopen = () => {
        if (live) setStatus(caughtUp ? '실시간 연결' : '접속 전 1시간 기록 불러오는 중')
      }
      stream.onerror = () => { if (live) setStatus('연결이 끊겼어요 · 다시 연결 중') }
      stream.onmessage = (event) => {
        if (!live) return
        try {
          const now = Date.now()
          const edit = readEdit(JSON.parse(event.data), now, Math.max(historyStart, now - hour))
          if (!edit || sourceOf(edit.url) !== 'wikipedia') return
          const historical = edit.at < openedAt
          if (!historical && !caughtUp) {
            caughtUp = true
            setStatus('실시간 연결')
          }
          addEdit(edit, historical)
        } catch {
          // A malformed event should not stop the stream.
        }
      }
    }

    publish()
    const renderTimer = setInterval(publish, 800)
    const archiveTimer = setInterval(() => { void flush() }, 2400)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onVisibility)
    return () => {
      live = false
      resetBubbles.current = () => {}
      stream?.close()
      stopRecentChanges?.()
      clearInterval(demoTimer)
      clearInterval(renderTimer)
      clearInterval(archiveTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onVisibility)
      void flush()
    }
  }, [demo])

  return { ...snapshot, status, health, archiveVersion }
}
