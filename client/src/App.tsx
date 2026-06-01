import React, { useState, useMemo } from 'react'
import './App.css'

interface SegmentData {
  id: number
  name: string
  elapsed_time: number
  moving_time: number
  distance: number
  average_heartrate: number | null
  max_heartrate: number | null
  average_watts: number | null
  pr_rank: number | null
  achievements: Array<{ type_id: number; type: string; rank: number }>
  segment: {
    id: number
    climb_category: number
    average_grade: number
    elevation_high: number
    elevation_low: number
    starred: boolean
  }
}

interface ActivityData {
  id: number
  name: string
  sport_type: string
  start_date_local: string
  distance: number
  moving_time: number
  elapsed_time: number
  total_elevation_gain: number
  average_heartrate: number | null
  max_heartrate: number | null
  segments: SegmentData[]
}

interface HistoryEntry {
  id: number
  elapsed_time: number
  start_date_local: string
  average_heartrate: number | null
  activity_id: number
}

interface ActivityDetail {
  name: string
  description: string
}

type HistoryState = HistoryEntry[] | 'loading' | 'error'
type DetailState = ActivityDetail | 'loading' | 'error'
type SortKey = 'date' | 'time' | 'hr'
type SortDir = 'asc' | 'desc'
type SegmentFilter = 'all' | 'starred'

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}

