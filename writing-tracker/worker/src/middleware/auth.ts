import type { Context, Next } from 'hono'
import type { HonoEnv } from '../index'

export async function sessionAuth(c: Context<HonoEnv>, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.slice(7)
  const now = Date.now()

  const session = await c.env.DB.prepare(
    'SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?'
  )
    .bind(token, now)
    .first<{ user_id: string }>()

  if (!session) {
    return c.json({ error: 'Invalid or expired session' }, 401)
  }

  c.set('userId', session.user_id)
  await next()
}
