import { z } from '@hono/zod-openapi'
import {
  createOpenAPIApp,
  createAuthenticatedRoute,
  MessageSchema,
  SendMessageSchema,
  MessageListQuerySchema,
  SuccessResponseSchema,
  commonResponses,
} from '@/lib/openapi'
import { Variables } from '@/lib/auth'
import { db } from '@/lib/database'
import { chat, message as tmsg } from '~/db'
import { and, eq, lt, sql } from 'drizzle-orm'
import { characterGraph } from '@/graph/builder'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { RunnableConfig } from '@langchain/core/runnables'
import { streamSSE } from 'hono/streaming'

export const messageOpenAPI = createOpenAPIApp()

// 发送消息路由
const sendMessageRoute = createAuthenticatedRoute({
  method: 'post',
  path: '/api/chat/{chatId}/message/send',
  tags: ['Messages'],
  summary: '发送消息',
  description: '向指定聊天会话发送消息并获取 AI 回复',
  request: {
    params: z.object({
      chatId: z.string().min(1, '聊天会话ID不能为空'),
    }),
    body: {
      content: {
        'application/json': {
          schema: SendMessageSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: '消息发送成功，返回 AI 回复',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              response: z.string().describe('AI 回复内容'),
            }),
          ),
        },
      },
    },
    ...commonResponses,
  },
})

