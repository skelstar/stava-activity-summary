import 'dotenv/config'
import express, { Request, Response } from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import cors from 'cors'

const __dirname = dirname(fileURLToPath(import.meta.url))

const isProd = process.env.NODE_ENV === 'production'

const app = express()
const PORT = isProd ? 3000 : 3001

if (!isProd) app.use(cors())
app.use(express.json())

let cachedAccessToken: string | null = null
let tokenExpiry = 0

async function getStravaAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiry) return cachedAccessToken
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = process.env
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_REFRESH_TOKEN) {
    throw new Error('Strava credentials not configured (STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN)')
  }
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      refresh_token: STRAVA_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Strava token refresh failed (${res.status}) — visit http://localhost:${PORT}/api/auth/strava to authorise`)
  const data = await res.json() as { access_token: string; expires_at: number; refresh_token: string }
  cachedAccessToken = data.access_token
  tokenExpiry = data.expires_at * 1000

  // Persist the new refresh token so the .env file stays current after rotation
  if (data.refresh_token && data.refresh_token !== STRAVA_REFRESH_TOKEN) {
    process.env.STRAVA_REFRESH_TOKEN = data.refresh_token
    persistRefreshToken(data.refresh_token)
  }

  return cachedAccessToken
}

function persistRefreshToken(newToken: string) {
  const envPath = join(__dirname, '.env')
  try {
    const current = readFileSync(envPath, 'utf8')
    const updated = current.replace(
      /^STRAVA_REFRESH_TOKEN=.*/m,
      `STRAVA_REFRESH_TOKEN=${newToken}`,
    )
    writeFileSync(envPath, updated, 'utf8')
  } catch {
    // .env missing or unreadable — not fatal
  }
}

interface StravaSegment {
  id: number
  name: string
  activity_type: string
  distance: number
  average_grade: number
  maximum_grade: number
  elevation_high: number
  elevation_low: number
  climb_category: number
}

interface StravaSegmentEffort {
  id: number
  name: string
  elapsed_time: number
  moving_time: number
  start_date_local: string
  distance: number
  average_heartrate?: number
  max_heartrate?: number
  average_watts?: number
  pr_rank: number | null
  achievements: Array<{ type_id: number; type: string; rank: number }>
  segment: StravaSegment
}

interface StravaDetailedActivity {
  id: number
  name: string
  distance: number
  moving_time: number
  elapsed_time: number
  total_elevation_gain: number
  type: string
  sport_type: string
  start_date_local: string
  average_heartrate?: number
  max_heartrate?: number
  average_speed: number
  max_speed: number
  segment_efforts: StravaSegmentEffort[]
}

app.get('/api/version', (_req: Request, res: Response) => {
  res.json({ version: process.env.VERSION ?? 'dev' })
})

// OAuth step 1: redirect user to Strava authorization page
app.get('/api/auth/strava', (req: Request, res: Response) => {
  const clientId = process.env.STRAVA_CLIENT_ID
  if (!clientId) { res.status(500).send('STRAVA_CLIENT_ID not set in .env'); return }
  const redirectUri = `http://localhost:${PORT}/api/auth/callback`
  const url = new URL('https://www.strava.com/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('approval_prompt', 'auto')
  url.searchParams.set('scope', 'activity:read_all')
  res.redirect(url.toString())
})

// OAuth step 2: Strava redirects here with ?code=... exchange it for tokens
app.get('/api/auth/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query as { code?: string; error?: string }
  if (error || !code) {
    res.status(400).send(`Strava auth error: ${error ?? 'no code returned'}`)
    return
  }
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } = process.env
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    res.status(500).send('STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET not set in .env')
    return
  }
  try {
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) { res.status(502).send(`Token exchange failed: ${tokenRes.status}`); return }
    const data = await tokenRes.json() as { refresh_token: string; access_token: string; athlete?: { firstname: string; lastname: string } }
    const { refresh_token, athlete } = data
    const name = athlete ? `${athlete.firstname} ${athlete.lastname}` : 'unknown'
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Strava Auth Success</title>
        <style>
          body { font-family: monospace; background: #faf5f2; color: #1a0f0a; padding: 40px; }
          h2 { color: #fc4c02; margin-bottom: 16px; }
          .token { background: #fff; border: 1px solid #f0d9cc; border-radius: 8px; padding: 16px; word-break: break-all; margin: 12px 0; }
          .note { color: #7a5a4e; margin-top: 20px; font-size: 0.9em; }
        </style>
        </head>
        <body>
          <h2>Authorised as ${name}</h2>
          <p>Add this to your <strong>server/.env</strong> file:</p>
          <div class="token">STRAVA_REFRESH_TOKEN=${refresh_token}</div>
          <p class="note">Then restart the dev server — you won't need to auth again unless you revoke access.</p>
        </body>
      </html>
    `)
  } catch (err) {
    res.status(500).send(`Error: ${err instanceof Error ? err.message : 'Unknown'}`)
  }
})

app.get('/api/strava/latest-activity', async (_req: Request, res: Response) => {
  try {
    const token = await getStravaAccessToken()

    // Get the most recent activity (summary)
    const listRes = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=1', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!listRes.ok) { res.status(502).json({ error: `Strava API error: ${listRes.status}` }); return }
    const activities = await listRes.json() as Array<{ id: number }>
    if (!activities.length) { res.status(404).json({ error: 'No activities found' }); return }

    const activityId = activities[0].id

    // Get full activity detail (includes segment_efforts)
    const detailRes = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!detailRes.ok) { res.status(502).json({ error: `Strava activity detail error: ${detailRes.status}` }); return }
    const activity = await detailRes.json() as StravaDetailedActivity

    const segments = (activity.segment_efforts ?? []).map((effort) => ({
      id: effort.id,
      name: effort.name,
      elapsed_time: effort.elapsed_time,
      moving_time: effort.moving_time,
      distance: effort.distance,
      average_heartrate: effort.average_heartrate ?? null,
      max_heartrate: effort.max_heartrate ?? null,
      average_watts: effort.average_watts ?? null,
      pr_rank: effort.pr_rank,
      achievements: effort.achievements ?? [],
      segment: {
        id: effort.segment.id,
        climb_category: effort.segment.climb_category,
        average_grade: effort.segment.average_grade,
        elevation_high: effort.segment.elevation_high,
        elevation_low: effort.segment.elevation_low,
      },
    }))

    res.json({
      id: activity.id,
      name: activity.name,
      sport_type: activity.sport_type,
      start_date_local: activity.start_date_local,
      distance: activity.distance,
      moving_time: activity.moving_time,
      elapsed_time: activity.elapsed_time,
      total_elevation_gain: activity.total_elevation_gain,
      average_heartrate: activity.average_heartrate ?? null,
      max_heartrate: activity.max_heartrate ?? null,
      segments,
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

if (isProd) {
  const clientDist = join(__dirname, '..', 'client', 'dist')
  app.use(express.static(clientDist))
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(join(clientDist, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
