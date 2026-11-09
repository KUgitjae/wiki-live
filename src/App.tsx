import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { loadHour, type Keyword } from './archive'
import { countTitles, hour, hourStart, minute, names } from './edits'
import { slots, useLiveEdits } from './useLiveEdits'
import './App.css'

const languages = [['all', '전체'], ...Object.entries(names)]
const periods = [[1, '1분'], [10, '10분'], [60, '1시간']] as const
const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const hourFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

function ExternalLink({ href, className, children }: {
  href: string; className?: string; children: ReactNode
}) {
  return <a href={href} className={className} target="_blank" rel="noopener noreferrer">{children}</a>
}

export default function App() {
  const [language, setLanguage] = useState('all')
  const [period, setPeriod] = useState<number>(1)
  const [demo, setDemo] = useState(false)
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [archive, setArchive] = useState<{ key: number; records: Keyword[] | null }>()
  const { edits, recent, bubbles, now, status, archiveVersion } = useLiveEdits(demo, language)

  const currentHour = hourStart(now)
  const hourSlots = useMemo(() => Array.from({ length: 24 }, (_, i) => currentHour - i * hour), [currentHour])
  const archiveHour = selectedHour !== null && hourSlots.includes(selectedHour) ? selectedHour : currentHour
  const stats = useMemo(() => {
    const filtered = edits.filter(edit =>
      edit.at > now - period * minute && (language === 'all' || edit.language === language))
    return { ...countTitles(filtered), total: filtered.length }
  }, [edits, now, period, language])
  const periodLabel = '최근 ' + periods.find(([value]) => value === period)?.[1]
  const feed = recent.filter(edit => language === 'all' || edit.language === language).slice(0, 8)

  useEffect(() => {
    if (demo) return
    let active = true
    void loadHour(archiveHour).then(records => {
      if (active) setArchive({ key: archiveHour, records })
    })
    return () => { active = false }
  }, [archiveHour, archiveVersion, demo])

  const archiveRecords = archive?.key === archiveHour ? archive.records : undefined
  const demoKeywords = demo
    ? [...countTitles(recent.filter(edit => hourStart(edit.at) === archiveHour)).counts.values()]
        .map(({ edit, count }) => ({ title: edit.title, url: edit.url, language: edit.language, count }))
    : []
  const keywords = (demo ? demoKeywords : archiveRecords ?? [])
    .filter(item => language === 'all' || item.language === language)
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)).slice(0, 6)

  function bubbleField(field: number) {
    return <div className="field" aria-label="최근 편집 말풍선">
      {bubbles.map(({ edit, slot, updated }) => {
        const [side, x, y] = slots[slot]
        if (side !== field) return null
        const count = stats.counts.get(edit.key)?.count ?? 0
        return <a
          key={edit.key + ':' + updated}
          href={edit.url} target="_blank" rel="noopener noreferrer"
          className={'bubble ' + edit.language} title={edit.title}
          style={{ '--x': x + '%', '--y': y + '%' } as CSSProperties}
        >
          <span className="lang">{edit.language.toUpperCase()}</span>
          <span className="bubble-title">{edit.title}</span>
          <span className="badge">{count > 1 ? '×' + count : ''}</span>
        </a>
      })}
    </div>
  }

  return <main>
    <header>
      <span className="mono">WIKIPEDIA / LIVE EDITS</span>
      <h1>위키 라이브</h1>
      <p>지금 편집 중인 위키백과를 보고, 시간이 지나며 어떤 주제가 떠올랐는지 살펴보세요.</p>
    </header>
    <nav className="controls" aria-label="편집 화면 설정">
      {languages.map(([key, label]) => <button
        key={key} type="button" aria-pressed={language === key} onClick={() => setLanguage(key)}
      >{label}</button>)}
      <span className="spacer" />
      <button type="button" aria-pressed={demo} onClick={() => setDemo(value => !value)}>
        {demo ? '실시간으로 돌아가기' : '데모 보기'}
      </button>
    </nav>
    <section className="board" aria-label="위키백과 편집 현황">
      <div className="bar" role="group" aria-label="실시간 집계 범위">
        <span className="metric">집계 범위</span>
        <div className="periods">
          {periods.map(([value, label]) => <button
            key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}
          >{label}</button>)}
        </div>
      </div>
      <div className="bar">
        <span className="status" data-kind={status === '실시간 연결' || status === '연결 중' ? '' : 'warn'} role="status">
          {status}
        </span>
        <span className="metric">{periodLabel} <strong>{stats.total.toLocaleString('ko-KR')}</strong>건</span>
      </div>
      <div className="scene">
        {bubbleField(0)}
        <div className="leader">
          <p className="mono">{periodLabel} · 가장 많이 편집된 문서</p>
          <span className="leader-title">{stats.top?.edit.title ?? '첫 편집을 기다리는 중'}</span>
          <small>{stats.top
            ? (names[stats.top.edit.language] ?? stats.top.edit.language.toUpperCase()) + '판 · ' + stats.top.count + '회 편집'
            : '페이지를 연 뒤 받은 이벤트를 집계해요.'}</small>
        </div>
        {bubbleField(1)}
      </div>
    </section>
    <div className="activity">
      <section className="panel" aria-labelledby="activity-title">
        <p className="mono">EDIT FEED</p>
        <h2 id="activity-title">최근 수정</h2>
        <p className="hint">편집자가 남긴 요약과 문서 크기 변화를 확인하세요.</p>
        <ol className="items">
          {feed.map((edit, index) => <li key={edit.id ?? edit.key + ':' + edit.at + ':' + index}>
            <div className="row">
              <div><span className="lang">{edit.language.toUpperCase()}</span><ExternalLink href={edit.url}>{edit.title}</ExternalLink></div>
              <small>{timeFormat.format(edit.at)}</small>
            </div>
            <p className="edit-note">{edit.note.slice(0, 280) || '편집자가 남긴 요약이 없어요.'}</p>
            <ExternalLink href={edit.link[0]} className="compare">{edit.link[1]}</ExternalLink>
            {edit.delta !== null && <span className="edit-meta"> · {edit.delta > 0 ? '+' : ''}{edit.delta.toLocaleString('ko-KR')}바이트</span>}
          </li>)}
          {!feed.length && <li className="empty">받은 편집이 아직 없어요.</li>}
        </ol>
      </section>
      <section className="panel" aria-labelledby="archive-title">
        <p className="mono">HOURLY ARCHIVE</p>
        <h2 id="archive-title">시간대별 키워드</h2>
        <p className="hint">{demo
          ? '데모 키워드 · 예시 데이터는 실제 기록에 저장되지 않아요.'
          : archiveRecords === null ? '이 브라우저에서 기록 저장을 사용할 수 없어요.'
          : '최근 24시간 · 한국 시간 · 문서 제목을 편집 횟수로 집계합니다.'}</p>
        <select aria-label="기록 시간대" value={archiveHour}
          onChange={event => {
            const value = Number(event.target.value)
            setSelectedHour(value === currentHour ? null : value)
          }}>
          {hourSlots.map((at, i) => <option key={at} value={at}>{hourFormat.format(at)}{i === 0 ? ' · 현재' : ''}</option>)}
        </select>
        <ol className="items">
          {keywords.map((item, i) => <li className="row" key={item.url}>
            <ExternalLink href={item.url}>{i + 1}. {item.title}</ExternalLink>
            <small>{item.language.toUpperCase()} · {item.count}회</small>
          </li>)}
          {!keywords.length && <li className="empty">이 시간대에 저장된 편집이 없어요.</li>}
        </ol>
      </section>
    </div>
    <footer>
      <span>공개 백과사전 문서 편집만 표시 · 봇 편집 제외</span>
      <ExternalLink href="https://www.mediawiki.org/wiki/API:Recent_changes_stream">데이터 출처 · Wikimedia EventStreams ↗</ExternalLink>
    </footer>
  </main>
}
