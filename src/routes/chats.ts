import { z } from '@hono/zod-openapi'
import {
  createOpenAPIApp,
  createAuthenticatedRoute,
  ChatSchema,
  CreateChatSchema,
  UpdateChatSchema,
  SuccessResponseSchema,
  commonResponses,
} from '@/lib/openapi'
import { Variables } from '@/lib/auth'
import { db } from '@/lib/database'
import { chat as ct, user } from '~/db/index'
import { and, eq, sql } from 'drizzle-orm'

export const chatOpenAPI = createOpenAPIApp()

// 创建聊天会话路由
const createChatRoute = createAuthenticatedRoute({
  method: 'post',
  path: '/api/chat/create',
  tags: ['Chats'],
  summary: '创建聊天会话',
  description: '为指定 AI 角色创建新的聊天会话',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateChatSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: '聊天会话创建成功',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              message: z.string(),
            }),
          ),
        },
      },
    },
    409: {
      description: '聊天会话已存在',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              existingChatId: z.string(),
              existingChatTitle: z.string(),
            }),
          ),
        },
      },
    },
    ...commonResponses,
  },
})

chatOpenAPI.openapi(createChatRoute, async (c) => {
  const body = await c.req.json()
  const { characterId, title, avatarUrl, description } = body

  const session = c.get('session')
  if (!session) {
    return c.json(
      {
        success: false,
        error: {
          message: '未授权的访问',
          code: 'UNAUTHORIZED',
        },
        timestamp: new Date().toISOString(),
      },
      401,
    )
  }

  try {
    const existingChat = await db.query.chat.findFirst({
      where: and(
        eq(ct.creatorId, session.user.id),
        eq(ct.characterId, characterId),
      ),
    })

    if (existingChat) {
      return c.json(
        {
          success: false,
          error: {
            message: '聊天会话已存在',
            code: 'CHAT_EXISTS',
          },
          data: {
            existingChatId: existingChat.id,
            existingChatTitle: existingChat.title,
          },
          timestamp: new Date().toISOString(),
        },
        409,
      )
    }

    await db
      .insert(ct)
      .values({
        creatorId: session.user.id,
        characterId,
        title,
        description,
        avatarUrl,
        lastMessage: '',
      })
      .returning()

    return c.json(
      {
        success: true,
        message: '聊天会话创建成功',
        data: { message: '聊天会话创建成功' },
        timestamp: new Date().toISOString(),
      },
      201,
    )
  } catch (error) {
    console.error('创建聊天会话时出错:', error)
    return c.json(
      {
        success: false,
        error: {
          message: '创建聊天会话时出错',
          code: 'INTERNAL_SERVER_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

// 获取聊天会话详情路由
const getChatDetailRoute = createAuthenticatedRoute({
  method: 'get',
  path: '/api/chat/detail/{chatId}',
  tags: ['Chats'],
  summary: '获取聊天会话详情',
  description: '获取指定聊天会话的详细信息，包含关联的 AI 角色信息',
  request: {
    params: z.object({
      chatId: z.string().min(1, '聊天会话ID不能为空'),
    }),
  },
  responses: {
    200: {
      description: '成功获取聊天会话详情',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ChatSchema),
        },
      },
    },
    ...commonResponses,
  },
})

chatOpenAPI.openapi(getChatDetailRoute, async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json(
      {
        success: false,
        error: {
          message: '未授权的访问',
          code: 'UNAUTHORIZED',
        },
        timestamp: new Date().toISOString(),
      },
      401,
    )
  }

  const id = c.req.param('id')
  if (!id) {
    return c.json(
      {
        success: false,
        error: {
          message: '聊天会话ID不能为空',
          code: 'BAD_REQUEST',
        },
        timestamp: new Date().toISOString(),
      },
      400,
    )
  }

  try {
    const chat = await db.query.chat.findFirst({
      where: and(eq(ct.id, id), eq(ct.creatorId, session.user.id)),
      with: {
        character: true,
      },
    })

    if (!chat) {
      return c.json(
        {
          success: false,
          error: {
            message: '聊天会话不存在或无权访问',
            code: 'NOT_FOUND',
          },
          timestamp: new Date().toISOString(),
        },
        404,
      )
    }

    return c.json({
      success: true,
      message: '获取聊天会话详情成功',
      data: chat,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('获取聊天会话信息时出错:', error)
    return c.json(
      {
        success: false,
        error: {
          message: '获取聊天会话信息时出错',
          code: 'INTERNAL_SERVER_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

// 获取聊天会话列表路由
const getChatListRoute = createAuthenticatedRoute({
  method: 'get',
  path: '/api/chat/list',
  tags: ['Chats'],
  summary: '获取聊天会话列表',
  description: '获取当前用户的所有聊天会话列表',
  responses: {
    200: {
      description: '成功获取聊天会话列表',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              chats: z.array(ChatSchema),
            }),
          ),
        },
      },
    },
    ...commonResponses,
  },
})

chatOpenAPI.openapi(getChatListRoute, async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json(
      {
        success: false,
        error: {
          message: '未授权的访问',
          code: 'UNAUTHORIZED',
        },
        timestamp: new Date().toISOString(),
      },
      401,
    )
  }

  try {
    const userWithChats = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      with: {
        chats: true,
      },
    })

    if (!userWithChats) {
      return c.json({
        success: true,
        message: '获取聊天会话列表成功',
        data: { chats: [] },
        timestamp: new Date().toISOString(),
      })
    }

    return c.json({
      success: true,
      message: '获取聊天会话列表成功',
      data: { chats: userWithChats.chats },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('获取聊天会话列表时出错:', error)
    return c.json(
      {
        success: false,
        error: {
          message: '获取聊天会话列表时出错',
          code: 'INTERNAL_SERVER_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

// 更新聊天会话路由
const updateChatRoute = createAuthenticatedRoute({
  method: 'post',
  path: '/api/chat/update/{chatId}',
  tags: ['Chats'],
  summary: '更新聊天会话信息',
  description: '更新聊天会话的标题、头像和描述信息',
  request: {
    params: z.object({
      chatId: z.string().min(1, '聊天会话ID不能为空'),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateChatSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: '聊天会话更新成功',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              message: z.string(),
            }),
          ),
        },
      },
    },
    ...commonResponses,
  },
})

chatOpenAPI.openapi(updateChatRoute, async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json(
      {
        success: false,
        error: {
          message: '未授权的访问',
          code: 'UNAUTHORIZED',
        },
        timestamp: new Date().toISOString(),
      },
      401,
    )
  }

  const id = c.req.param('id')
  if (!id) {
    return c.json(
      {
        success: false,
        error: {
          message: '聊天会话ID不能为空',
          code: 'BAD_REQUEST',
        },
        timestamp: new Date().toISOString(),
      },
      400,
    )
  }

  const body = await c.req.json()
  const { title, avatarUrl, description } = body

  try {
    const updatedChat = await db
      .update(ct)
      .set({
        title,
        avatarUrl,
        description,
        updatedAt: new Date(),
      })
      .where(and(eq(ct.id, id), eq(ct.creatorId, session.user.id)))
      .returning()

    if (updatedChat.length === 0) {
      return c.json(
        {
          success: false,
          error: {
            message: '聊天会话不存在或无权更新',
            code: 'FORBIDDEN',
          },
          timestamp: new Date().toISOString(),
        },
        403,
      )
    }

    return c.json({
      success: true,
      message: '聊天会话更新成功',
      data: { message: '聊天会话更新成功' },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('更新聊天会话时出错:', error)
    return c.json(
      {
        success: false,
        error: {
          message: '更新聊天会话时出错',
          code: 'INTERNAL_SERVER_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

// 删除聊天会话路由
const deleteChatRoute = createAuthenticatedRoute({
  method: 'delete',
  path: '/api/chat/delete/{chatId}',
  tags: ['Chats'],
  summary: '删除聊天会话',
  description: '删除指定的聊天会话及其所有消息和检查点数据',
  request: {
    params: z.object({
      chatId: z.string().min(1, '聊天会话ID不能为空'),
    }),
  },
  responses: {
    200: {
      description: '聊天会话删除成功',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              message: z.string(),
            }),
          ),
        },
      },
    },
    ...commonResponses,
  },
})

chatOpenAPI.openapi(deleteChatRoute, async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json(
      {
        success: false,
        error: {
          message: '未授权的访问',
          code: 'UNAUTHORIZED',
        },
        timestamp: new Date().toISOString(),
      },
      401,
    )
  }

  const id = c.req.param('id')
  if (!id) {
    return c.json(
      {
        success: false,
        error: {
          message: '聊天会话ID不能为空',
          code: 'BAD_REQUEST',
        },
        timestamp: new Date().toISOString(),
      },
      400,
    )
  }

  try {
    const result = await db
      .delete(ct)
      .where(and(eq(ct.id, id), eq(ct.creatorId, session.user.id)))

    if (result.rowCount === 0) {
      return c.json(
        {
          success: false,
          error: {
            message: '聊天会话不存在或无权删除',
            code: 'FORBIDDEN',
          },
          timestamp: new Date().toISOString(),
        },
        403,
      )
    }

    // 清空checkpointer
    await db.transaction(async (tx) => {
      await Promise.all([
        tx.execute(sql`DELETE FROM checkpoints WHERE thread_id = ${id}`),
        tx.execute(sql`DELETE FROM checkpoint_writes WHERE thread_id = ${id}`),
        tx.execute(sql`DELETE FROM checkpoint_blobs WHERE thread_id = ${id}`),
      ])
    })

    return c.json({
      success: true,
      message: '聊天会话已删除',
      data: { message: '聊天会话已删除' },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('删除聊天会话时出错:', error)
    return c.json(
      {
        success: false,
        error: {
          message: '删除聊天会话时出错',
          code: 'INTERNAL_SERVER_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

export type ChatOpenAPIType = typeof chatOpenAPI
