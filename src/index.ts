import dotenv from 'dotenv'
import { serve } from '@hono/node-server'
// import { Scalar } from '@scalar/hono-api-reference'
import { swaggerUI } from '@hono/swagger-ui'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { auth } from '@/lib/auth'
import { betterAuth } from '@/middlewares/auth'
import { checkpointer } from '@/graph/builder'
import { createOpenAPIApp, openAPIInfo, servers, tags } from '@/lib/openapi'
import { charactersOpenAPI } from '@/routes/characters'
import { chatOpenAPI } from '@/routes/chats'
import { uploadOpenAPI } from '@/routes/uploads'
import { messageOpenAPI } from '@/routes/messages'
import { contactOpenAPI } from '@/routes/contacts'

dotenv.config()

// 创建主应用和 OpenAPI 应用
const app = createOpenAPIApp()

app.use('*', logger())
app.use(
  '*',
  cors({
    origin: ['http://localhost:3001', 'https://api.shirabe.cn'],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  }),
)
app.use('*', betterAuth)

app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))

// OpenAPI 文档配置 - 添加错误处理
app.get('/openapi.json', async (c) => {
  try {
    console.log('请求 /openapi.json...')
    const openAPIDoc = app.getOpenAPI31Document({
      openapi: '3.0.0',
      info: openAPIInfo,
      servers: servers,
      tags: tags,
    })
    console.log('✓ OpenAPI 文档生成成功')
    return c.json(openAPIDoc)
  } catch (error: any) {
    console.error('生成 OpenAPI 文档时出错:', error)
    console.error('错误堆栈:', error.stack)
    return c.json(
      {
        error: 'Internal Server Error',
        message: '生成 OpenAPI 文档失败',
        details: error.message,
      },
      500,
    )
  }
})

// app.get('/scalar', Scalar({ url: '/doc' }))

// Swagger UI 页面
app.get(
  '/docs',
  swaggerUI({
    url: '/openapi.json',
  }),
)

// 根路径
app.get('/', (c) => {
  return c.json({
    message: 'Welcome to the AI Character Chat API!',
    version: '1.0.0',
    docs: '/docs',
    openapi: '/openapi.json',
    endpoints: [
      '/api/auth/*',
      '/api/character',
      '/api/chat',
      '/api/contact',
      '/api/upload',
    ],
  })
})

// 挂载所有 OpenAPI 路由
app.route('/', charactersOpenAPI)
app.route('/', chatOpenAPI)
app.route('/', uploadOpenAPI)
app.route('/', messageOpenAPI)
app.route('/', contactOpenAPI)

checkpointer.setup()
serve({
  fetch: app.fetch,
  port: 3001,
})
