import { Hono } from 'hono'
import type { HonoEnv } from '../index'

const goals = new Hono<HonoEnv>()

// GET /api/goals?year=2026&month=3
// Returns all stored goals for the given month (daily, weekly, monthly)
goals.get('/', async (c) => {
  const userId = c.get('userId')
  const year = c.req.query('year') ?? new Date().getFullYear().toString()
  const month = (c.req.query('month') ?? (new Date().getMonth() + 1).toString()).padStart(2, '0')
  const monthKey = `${year}-${month}`

  const rows = await c.env.DB.prepare(
    `
    SELECT period_type, period_key, target FROM goals
    WHERE user_id = ? AND (
      (period_type = 'daily'   AND period_key LIKE ?) OR
      (period_type = 'weekly'  AND period_key LIKE ?) OR
      (period_type = 'monthly' AND period_key = ?)
    )
    ORDER BY period_type, period_key
  `
  )
    .bind(userId, `${monthKey}-%`, `${monthKey}-W%`, monthKey)
    .all<{ period_type: string; period_key: string; target: number }>()

  return c.json(rows.results)
})

// PUT /api/goals — upsert a goal
// Body: { period_type: 'daily'|'weekly'|'monthly', period_key: string, target: number }
// period_key formats:
//   daily:   '2026-03-09'
//   weekly:  '2026-03-W2'
//   monthly: '2026-03'
goals.put('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ period_type: string; period_key: string; target: number }>()
  const { period_type, period_key, target } = body

  if (!['daily', 'weekly', 'monthly'].includes(period_type)) {
    return c.json({ error: 'period_type must be daily, weekly, or monthly' }, 400)
  }
  if (!period_key) return c.json({ error: 'period_key required' }, 400)
  if (typeof target !== 'number' || target < 0) {
    return c.json({ error: 'target must be a non-negative number' }, 400)
  }

  const id = `${userId}:${period_type}:${period_key}`
  await c.env.DB.prepare(
    `
    INSERT INTO goals (id, user_id, period_type, period_key, target)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, period_type, period_key) DO UPDATE SET target = excluded.target
  `
  )
    .bind(id, userId, period_type, period_key, Math.round(target))
    .run()

  return c.json({ ok: true })
})

// DELETE /api/goals?period_type=daily&period_key=2026-03-09
goals.delete('/', async (c) => {
  const userId = c.get('userId')
  const period_type = c.req.query('period_type')
  const period_key = c.req.query('period_key')

  if (!period_type || !period_key) {
    return c.json({ error: 'period_type and period_key required' }, 400)
  }

  await c.env.DB.prepare(
    'DELETE FROM goals WHERE user_id = ? AND period_type = ? AND period_key = ?'
  )
    .bind(userId, period_type, period_key)
    .run()

  return c.json({ ok: true })
})

export default goals
