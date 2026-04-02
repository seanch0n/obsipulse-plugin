import { Hono } from 'hono'
import type { HonoEnv } from '../index'
import { hashToken } from '../lib/crypto'

const sync = new Hono<HonoEnv>()

sync.post('/', async (c) => {
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
    date?: string
    device?: string
    projects?: Record<string, number>
  }>()
  const { date, projects } = body
  const device = body.device || 'default'

  if (!date || !projects || typeof projects !== 'object') {
    return c.json({ error: 'date and projects are required' }, 400)
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: 'date must be YYYY-MM-DD' }, 400)
  }

  const statements = Object.entries(projects).map(([project, wordCount]) => {
    const id = `${userId}:${date}:${project}:${device}`
    return c.env.DB.prepare(
      `
      INSERT INTO daily_stats (id, user_id, date, project, device, word_count)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date, project, device) DO UPDATE SET word_count = excluded.word_count
    `
    ).bind(id, userId, date, project, device, Math.max(0, Math.round(wordCount)))
  })

  if (statements.length > 0) {
    await c.env.DB.batch(statements)
  }

  return c.json({ ok: true })
})

export default sync
