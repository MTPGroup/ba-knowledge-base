import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { chat } from './routes/chats'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { auth } from './lib/auth'

const app = new Hono()

app.use('*', logger())
app.use(
  '*',
  cors({
    origin: ['http://localhost:3001', 'https://api.shirabe.cn'],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  }),
)
app.use('*', async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (!session) {
    // @ts-ignore
    c.set('user', null)
    // @ts-ignore
    c.set('session', null)
    return next()
  }

  // @ts-ignore
  c.set('user', session.user)
  // @ts-ignore
  c.set('session', session.session)
  return next()
})

app.on(['POST', 'GET'], '/api/auth/**', (c) => auth.handler(c.req.raw))

app.get('/', (c) => {
  return c.text('Hello, welcome to the AI Character Chat API!')
})

app.route('/api/chat', chat)

serve({
  fetch: app.fetch,
  port: 3001,
})
