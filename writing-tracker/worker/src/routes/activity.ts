import { Hono } from 'hono'
import type { HonoEnv } from '../index'

const activity = new Hono<HonoEnv>()

// GET /api/activity?year=2026&month=3
activity.get('/', async (c) => {
  const userId = c.get('userId')
  const year = c.req.query('year') ?? new Date().getFullYear().toString()
  const month = (c.req.query('month') ?? (new Date().getMonth() + 1).toString()).padStart(2, '0')

  const rows = await c.env.DB.prepare(
    `
    SELECT date, project, writing, editing, planning
    FROM daily_activity
    WHERE user_id = ? AND date LIKE ?
    ORDER BY date, project
  `
  )
    .bind(userId, `${year}-${month}-%`)
    .all<{
      date: string
      project: string
      writing: number
      editing: number
      planning: number
    }>()

  return c.json(
    rows.results.map((r) => ({
      date: r.date,
      project: r.project,
      writing: r.writing === 1,
      editing: r.editing === 1,
      planning: r.planning === 1,
    }))
  )
})

// PUT /api/activity — upsert or delete an entry
// If all three flags are false, the row is deleted.
activity.put('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    date: string
    project: string
    writing: boolean
    editing: boolean
    planning: boolean
  }>()
  const { date, project, writing, editing, planning } = body

  if (!date || !project) return c.json({ error: 'date and project required' }, 400)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400)

  if (!writing && !editing && !planning) {
    await c.env.DB.prepare(
      'DELETE FROM daily_activity WHERE user_id = ? AND date = ? AND project = ?'
    )
      .bind(userId, date, project)
      .run()
  } else {
    const id = `${userId}:${date}:${project}`
    await c.env.DB.prepare(
      `
      INSERT INTO daily_activity (id, user_id, date, project, writing, editing, planning)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date, project) DO UPDATE SET
        writing = excluded.writing,
        editing = excluded.editing,
        planning = excluded.planning
    `
    )
      .bind(id, userId, date, project, writing ? 1 : 0, editing ? 1 : 0, planning ? 1 : 0)
      .run()
  }

  return c.json({ ok: true })
})

export default activity
