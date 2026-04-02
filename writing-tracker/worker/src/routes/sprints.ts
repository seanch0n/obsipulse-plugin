import { Hono } from 'hono'
import type { HonoEnv } from '../index'
import { hashToken } from '../lib/crypto'

const sprints = new Hono<HonoEnv>()

sprints.post('/', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'API key required' }, 401)
  }

  const apiKey = authHeader.slice(7)
  const keyHash = await hashToken(apiKey)

  const keyRow = await c.env.DB.prepare('SELECT user_id FROM api_keys WHERE key_hash = ?')
    .bind(keyHash)
    .first<{ user_id: string }>()

  if (!keyRow) return c.json({ error: 'Invalid API key' }, 401)

  const userId = keyRow.user_id

  const body = await c.req.json<{
    id?: string
    file_name?: string
    project?: string | null
    started_at?: number
    ended_at?: number
    duration_seconds?: number
    goal_duration_minutes?: number
    goal_words?: number
    words_written?: number
    location?: string | null
    completed?: boolean
  }>()

  const {
    id,
    file_name,
    project,
    started_at,
    ended_at,
    duration_seconds,
    goal_duration_minutes,
    goal_words,
    words_written,
    location,
    completed,
  } = body

  if (
    !id ||
    !file_name ||
    started_at == null ||
    ended_at == null ||
    duration_seconds == null ||
    goal_duration_minutes == null ||
    goal_words == null
  ) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  await c.env.DB.prepare(
    `
    INSERT INTO sprints (id, user_id, file_name, project, started_at, ended_at, duration_seconds, goal_duration_minutes, goal_words, words_written, location, completed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `
  )
    .bind(
      id,
      userId,
      file_name,
      project ?? null,
      started_at,
      ended_at,
      duration_seconds,
      goal_duration_minutes,
      goal_words,
      words_written ?? 0,
      location ?? null,
      completed ? 1 : 0
    )
    .run()

  return c.json({ ok: true })
})

sprints.get('/', async (c) => {
  const userId = c.get('userId')

  const yearParam = c.req.query('year')
  const monthParam = c.req.query('month')

  let rows

  if (yearParam && monthParam) {
    const year = parseInt(yearParam)
    const month = parseInt(monthParam)

    // Build ms boundaries for the month
    const startMs = new Date(year, month - 1, 1).getTime()
    const endMs = new Date(year, month, 1).getTime()

    rows = await c.env.DB.prepare(
      `
      SELECT * FROM sprints
      WHERE user_id = ? AND started_at >= ? AND started_at < ?
      ORDER BY started_at DESC
    `
    )
      .bind(userId, startMs, endMs)
      .all()
  } else {
    rows = await c.env.DB.prepare(
      `
      SELECT * FROM sprints
      WHERE user_id = ?
      ORDER BY started_at DESC
    `
    )
      .bind(userId)
      .all()
  }

  return c.json(rows.results)
})

sprints.put('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  const body = await c.req.json<{
    words_written?: number
    goal_words?: number
    goal_duration_minutes?: number
    location?: string | null
    completed?: boolean
  }>()

  const sprint = await c.env.DB.prepare('SELECT id FROM sprints WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first()
  if (!sprint) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare(
    `UPDATE sprints SET
      words_written = COALESCE(?, words_written),
      goal_words = COALESCE(?, goal_words),
      goal_duration_minutes = COALESCE(?, goal_duration_minutes),
      location = ?,
      completed = COALESCE(?, completed)
    WHERE id = ? AND user_id = ?`
  )
    .bind(
      body.words_written ?? null,
      body.goal_words ?? null,
      body.goal_duration_minutes ?? null,
      body.location !== undefined ? body.location : null,
      body.completed != null ? (body.completed ? 1 : 0) : null,
      id,
      userId
    )
    .run()

  return c.json({ ok: true })
})

sprints.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  await c.env.DB.prepare('DELETE FROM sprints WHERE id = ? AND user_id = ?').bind(id, userId).run()

  return c.json({ ok: true })
})

export default sprints