function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(2)} km`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatActivityDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NZ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function sportLabel(sportType: string): string {
  return sportType.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

function sortedHistory(entries: HistoryEntry[], key: SortKey, dir: SortDir): HistoryEntry[] {
  return [...entries].sort((a, b) => {
    let diff = 0
    if (key === 'date') diff = a.start_date_local.localeCompare(b.start_date_local)
    else if (key === 'time') diff = a.elapsed_time - b.elapsed_time
    else if (key === 'hr') diff = (a.average_heartrate ?? 0) - (b.average_heartrate ?? 0)
    return dir === 'asc' ? diff : -diff
  })
}

function SortTh({ label, colKey, sortKey, sortDir, onSort }: {
  label: string
  colKey: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
}) {
  const active = sortKey === colKey
  return (
    <th
      className={`sortable-th${active ? ' sortable-th--active' : ''}`}
      onClick={() => onSort(colKey)}
    >
      {label}<span className="sort-indicator">{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</span>
    </th>
  )
}

function HistoryPanel({ entries, currentEffortId, sportType, sortKey, sortDir, onSort }: {
  entries: HistoryEntry[]
  currentEffortId: number
  sportType: string
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
}) {
  const [expandedEffortId, setExpandedEffortId] = useState<number | null>(null)
  const [details, setDetails] = useState<Record<number, DetailState>>({})

  const sorted = useMemo(() => sortedHistory(entries, sortKey, sortDir), [entries, sortKey, sortDir])

  async function toggleDetail(e: React.MouseEvent, entry: HistoryEntry) {
    e.stopPropagation()
    if (expandedEffortId === entry.id) { setExpandedEffortId(null); return }
    setExpandedEffortId(entry.id)

    const actId = entry.activity_id
    if (!actId) return
    if (details[actId]) return

    setDetails((d) => ({ ...d, [actId]: 'loading' }))
    try {
      const res = await fetch(`/api/strava/activity/${actId}`)
      if (!res.ok) throw new Error()
      const data = await res.json() as ActivityDetail
      setDetails((d) => ({ ...d, [actId]: data }))
    } catch {
      setDetails((d) => ({ ...d, [actId]: 'error' }))
    }
  }

  const label = sportLabel(sportType)

  return (
    <div className="history-panel">
      <table className="history-table">
        <thead>
          <tr>
            <SortTh label="Date" colKey="date" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh label="Time" colKey="time" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh label="Avg HR" colKey="hr" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const isCurrent = e.id === currentEffortId
            const isOpen = expandedEffortId === e.id
            const detail = e.activity_id ? details[e.activity_id] : undefined
            return (
              <React.Fragment key={e.id}>
                <tr
                  className={`history-entry-row${isCurrent ? ' history-row--current' : ''}${isOpen ? ' history-entry-row--open' : ''}`}
                  onClick={(ev) => toggleDetail(ev, e)}
                >
                  <td>
                    {formatDate(e.start_date_local)}
                    {isCurrent && <span className="current-tag">this {label}</span>}
                  </td>
                  <td>{formatTime(e.elapsed_time)}</td>
                  <td>{e.average_heartrate !== null ? Math.round(e.average_heartrate) : '—'}</td>
                </tr>
                {isOpen && (
                  <tr className="activity-detail-row">
                    <td colSpan={3}>
                      {!e.activity_id && <span className="detail-msg">No activity link available.</span>}
                      {detail === 'loading' && <span className="detail-msg">Loading…</span>}
                      {detail === 'error' && <span className="detail-msg detail-msg--error">Failed to load.</span>}
                      {detail && detail !== 'loading' && detail !== 'error' && (
                        <div className="activity-detail">
                          <span className="detail-name">{detail.name}</span>
                          {detail.description
                            ? <span className="detail-description">{detail.description}</span>
                            : <span className="detail-no-desc">No description</span>
                          }
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SegmentItem({ segment, isExpanded, history, sortKey, sortDir, onSort, onToggle, sportType }: {
  segment: SegmentData
  isExpanded: boolean
  history: HistoryState | undefined
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  onToggle: () => void
  sportType: string
}) {
  const isPR = segment.pr_rank === 1

  return (
    <div className={`segment-item${isExpanded ? ' segment-item--expanded' : ''}${isPR ? ' segment-item--pr' : ''}`}>
      <div className="segment-item-top" onClick={onToggle}>
        <div className="segment-item-name-row">
          {segment.segment.starred && <span className="star">★</span>}
          <span className="segment-name">{segment.name}</span>
          {isPR && <span className="badge badge--pr">PR</span>}
          {segment.achievements.length > 0 && !isPR && <span className="badge badge--trophy">★</span>}
        </div>
        <span className="segment-chevron">{isExpanded ? '▲' : '▼'}</span>
      </div>

      <div className="segment-item-stats">
        <span>⏱️ {formatTime(segment.elapsed_time)}</span>
        <span className="stat-sep">·</span>
        <span>📏 {formatDistance(segment.distance)}</span>
        {segment.average_heartrate !== null && (
          <>
            <span className="stat-sep">·</span>
            <span>❤️ {Math.round(segment.average_heartrate)} bpm</span>
          </>
        )}
      </div>

      {isExpanded && (
        <div className="history-container">
          {history === 'loading' && <p className="history-msg">Loading history…</p>}
          {history === 'error' && <p className="history-msg history-msg--error">Failed to load history.</p>}
          {Array.isArray(history) && history.length === 0 && (
            <p className="history-msg">No previous efforts found.</p>
          )}
          {Array.isArray(history) && history.length > 0 && (
            <HistoryPanel
              entries={history}
              currentEffortId={segment.id}
              sportType={sportType}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [activity, setActivity] = useState<ActivityData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [history, setHistory] = useState<Record<number, HistoryState>>({})
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>('starred')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const visibleSegments = useMemo(() => {
    if (!activity) return []
    return segmentFilter === 'starred'
      ? activity.segments.filter((s) => s.segment.starred)
      : activity.segments
  }, [activity, segmentFilter])

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  async function fetchActivity() {
    setLoading(true)
    setError(null)
    setExpandedId(null)
    setHistory({})
    try {
      const res = await fetch('/api/strava/latest-activity')
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setActivity(await res.json() as ActivityData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function toggleSegment(segment: SegmentData) {
    if (expandedId === segment.id) { setExpandedId(null); return }
    setExpandedId(segment.id)
    if (history[segment.segment.id]) return

    setHistory((h) => ({ ...h, [segment.segment.id]: 'loading' }))
    try {
      const res = await fetch(`/api/strava/segment/${segment.segment.id}/efforts`)
      if (!res.ok) throw new Error()
      const data = await res.json() as HistoryEntry[]
      setHistory((h) => ({ ...h, [segment.segment.id]: data }))
    } catch {
      setHistory((h) => ({ ...h, [segment.segment.id]: 'error' }))
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <h1 className="header-title">Strava Segments</h1>
          <button className="btn-fetch" onClick={fetchActivity} disabled={loading}>
            {loading ? 'Loading…' : 'Load latest activity'}
          </button>
        </div>
      </header>

      <main className="main">
        {error && <div className="error-banner"><strong>Error:</strong> {error}</div>}

        {!activity && !loading && !error && (
          <div className="empty-state">
            <p>Press "Load latest activity" to fetch your most recent Strava run.</p>
          </div>
        )}

        {activity && (
          <>
            <div className="activity-summary">
              <div className="activity-meta">
                <h2 className="activity-name">{activity.name}</h2>
                <span className="activity-date">{formatActivityDate(activity.start_date_local)}</span>
              </div>
              <div className="activity-stats">
                <div className="stat"><span className="stat-label">distance</span><span className="stat-value">{formatDistance(activity.distance)}</span></div>
                <div className="stat"><span className="stat-label">moving time</span><span className="stat-value">{formatTime(activity.moving_time)}</span></div>
                <div className="stat"><span className="stat-label">elevation</span><span className="stat-value">{Math.round(activity.total_elevation_gain)}m</span></div>
                {activity.average_heartrate !== null && (
                  <div className="stat"><span className="stat-label">avg hr</span><span className="stat-value">{Math.round(activity.average_heartrate)}</span></div>
                )}
                {activity.max_heartrate !== null && (
                  <div className="stat"><span className="stat-label">max hr</span><span className="stat-value">{Math.round(activity.max_heartrate)}</span></div>
                )}
              </div>
            </div>

            <div className="segments-section">
              <div className="segments-heading">
                <div className="segments-title-group">
                  <h3 className="segments-title">Segments</h3>
                  <span className="segments-count">{visibleSegments.length}</span>
                </div>
                <div className="filter-toggle">
                  <button
                    className={`filter-btn${segmentFilter === 'all' ? ' filter-btn--active' : ''}`}
                    onClick={() => setSegmentFilter('all')}
                  >All</button>
                  <button
                    className={`filter-btn${segmentFilter === 'starred' ? ' filter-btn--active' : ''}`}
                    onClick={() => setSegmentFilter('starred')}
                  >★ Starred</button>
                </div>
              </div>

              {visibleSegments.length === 0 ? (
                <p className="no-segments">
                  {segmentFilter === 'starred' ? 'No starred segments in this activity.' : 'No segments recorded for this activity.'}
                </p>
              ) : (
                <div className="segment-list">
                  {visibleSegments.map((seg) => (
                    <SegmentItem
                      key={seg.id}
                      segment={seg}
                      isExpanded={expandedId === seg.id}
                      history={history[seg.segment.id]}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      onToggle={() => toggleSegment(seg)}
                      sportType={activity.sport_type}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
