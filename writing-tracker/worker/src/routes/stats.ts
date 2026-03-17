import { Hono } from 'hono'
import type { HonoEnv } from '../index'

const stats = new Hono<HonoEnv>()

// GET /api/stats/daily?year=2026&month=3
// Returns [{date, words}] summed across all projects for that month
stats.get('/daily', async (c) => {
  const userId = c.get('userId')
  const year = c.req.query('year') ?? new Date().getFullYear().toString()
  const month = (c.req.query('month') ?? (new Date().getMonth() + 1).toString()).padStart(2, '0')
  const prefix = `${year}-${month}-%`

  const rows = await c.env.DB.prepare(
    `
    SELECT date, SUM(word_count) as words
    FROM daily_stats
    WHERE user_id = ? AND date LIKE ?
    GROUP BY date
    ORDER BY date
  `
  )
    .bind(userId, prefix)
    .all<{ date: string; words: number }>()

  return c.json(rows.results)
})

// GET /api/stats/projects?year=2026&month=3
// Returns [{project, words}] summed across the month
stats.get('/projects', async (c) => {
  const userId = c.get('userId')
  const year = c.req.query('year') ?? new Date().getFullYear().toString()
  const month = (c.req.query('month') ?? (new Date().getMonth() + 1).toString()).padStart(2, '0')
  const prefix = `${year}-${month}-%`

  const rows = await c.env.DB.prepare(
    `
    SELECT project, SUM(word_count) as words
    FROM daily_stats
    WHERE user_id = ? AND date LIKE ?
    GROUP BY project
    ORDER BY words DESC
  `
  )
    .bind(userId, prefix)
    .all<{ project: string; words: number }>()

  return c.json(rows.results)
})

// GET /api/stats/yearly?year=2026
// Returns [{month, words}] for all months of the year (1-indexed)
stats.get('/yearly', async (c) => {
  const userId = c.get('userId')
  const year = c.req.query('year') ?? new Date().getFullYear().toString()

  const rows = await c.env.DB.prepare(
    `
    SELECT CAST(strftime('%m', date) AS INTEGER) as month, SUM(word_count) as words
    FROM daily_stats
    WHERE user_id = ? AND date LIKE ?
    GROUP BY month
    ORDER BY month
  `
  )
    .bind(userId, `${year}-%`)
    .all<{ month: number; words: number }>()

  // Fill in all 12 months (missing months = 0 words)
  const byMonth: Record<number, number> = {}
  rows.results.forEach((r) => {
    byMonth[r.month] = r.words
  })

  const result = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    words: byMonth[i + 1] ?? 0,
  }))

  return c.json(result)
})

// GET /api/stats/project-names — all distinct project names for this user
stats.get('/project-names', async (c) => {
  const userId = c.get('userId')
  const rows = await c.env.DB.prepare(
    `
    SELECT DISTINCT project FROM daily_stats WHERE user_id = ? ORDER BY project ASC
  `
  )
    .bind(userId)
    .all<{ project: string }>()
  return c.json(rows.results.map((r) => r.project))
})

export default stats
