import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { loadHour, type Keyword } from './archive'
import { countTitles, hour, hourStart, languageLabel, minute, names, sourceNames, sourceOf, topicKey, type Source, type Topic } from './edits'
import { slots, useLiveEdits } from './useLiveEdits'
import './App.css'

const languages = [['all', '전체'], ...Object.entries(names)]
const sources = Object.keys(sourceNames) as Source[]
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

function TopicLinks({ topic }: { topic: Topic }) {
  const links = [...topic.links.values()].sort((a, b) => b.count - a.count)
  return <div className="topic-links">
    {sources.map(source => {
      const matches = links.filter(link => sourceOf(link.item.url) === source)
      const best = matches[0]
      if (!best) return null
      const count = matches.reduce((sum, link) => sum + link.count, 0)
      return <ExternalLink key={source} href={best.item.url} className="topic-link">
        {sourceNames[source]} · {count.toLocaleString('ko-KR')}회 ↗
      </ExternalLink>
    })}
  </div>
}

export default function App() {
  const [language, setLanguage] = useState('all')
  const [period, setPeriod] = useState<number>(10)
  const [demo, setDemo] = useState(false)
  const [feedSource, setFeedSource] = useState<Source | 'all'>('all')
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [archive, setArchive] = useState<{ key: number; records: Keyword[] | null }>()
  const { edits, recent, bubbles, now, status, health, archiveVersion } = useLiveEdits(demo, language)

  const currentHour = hourStart(now)
  const hourSlots = useMemo(() => Array.from({ length: 24 }, (_, i) => currentHour - i * hour), [currentHour])
  const archiveHour = selectedHour !== null && hourSlots.includes(selectedHour) ? selectedHour : currentHour
  const stats = useMemo(() => {
    const filtered = edits.filter(edit =>
      edit.at > now - period * minute && (language === 'all' || edit.language === language))
    return { ...countTitles(filtered), total: filtered.length }
  }, [edits, now, period, language])
  const periodLabel = '최근 ' + periods.find(([value]) => value === period)?.[1]
  const normalStatus = status === '실시간 연결' || status === '연결 중' || status.startsWith('접속 전')
  const visibleEdits = recent.filter(edit => language === 'all' || edit.language === language)
  const feed = feedSource === 'all'
    ? sources.flatMap(source => visibleEdits.filter(edit => sourceOf(edit.url) === source).slice(0, 4))
        .sort((a, b) => b.at - a.at)
    : visibleEdits.filter(edit => sourceOf(edit.url) === feedSource).slice(0, 12)

  useEffect(() => {
    if (demo) return
    let active = true
    void loadHour(archiveHour).then(records => {
      if (active) setArchive({ key: archiveHour, records })
    })
    return () => { active = false }
  }, [archiveHour, archiveVersion, demo])

  const archiveRecords = archive?.key === archiveHour ? archive.records : undefined
  const isSelectedLanguage = (item: { language: string }) => language === 'all' || item.language === language
  const archiveTopics = demo
    ? countTitles(recent.filter(edit => hourStart(edit.at) === archiveHour && isSelectedLanguage(edit)))
    : countTitles((archiveRecords ?? []).filter(isSelectedLanguage), item => item.count)
  const keywords = [...archiveTopics.counts.values()]
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)).slice(0, 6)

  function bubbleField(field: number) {
    return <div className="field" aria-label="최근 편집 말풍선">
      {bubbles.map(({ edit, slot, updated }) => {
        const [side, x, y] = slots[slot]
        if (side !== field) return null
        const count = stats.counts.get(topicKey(edit))?.count ?? 0
        return <a
          key={edit.key + ':' + updated}
          href={edit.url} target="_blank" rel="noopener noreferrer"
          className={'bubble ' + edit.language} title={edit.title}
          style={{ '--x': x + '%', '--y': y + '%' } as CSSProperties}
        >
          <span className="lang">{edit.language === 'mul' ? '공용' : edit.language.toUpperCase()}</span>
          <span className="bubble-title">{edit.title}</span>
          <span className="badge">{count > 1 ? '×' + count : ''}</span>
        </a>
      })}
    </div>
  }

  return <main>
    <header>
      <span className="mono">WIKIMEDIA / LIVE EDITS</span>
      <h1>위키 라이브</h1>
      <p>위키백과, 위키낱말사전, 위키미디어 공용에서 지금 편집되는 키워드를 한눈에 보세요.</p>
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
    <section className="board" aria-label="위키 사이트 편집 현황">
      <div className="bar" role="group" aria-label="실시간 집계 범위">
        <span className="metric">집계 범위</span>
        <div className="periods">
          {periods.map(([value, label]) => <button
            key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}
          >{label}</button>)}
        </div>
      </div>
      <div className="bar">
        <span className="status" data-kind={normalStatus ? '' : 'warn'} role="status">
          {demo ? status : '위키백과 · ' + status}
        </span>
        <span className="metric">{periodLabel} <strong>{stats.total.toLocaleString('ko-KR')}</strong>건</span>
      </div>
      {!demo && <div className="bar source-health" aria-label="추가 데이터 출처 연결 상태">
        {(['wiktionary', 'commons'] as const).map(source => <span className="metric" key={source}>
          {sourceNames[source]} · {health[source] === 'active' ? '수신 중' : health[source] === 'retry' ? '다시 시도 중' : '불러오는 중'}
        </span>)}
      </div>}
      <div className="scene">
        {bubbleField(0)}
        <div className="leader">
          <p className="mono">{periodLabel} · 최다 편집 키워드</p>
          <span className="leader-title">{stats.top?.title ?? '첫 편집을 기다리는 중'}</span>
          {stats.top ? <>
            <small>합계 {stats.top.count.toLocaleString('ko-KR')}회 편집 · 링크를 누르면 해당 사이트로 이동해요.</small>
            <TopicLinks topic={stats.top} />
          </> : <small>접속 직전 10분부터 받은 편집을 집계해요.</small>}
        </div>
        {bubbleField(1)}
      </div>
    </section>
    <div className="activity">
      <section className="panel" aria-labelledby="activity-title">
        <p className="mono">EDIT FEED</p>
        <h2 id="activity-title">최근 수정</h2>
        <p className="hint">{feedSource === 'all'
          ? '출처마다 최신 편집을 최대 4개씩 보여줘요.'
          : '선택한 출처의 최신 편집을 최대 12개까지 보여줘요.'}</p>
        <div className="feed-filters" role="group" aria-label="최근 수정 출처">
          {(['all', ...sources] as const).map(source => <button key={source} type="button"
            aria-pressed={source === feedSource} onClick={() => setFeedSource(source)}>
            {source === 'all' ? '전체' : sourceNames[source]}
          </button>)}
        </div>
        <ol className="items">
          {feed.map((edit, index) => <li key={edit.id ?? edit.key + ':' + edit.at + ':' + index}>
            <div className="row">
              <div>
                <span className="feed-source">{sourceNames[sourceOf(edit.url)]} · {languageLabel(edit.language)}{edit.language === 'mul' ? '' : '판'}</span>
                <ExternalLink href={edit.url}>{edit.title} ↗</ExternalLink>
              </div>
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
          : '최근 24시간 · 한국 시간 · 같은 제목의 편집을 출처별로 합산합니다.'}</p>
        <select aria-label="기록 시간대" value={archiveHour}
          onChange={event => {
            const value = Number(event.target.value)
            setSelectedHour(value === currentHour ? null : value)
          }}>
          {hourSlots.map((at, i) => <option key={at} value={at}>{hourFormat.format(at)}{i === 0 ? ' · 현재' : ''}</option>)}
        </select>
        <ol className="items">
          {keywords.map((item, i) => <li key={item.key}>
            <div className="row"><strong>{i + 1}. {item.title}</strong><small>합계 {item.count}회</small></div>
            <TopicLinks topic={item} />
          </li>)}
          {!keywords.length && <li className="empty">이 시간대에 저장된 편집이 없어요.</li>}
        </ol>
      </section>
    </div>
    <footer>
      <span>공개 문서·파일·분류 편집 · 봇 편집 제외</span>
      <div className="source-docs">
        <ExternalLink href="https://www.mediawiki.org/wiki/API:Recent_changes_stream">위키백과 스트림 ↗</ExternalLink>
        <ExternalLink href="https://en.wiktionary.org/wiki/Special:RecentChanges">위키낱말사전 ↗</ExternalLink>
        <ExternalLink href="https://commons.wikimedia.org/wiki/Special:RecentChanges">위키미디어 공용 ↗</ExternalLink>
      </div>
    </footer>
  </main>
}
