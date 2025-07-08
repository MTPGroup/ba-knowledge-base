import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { chat } from '@/routes/chat'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { auth } from '@/lib/auth'
import { character } from '@/routes/character'
import { betterAuth } from '@/middlewares/auth'
import { contact } from './routes/contact'
import { checkpointer } from './graph/builder'

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
app.use('*', betterAuth)

app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))

app.get('/', (c) => {
  return c.text('Hello, welcome to the AI Character Chat API!')
})

app.route('/api/chat', chat)
app.route('/api/character', character)
app.route('/api/contact', contact)

checkpointer.setup()

serve({
  fetch: app.fetch,
  port: 3001,
})