messageOpenAPI.openapi(sendMessageRoute, async (c) => {
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

  const chatId = c.req.param('chatId')
  if (!chatId) {
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
  const { message: msg } = body

  const chatMeta = await db.query.chat.findFirst({
    where: eq(chat.id, chatId),
    with: {
      character: {
        columns: {
          name: true,
        },
      },
    },
  })

  if (!chatMeta) {
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

  if (chatMeta.creatorId !== session.user.id) {
    return c.json(
      {
        success: false,
        error: {
          message: '无权访问此聊天会话',
          code: 'FORBIDDEN',
        },
        timestamp: new Date().toISOString(),
      },
      403,
    )
  }

  // 插入用户消息到数据库
  await db.insert(tmsg).values({
    chatId: chatId,
    role: 'user',
    content: msg,
  })

  // 更新会话信息
  await db
    .update(chat)
    .set({
      lastMessage: msg.slice(0, 20),
      updatedAt: new Date(),
    })
    .where(eq(chat.id, chatId))

  const config: RunnableConfig = {
    configurable: {
      thread_id: chatId,
    },
  }

  try {
    const historyMessages = await db.query.message.findMany({
      where: eq(tmsg.chatId, chatId),
      orderBy: (msg, { asc }) => asc(msg.createdAt),
      limit: 20,
    })

    const langChainMessages = historyMessages.map((msg) =>
      msg.role === 'user'
        ? new HumanMessage(msg.content as string)
        : new AIMessage(msg.content as string),
    )

    langChainMessages.push(new HumanMessage(msg))

    const finalState = await characterGraph.invoke(
      {
        messages: langChainMessages,
        characterName: chatMeta.character.name,
      },
      config,
    )

    // 插入AI回复
    await db.insert(tmsg).values({
      chatId: chatId,
      role: 'ai',
      content: finalState.response,
    })

    // 更新会话最后一条消息
    await db
      .update(chat)
      .set({
        lastMessage: finalState.response.slice(0, 20),
        updatedAt: new Date(),
      })
      .where(eq(chat.id, chatId))

    return c.json({
      success: true,
      message: '消息发送成功',
      data: {
        response: finalState.response,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('聊天处理错误:', error)
    return c.json(
      {
        success: false,
        error: {
          message: '处理聊天时出错',
          code: 'INTERNAL_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

// 流式发送消息路由
const sendStreamMessageRoute = createAuthenticatedRoute({
  method: 'post',
  path: '/api/chat/{chatId}/message/send-stream',
  tags: ['Messages'],
  summary: '流式发送消息',
  description: '向指定聊天会话发送消息并以流式方式接收 AI 回复',
  request: {
    params: z.object({
      chatId: z.string().min(1, '聊天会话ID不能为空'),
    }),
    body: {
      content: {
        'application/json': {
          schema: SendMessageSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: '开始流式响应',
      content: {
        'text/plain': {
          schema: z.string().describe('Server-Sent Events 流'),
        },
      },
    },
    ...commonResponses,
  },
})

messageOpenAPI.openapi(sendStreamMessageRoute, async (c) => {
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

  const chatId = c.req.param('chatId')
  if (!chatId) {
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
  const { message: msg } = body

  const chatMeta = await db.query.chat.findFirst({
    where: eq(chat.id, chatId),
    with: {
      character: {
        columns: {
          name: true,
        },
      },
    },
  })

  if (!chatMeta) {
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

  if (chatMeta.creatorId !== session.user.id) {
    return c.json(
      {
        success: false,
        error: {
          message: '无权访问此聊天会话',
          code: 'FORBIDDEN',
        },
        timestamp: new Date().toISOString(),
      },
      403,
    )
  }

  // 插入用户消息到数据库
  await db.insert(tmsg).values({
    chatId: chatId,
    role: 'user',
    content: msg,
  })

  // 更新会话信息
  await db
    .update(chat)
    .set({
      lastMessage: msg.slice(0, 20),
      updatedAt: new Date(),
    })
    .where(eq(chat.id, chatId))

  return streamSSE(c, async (stream) => {
    const config: RunnableConfig = {
      configurable: {
        thread_id: chatId,
      },
    }

    let finalResponse = ''

    try {
      const historyMessages = await db.query.message.findMany({
        where: eq(tmsg.chatId, chatId),
        orderBy: (msg, { asc }) => asc(msg.createdAt),
        limit: 20,
      })

      const langChainMessages = historyMessages.map((msg) =>
        msg.role === 'user'
          ? new HumanMessage(msg.content as string)
          : new AIMessage(msg.content as string),
      )

      const streamResponse = characterGraph.streamEvents(
        {
          messages: langChainMessages,
          characterName: chatMeta.character.name,
        },
        {
          version: 'v2',
          ...config,
        },
      )

      for await (const chunk of streamResponse) {
        if (
          chunk.metadata.langgraph_node === 'reflect' &&
          chunk.data.chunk !== null &&
          chunk.data.chunk !== undefined
        ) {
          const token = chunk.data.chunk
          await stream.write(
            `data: ${JSON.stringify({
              type: 'reflection_chunk',
              content: token.content,
            })}\n\n`,
          )
        } else if (
          chunk.metadata.langgraph_node === 'generate' &&
          chunk.data.chunk !== null &&
          chunk.data.chunk !== undefined
        ) {
          const token = chunk.data.chunk
          finalResponse += token.content
          await stream.write(
            `data: ${JSON.stringify({
              type: 'token',
              content: token.content,
            })}\n\n`,
          )
        }
      }
    } catch (error) {
      console.error('流式聊天处理错误:', error)
      await stream.write(
        `data: ${JSON.stringify({
          type: 'error',
          content: '处理聊天时出错',
        })}\n\n`,
      )
    }

    if (finalResponse) {
      // 插入AI回复
      await db.insert(tmsg).values({
        chatId: chatId,
        role: 'ai',
        content: finalResponse,
      })

      // 更新会话最后一条消息
      await db
        .update(chat)
        .set({
          lastMessage: finalResponse.slice(0, 20),
          updatedAt: new Date(),
        })
        .where(eq(chat.id, chatId))
    }

    await stream.write(`data: ${JSON.stringify({ type: 'final' })}\n\n`)
    await stream.close()
  })
})

// 获取消息列表路由
const getMessageListRoute = createAuthenticatedRoute({
  method: 'get',
  path: '/api/chat/{chatId}/message/list',
  tags: ['Messages'],
  summary: '获取消息列表',
  description: '获取指定聊天会话的消息历史，支持分页加载',
  request: {
    params: z.object({
      chatId: z.string().min(1, '聊天会话ID不能为空'),
    }),
    query: MessageListQuerySchema,
  },
  responses: {
    200: {
      description: '成功获取消息列表',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              messages: z.array(MessageSchema),
              next: z.string().nullable().describe('下一页的时间戳'),
            }),
          ),
        },
      },
    },
    ...commonResponses,
  },
})

messageOpenAPI.openapi(getMessageListRoute, async (c) => {
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

  const chatId = c.req.param('chatId')
  if (!chatId) {
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

  const query = c.req.query()
  const limit = parseInt(query.limit || '20')
  const before = query.before

  const chatMeta = await db.query.chat.findFirst({
    where: eq(chat.id, chatId),
    with: {
      character: true,
    },
  })

  if (!chatMeta) {
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

  if (chatMeta.creatorId !== session.user.id) {
    return c.json(
      {
        success: false,
        error: {
          message: '无权访问此聊天会话',
          code: 'FORBIDDEN',
        },
        timestamp: new Date().toISOString(),
      },
      403,
    )
  }

  const whereConditions = [eq(tmsg.chatId, chatId)]

  if (before) {
    whereConditions.push(lt(tmsg.createdAt, new Date(before)))
  }

  const messages = await db.query.message.findMany({
    where: and(...whereConditions),
    orderBy: (msg, { desc }) => desc(msg.createdAt),
    limit,
  })

  const msgs = messages.map((msg) => {
    const sender =
      msg.role === 'user'
        ? {
            name: session.user.name,
            avatar: session.user.image,
          }
        : {
            name: chatMeta.character.name,
            avatar: chatMeta.character.avatarUrl || '/default-avatar.png',
          }
    return {
      sender,
      ...msg,
    }
  })

  return c.json({
    success: true,
    message: '获取消息列表成功',
    data: {
      messages: msgs.reverse(),
      next:
        messages.length > 0 ? messages[messages.length - 1].createdAt : null,
    },
    timestamp: new Date().toISOString(),
  })
})

// 清空消息路由
const deleteMessagesRoute = createAuthenticatedRoute({
  method: 'delete',
  path: '/api/chat/{chatId}/message/delete',
  tags: ['Messages'],
  summary: '清空聊天消息',
  description: '清空指定聊天会话的所有消息和检查点数据',
  request: {
    params: z.object({
      chatId: z.string().min(1, '聊天会话ID不能为空'),
    }),
  },
  responses: {
    200: {
      description: '消息清空成功',
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

messageOpenAPI.openapi(deleteMessagesRoute, async (c) => {
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

  const chatId = c.req.param('chatId')
  if (!chatId) {
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

  const chatMeta = await db.query.chat.findFirst({
    where: eq(chat.id, chatId),
  })

  if (!chatMeta) {
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

  if (chatMeta.creatorId !== session.user.id) {
    return c.json(
      {
        success: false,
        error: {
          message: '无权访问此聊天会话',
          code: 'FORBIDDEN',
        },
        timestamp: new Date().toISOString(),
      },
      403,
    )
  }

  try {
    await db.delete(tmsg).where(eq(tmsg.chatId, chatId))

    // 更新会话信息
    await db
      .update(chat)
      .set({
        lastMessage: '',
        updatedAt: new Date(),
      })
      .where(eq(chat.id, chatId))

    // 清空checkpointer
    await db.transaction(async (tx) => {
      await Promise.all([
        tx.execute(sql`DELETE FROM checkpoints WHERE thread_id = ${chatId}`),
        tx.execute(
          sql`DELETE FROM checkpoint_writes WHERE thread_id = ${chatId}`,
        ),
        tx.execute(
          sql`DELETE FROM checkpoint_blobs WHERE thread_id = ${chatId}`,
        ),
      ])
    })

    return c.json({
      success: true,
      message: '聊天会话消息已清空',
      data: { message: '聊天会话消息已清空' },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('清空聊天会话消息时出错:', error)
    return c.json(
      {
        success: false,
        error: {
          message: '清空消息时出错',
          code: 'INTERNAL_SERVER_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

export type MessageOpenAPIType = typeof messageOpenAPI
