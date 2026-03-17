import { Hono } from 'hono'
import type { HonoEnv } from '../index'

const targets = new Hono<HonoEnv>()

targets.get('/', async (c) => {
  const userId = c.get('userId')
  const row = await c.env.DB.prepare('SELECT monthly_target FROM targets WHERE user_id = ?')
    .bind(userId)
    .first<{ monthly_target: number }>()

  return c.json({ monthly_target: row?.monthly_target ?? 0 })
})

targets.put('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ monthly_target?: number }>()
  const monthly = Math.max(0, Math.round(body.monthly_target ?? 0))

  await c.env.DB.prepare(
    `
    INSERT INTO targets (user_id, monthly_target, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET monthly_target = excluded.monthly_target, updated_at = excluded.updated_at
  `
  )
    .bind(userId, monthly, Date.now())
    .run()

  return c.json({ monthly_target: monthly })
})

export default targets
