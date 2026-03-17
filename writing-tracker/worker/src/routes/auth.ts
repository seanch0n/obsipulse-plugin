import { Hono } from 'hono'
import type { HonoEnv } from '../index'
import { hashPassword, verifyPassword, generateToken } from '../lib/crypto'
import { sendPasswordResetEmail } from '../lib/email'

const auth = new Hono<HonoEnv>()

auth.post('/register', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>()
  const { email, password } = body

  if (!email || !password) return c.json({ error: 'Email and password required' }, 400)
  if (password.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: 'Invalid email' }, 400)

  const normalizedEmail = email.toLowerCase().trim()
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(normalizedEmail)
    .first()
  if (existing) return c.json({ error: 'Email already registered' }, 409)

  const id = crypto.randomUUID()
  const passwordHash = await hashPassword(password)
  const now = Date.now()

  await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(id, normalizedEmail, passwordHash, now)
    .run()

  const token = generateToken()
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000

  await c.env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, id, expiresAt)
    .run()

  return c.json({ token }, 201)
})

auth.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>()
  const { email, password } = body

  if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

  const user = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ?')
    .bind(email.toLowerCase().trim())
    .first<{ id: string; password_hash: string }>()

  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const token = generateToken()
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000

  await c.env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, user.id, expiresAt)
    .run()

  return c.json({ token })
})

auth.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
  }
  return c.json({ ok: true })
})

auth.post('/forgot-password', async (c) => {
  const body = await c.req.json<{ email?: string }>()
  const { email } = body

  if (!email) return c.json({ error: 'Email required' }, 400)

  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email.toLowerCase().trim())
    .first<{ id: string }>()

  // Always return success to prevent email enumeration
  if (!user) return c.json({ ok: true })

  const token = generateToken()
  const expiresAt = Date.now() + 60 * 60 * 1000 // 1 hour

  await c.env.DB.prepare(
    'INSERT INTO reset_tokens (token, user_id, expires_at, used) VALUES (?, ?, ?, 0)'
  )
    .bind(token, user.id, expiresAt)
    .run()

  const resetUrl = `${c.env.APP_URL}/reset-password?token=${token}`

  try {
    await sendPasswordResetEmail(c.env, email, resetUrl)
  } catch (err) {
    console.error('Failed to send reset email:', err)
    // Still return ok — don't leak internal errors
  }

  return c.json({ ok: true })
})

auth.post('/reset-password', async (c) => {
  const body = await c.req.json<{ token?: string; password?: string }>()
  const { token, password } = body

  if (!token || !password) return c.json({ error: 'Token and password required' }, 400)
  if (password.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400)

  const now = Date.now()
  const resetToken = await c.env.DB.prepare(
    'SELECT user_id FROM reset_tokens WHERE token = ? AND expires_at > ? AND used = 0'
  )
    .bind(token, now)
    .first<{ user_id: string }>()

  if (!resetToken) return c.json({ error: 'Invalid or expired reset token' }, 400)

  const passwordHash = await hashPassword(password)

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(
      passwordHash,
      resetToken.user_id
    ),
    c.env.DB.prepare('UPDATE reset_tokens SET used = 1 WHERE token = ?').bind(token),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(resetToken.user_id),
  ])

  return c.json({ ok: true })
})

export default auth
