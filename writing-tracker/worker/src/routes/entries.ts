import { Hono } from 'hono'
import type { HonoEnv } from '../index'

const entries = new Hono<HonoEnv>()

// GET /api/stats/entries?year=2026&month=3
// Returns rows for a given month, aggregated across devices
entries.get('/', async (c) => {
  const userId = c.get('userId')
  const year = c.req.query('year') ?? new Date().getFullYear().toString()
  const month = (c.req.query('month') ?? (new Date().getMonth() + 1).toString()).padStart(2, '0')

  const rows = await c.env.DB.prepare(
    `
    SELECT date, project, SUM(word_count) as word_count
    FROM daily_stats
    WHERE user_id = ? AND date LIKE ?
    GROUP BY date, project
    ORDER BY date DESC, project ASC
  `
  )
    .bind(userId, `${year}-${month}-%`)
    .all<{ date: string; project: string; word_count: number }>()

  return c.json(rows.results)
})

// POST /api/stats/entries — manually add or overwrite an entry
entries.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ date?: string; project?: string; word_count?: number }>()
  const { date, project, word_count } = body

  if (!date || !project || word_count == null) {
    return c.json({ error: 'date, project, and word_count are required' }, 400)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: 'date must be YYYY-MM-DD' }, 400)
  }

  // Manual entries use device='manual' so they don't conflict with plugin-synced rows
  const id = `${userId}:${date}:${project}:manual`
  await c.env.DB.prepare(
    `
    INSERT INTO daily_stats (id, user_id, date, project, device, word_count)
    VALUES (?, ?, ?, ?, 'manual', ?)
    ON CONFLICT(user_id, date, project, device) DO UPDATE SET word_count = excluded.word_count
  `
  )
    .bind(id, userId, date, project.trim(), Math.max(0, Math.round(word_count)))
    .run()

  return c.json({ ok: true }, 201)
})

// PUT /api/stats/entry — update an existing entry (date + project identify the row)
// Body: { date, project, newDate?, newProject?, word_count }
// When editing via the webapp, we consolidate all device rows into a single 'manual' row
entries.put('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    date: string
    project: string
    newDate?: string
    newProject?: string
    word_count: number
  }>()

  const { date, project, word_count } = body
  const newDate = body.newDate ?? date
  const newProject = body.newProject ?? project

  if (!date || !project || word_count == null) {
    return c.json({ error: 'date, project, and word_count are required' }, 400)
  }

  // Delete all device rows for the original date+project, then insert a single 'manual' row
  const newId = `${userId}:${newDate}:${newProject}:manual`
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM daily_stats WHERE user_id = ? AND date = ? AND project = ?').bind(
      userId,
      date,
      project
    ),
    c.env.DB.prepare(
      `
      INSERT INTO daily_stats (id, user_id, date, project, device, word_count)
      VALUES (?, ?, ?, ?, 'manual', ?)
      ON CONFLICT(user_id, date, project, device) DO UPDATE SET word_count = excluded.word_count
    `
    ).bind(newId, userId, newDate, newProject.trim(), Math.max(0, Math.round(word_count))),
  ])

  return c.json({ ok: true })
})

// DELETE /api/stats/entry?date=2026-03-14&project=GDDC
entries.delete('/', async (c) => {
  const userId = c.get('userId')
  const date = c.req.query('date')
  const project = c.req.query('project')

  if (!date || !project) return c.json({ error: 'date and project are required' }, 400)

  // Delete all device rows for this date+project
  const result = await c.env.DB.prepare(
    'DELETE FROM daily_stats WHERE user_id = ? AND date = ? AND project = ?'
  )
    .bind(userId, date, project)
    .run()

  if (result.meta.changes === 0) return c.json({ error: 'Entry not found' }, 404)
  return c.json({ ok: true })
})

export default entries
