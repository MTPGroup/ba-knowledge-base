import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { chat } from './routes/chats'
import dotenv from 'dotenv'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const app = new Hono()

app.use('*', logger())
app.use('*', cors())

app.get('/', (c) => {
  return c.text('Hello, welcome to the AI Character Chat API!')
})

app.route('/chat', chat)

serve({
  fetch: app.fetch,
  port: 3001,
})
