import { hour, hourStart, minute, type Edit } from './edits'

export type Keyword = Pick<Edit, 'title' | 'url' | 'language'> & { count: number }

type HourRecord = {
  titles: Record<string, Keyword>
  seen: Record<string, number>
}

let archive: Promise<IDBDatabase | null> | undefined

function database() {
  archive ??= new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open('wiki-live', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('hours')
      request.onsuccess = () => request.result && resolve(request.result)
      request.onerror = request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return archive
}

export async function loadHour(at: number): Promise<Keyword[] | null> {
  const db = await database()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const request = db.transaction('hours').objectStore('hours').get(at)
      request.onsuccess = () => {
        const record = request.result as HourRecord | undefined
        resolve(Object.values(record?.titles ?? {}))
      }
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function saveEdits(batch: Edit[]) {
  const db = await database()
  if (!db) return true

  const now = Date.now()
  const firstHour = hourStart(now) - 23 * hour
  const buckets = new Map<number, Edit[]>()
  for (const edit of batch) {
    const key = hourStart(edit.at)
    if (!edit.id || key < firstHour) continue
    const events = buckets.get(key) ?? []
    events.push(edit)
    buckets.set(key, events)
  }

  return new Promise<boolean>((resolve) => {
    try {
      const transaction = db.transaction('hours', 'readwrite')
      const hours = transaction.objectStore('hours')
      transaction.oncomplete = () => resolve(true)
      transaction.onabort = () => resolve(false)
      hours.delete(IDBKeyRange.upperBound(firstHour, true))

      for (const [key, edits] of buckets) {
        const read = hours.get(key)
        read.onsuccess = () => {
          const record: HourRecord = read.result ?? { titles: {}, seen: {} }
          for (const [id, at] of Object.entries(record.seen)) {
            if (at <= now - 2 * minute) delete record.seen[id]
          }
          for (const edit of edits) {
            if (!edit.id || Object.hasOwn(record.seen, edit.id)) continue
            record.seen[edit.id] = now
            const entry = record.titles[edit.key]
            if (entry) entry.count++
            else record.titles[edit.key] = {
              title: edit.title, language: edit.language, url: edit.url, count: 1,
            }
          }
          hours.put(record, key)
        }
      }
    } catch {
      resolve(false)
    }
  })
}
