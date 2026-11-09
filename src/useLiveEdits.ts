import { useEffect, useRef, useState } from 'react'
import { saveEdits } from './archive'
import { endpoint, hour, makeDemoEdit, minute, readEdit, type Edit } from './edits'

export const slots = [
  [0, 24, 11], [1, 72, 17], [0, 72, 41], [1, 24, 49],
  [0, 31, 72], [1, 70, 76], [0, 75, 10], [1, 24, 12],
] as const

const lifetime = 8_000
type Bubble = { edit: Edit; slot: number; updated: number }
type Snapshot = { edits: Edit[]; recent: Edit[]; bubbles: Bubble[]; now: number }
const emptySnapshot = (): Snapshot => ({ edits: [], recent: [], bubbles: [], now: Date.now() })

export function useLiveEdits(demo: boolean, language: string) {
  const [snapshot, setSnapshot] = useState(emptySnapshot)
  const [status, setStatus] = useState('연결 중')
  const [archiveVersion, setArchiveVersion] = useState(0)
  const languageRef = useRef(language)
  const resetBubbles = useRef<() => void>(() => {})

  useEffect(() => {
    languageRef.current = language
    resetBubbles.current()
  }, [language])

  useEffect(() => {
    let edits: Edit[] = []
    let recent: Edit[] = []
    let pending: Edit[] = []
    const bubbles = new Map<string, Bubble>()
    const seen = new Map<string, number>()
    let nextSlot = 0
    let lastBubble = -Infinity
    let live = true
    let stream: EventSource | undefined
    let demoTimer: ReturnType<typeof setInterval> | undefined

    function publish() {
      const now = Date.now()
      edits = edits.filter(edit => edit.at > now - hour)
      for (const [id, at] of seen) if (at <= now - minute) seen.delete(id)
      for (const [key, bubble] of bubbles) if (bubble.updated + lifetime <= now) bubbles.delete(key)
      setSnapshot({ edits, recent, bubbles: [...bubbles.values()], now })
    }

    function addBubble(edit: Edit, now: number) {
      const existing = bubbles.get(edit.key)
      if (existing) {
        bubbles.set(edit.key, { ...existing, updated: now })
        return
      }
      if (now - lastBubble < 650) return
      const occupied = new Set([...bubbles.values()].map(bubble => bubble.slot))
      for (let offset = 0; offset < slots.length; offset++) {
        const slot = (nextSlot + offset) % slots.length
        if (occupied.has(slot)) continue
        bubbles.set(edit.key, { edit, slot, updated: now })
        nextSlot = (slot + 1) % slots.length
        lastBubble = now
        return
      }
    }

    function addEdit(edit: Edit | null) {
      if (!edit) return
      const now = Date.now()
      if (edit.id && seen.has(edit.id)) return
      if (edit.id) seen.set(edit.id, now)
      edits.push(edit)
      recent = [edit, ...recent.slice(0, 199)]
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
      stream = new EventSource(endpoint)
      stream.onopen = () => { if (live) setStatus('실시간 연결') }
      stream.onerror = () => { if (live) setStatus('연결이 끊겼어요 · 다시 연결 중') }
      stream.onmessage = (event) => {
        if (!live) return
        try {
          addEdit(readEdit(JSON.parse(event.data), Date.now()))
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
      clearInterval(demoTimer)
      clearInterval(renderTimer)
      clearInterval(archiveTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onVisibility)
      void flush()
    }
  }, [demo])

  return { ...snapshot, status, archiveVersion }
}
