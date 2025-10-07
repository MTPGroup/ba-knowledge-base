import dotenv from 'dotenv'
import { serve } from '@hono/node-server'
import { Scalar } from '@scalar/hono-api-reference'
import { createMarkdownFromOpenApi } from '@scalar/openapi-to-markdown'
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

app.get('llm.txt', async (c) => {
  const content = app.getOpenAPI31Document({
    openapi: '3.0.0',
    info: openAPIInfo,
    servers: servers,
    tags: tags,
  })

  const markdown = await createMarkdownFromOpenApi(JSON.stringify(content))
  return c.text(markdown)
})

// Scalar API Reference 页面
app.get(
  '/docs',
  Scalar({
    theme: 'purple',
    layout: 'modern',
    showSidebar: true,
    // @ts-ignore
    searchHotkey: 'k',
    hideDownloadButton: false,
    hideTestRequestButton: false,
    isEditable: false,
    metaData: {
      title: 'AI 角色聊天系统 API 文档',
      description: '基于 HonoJS 和 Better Auth 构建的 AI 角色聊天系统 API 文档',
      ogDescription: '探索我们强大的 AI 角色聊天 API',
      ogTitle: 'AI 角色聊天系统 API',
      twitterCard: 'summary_large_image',
    },
    sources: [
      { url: '/openapi.json', title: 'Main' },
      { url: '/api/auth/open-api/generate-schema', title: 'Auth' },
    ],
  }),
)

// 根路径
app.get('/', (c) => {
  return c.json({
    message: 'Welcome to the AI Character Chat API!',
    version: '1.0.0',
    docs: '/docs',
    openapi: '/openapi.json',
    documentation: 'Powered by Scalar API Reference',
    endpoints: [
      '/api/v1/auth/*',
      '/api/v1/character',
      '/api/v1/chat',
      '/api/v1/contact',
      '/api/v1/upload',
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
