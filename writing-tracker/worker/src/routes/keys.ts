import { Hono } from 'hono'
import type { HonoEnv } from '../index'
import { generateApiKey, hashToken } from '../lib/crypto'

const keys = new Hono<HonoEnv>()

keys.get('/', async (c) => {
  const userId = c.get('userId')
  const rows = await c.env.DB.prepare(
    'SELECT id, key_prefix, name, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(userId)
    .all<{ id: string; key_prefix: string; name: string; created_at: number }>()

  return c.json(rows.results)
})

keys.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ name?: string }>().catch(() => ({}))
  const name = body.name?.trim() || 'Default'

  const key = generateApiKey()
  const keyHash = await hashToken(key)
  const keyPrefix = key.slice(0, 10)
  const id = crypto.randomUUID()
  const now = Date.now()

  await c.env.DB.prepare(
    'INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(id, userId, keyHash, keyPrefix, name, now)
    .run()

  // Return the full key ONCE — it cannot be retrieved again
  return c.json({ id, key, keyPrefix, name, created_at: now }, 201)
})

keys.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  const result = await c.env.DB.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run()

  if (result.meta.changes === 0) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

export default keys
