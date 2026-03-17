import { Hono } from 'hono'
import { cors } from 'hono/cors'
import auth from './routes/auth'
import keys from './routes/keys'
import sync from './routes/sync'
import stats from './routes/stats'
import targets from './routes/targets'
import entries from './routes/entries'
import activity from './routes/activity'
import goals from './routes/goals'
import sprints from './routes/sprints'
import { sessionAuth } from './middleware/auth'

export type Env = {
  DB: D1Database
  APP_URL: string
  FROM_EMAIL: string
  RESEND_API_KEY: string
}

export type HonoEnv = {
  Bindings: Env
  Variables: {
    userId: string
  }
}

const app = new Hono<HonoEnv>()

app.use(
  '*',
  cors({
    origin: (origin) => origin ?? '*',
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    maxAge: 86400,
  })
)

// Public routes
app.route('/api/auth', auth)

// Plugin sync — uses API key auth (handled inside the route)
app.route('/api/sync', sync)

// Protected routes — require session token
app.use('/api/keys/*', sessionAuth)
app.use('/api/stats/*', sessionAuth)
app.use('/api/targets/*', sessionAuth)
app.use('/api/entries/*', sessionAuth)
app.use('/api/entry/*', sessionAuth)
app.use('/api/activity/*', sessionAuth)
app.use('/api/goals/*', sessionAuth)

app.route('/api/keys', keys)
app.route('/api/stats', stats)
app.route('/api/targets', targets)
app.route('/api/entries', entries)
app.route('/api/entry', entries)
app.route('/api/activity', activity)
app.route('/api/goals', goals)

// Sprints — POST uses API key auth (handled inside route), GET uses session auth
app.use('/api/sprints/*', async (c, next) => {
  if (c.req.method === 'GET') {
    return sessionAuth(c, next)
  }
  return next()
})
app.route('/api/sprints', sprints)

app.get('/health', (c) => c.json({ ok: true }))

export default app
