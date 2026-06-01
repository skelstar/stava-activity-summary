import { useState } from 'react'
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

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(2)} km`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NZ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function climbCategoryLabel(cat: number): string | null {
  if (cat === 0) return null
  const labels: Record<number, string> = { 1: 'Cat 4', 2: 'Cat 3', 3: 'Cat 2', 4: 'Cat 1', 5: 'HC' }
  return labels[cat] ?? null
}

function SegmentCard({ segment }: { segment: SegmentData }) {
  const isPR = segment.pr_rank === 1
  const climbLabel = climbCategoryLabel(segment.segment.climb_category)
  const hasAchievement = segment.achievements.length > 0

  return (
    <div className={`segment-card${isPR ? ' segment-card--pr' : ''}`}>
      <div className="segment-header">
        <span className="segment-name">{segment.name}</span>
        <div className="segment-badges">
          {climbLabel && <span className="badge badge--climb">{climbLabel}</span>}
          {isPR && <span className="badge badge--pr">PR</span>}
          {hasAchievement && !isPR && <span className="badge badge--trophy">trophy</span>}
        </div>
      </div>

      <div className="segment-stats">
        <div className="stat">
          <span className="stat-label">time</span>
          <span className="stat-value">{formatTime(segment.elapsed_time)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">dist</span>
          <span className="stat-value">{formatDistance(segment.distance)}</span>
        </div>
        {segment.segment.average_grade !== undefined && (
          <div className="stat">
            <span className="stat-label">grade</span>
            <span className="stat-value">{segment.segment.average_grade.toFixed(1)}%</span>
          </div>
        )}
        {segment.average_heartrate !== null && (
          <div className="stat">
            <span className="stat-label">avg hr</span>
            <span className="stat-value">{Math.round(segment.average_heartrate)}</span>
          </div>
        )}
        {segment.max_heartrate !== null && (
          <div className="stat">
            <span className="stat-label">max hr</span>
            <span className="stat-value">{Math.round(segment.max_heartrate)}</span>
          </div>
        )}
        {segment.average_watts !== null && (
          <div className="stat">
            <span className="stat-label">power</span>
            <span className="stat-value">{Math.round(segment.average_watts)}w</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [activity, setActivity] = useState<ActivityData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchActivity() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/strava/latest-activity')
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as ActivityData
      setActivity(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <h1 className="header-title">Strava Segments</h1>
          <button
            className="btn-fetch"
            onClick={fetchActivity}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Load latest activity'}
          </button>
        </div>
      </header>

      <main className="main">
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {!activity && !loading && !error && (
          <div className="empty-state">
            <p>Press "Load latest activity" to fetch your most recent Strava ride.</p>
          </div>
        )}

        {activity && (
          <>
            <div className="activity-summary">
              <div className="activity-meta">
                <h2 className="activity-name">{activity.name}</h2>
                <span className="activity-date">{formatDate(activity.start_date_local)}</span>
              </div>
              <div className="activity-stats">
                <div className="stat">
                  <span className="stat-label">distance</span>
                  <span className="stat-value">{formatDistance(activity.distance)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">moving time</span>
                  <span className="stat-value">{formatTime(activity.moving_time)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">elevation</span>
                  <span className="stat-value">{Math.round(activity.total_elevation_gain)}m</span>
                </div>
                {activity.average_heartrate !== null && (
                  <div className="stat">
                    <span className="stat-label">avg hr</span>
                    <span className="stat-value">{Math.round(activity.average_heartrate)}</span>
                  </div>
                )}
                {activity.max_heartrate !== null && (
                  <div className="stat">
                    <span className="stat-label">max hr</span>
                    <span className="stat-value">{Math.round(activity.max_heartrate)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="segments-section">
              <div className="segments-heading">
                <h3 className="segments-title">Segments</h3>
                <span className="segments-count">{activity.segments.length}</span>
              </div>

              {activity.segments.length === 0 ? (
                <p className="no-segments">No segments recorded for this activity.</p>
              ) : (
                <div className="segments-list">
                  {activity.segments.map((seg) => (
                    <SegmentCard key={seg.id} segment={seg} />
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
