import { characterGraph } from '@/graph/builder'
import { Variables } from '@/lib/auth'
import { db } from '@/lib/database'
import { HumanMessage } from '@langchain/core/messages'
import { RunnableConfig } from '@langchain/core/runnables'
import { and, eq, lt, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { chat, message as tmsg } from '~/db'

export const message = new Hono<{
  Variables: Variables
  Bindings: {}
}>()

// 向聊天会话发送消息
message.post('/send', async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json(
      {
        success: false,
        error: '未授权的访问',
      },
      401,
    )
  }

  const chatId = c.req.param('chatId') as string
  const { message: msg } = await c.req.json()

  if (!msg) {
    return c.json(
      {
        success: false,
        error: '消息不能为空',
      },
      400,
    )
  }

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
        error: '聊天会话不存在',
      },
      404,
    )
  }

  if (chatMeta.creatorId !== session.user.id) {
    return c.json(
      {
        success: false,
        error: '无权访问此聊天会话',
      },
      403,
    )
  }
  // 插入用户消息到数据库
  await db.insert(tmsg).values({
    chatId,
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
    const finalState = await characterGraph.invoke(
      {
        messages: [new HumanMessage(msg)],
        characterName: chatMeta.character.name,
      },
      config,
    )

    // 插入AI回复
    await db.insert(tmsg).values({
      chatId,
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

    return c.json(
      {
        success: true,
        data: {
          response: finalState.response,
        },
      },
      200,
    )
  } catch (error) {
    console.error('聊天处理错误:', error)
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: '处理聊天时出错' },
      },
      500,
    )
  }
})

// 获取聊天会话消息列表(带分页)
message.get('/list', async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json(
      {
        success: false,
        error: '未授权的访问',
      },
      401,
    )
  }

  const chatId = c.req.param('chatId') as string
  if (!chatId) {
    return c.json(
      {
        success: false,
        error: '聊天会话ID不能为空',
      },
      400,
    )
  }

  const _limit = c.req.query('limit')
  const limit = _limit ? parseInt(_limit, 10) : 20

  const before = c.req.query('before')

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
        error: '聊天会话不存在',
      },
      404,
    )
  }

  if (chatMeta.creatorId !== session.user.id) {
    return c.json(
      {
        success: false,
        error: '无权访问此聊天会话',
      },
      403,
    )
  }

  const messages = await db.query.message.findMany({
    where: and(
      eq(tmsg.chatId, chatId),
      lt(tmsg.createdAt, before ? new Date(before) : new Date()),
    ),
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

  return c.json(
    {
      success: true,
      data: {
        messages: msgs.reverse(),
        next:
          messages.length > 0 ? messages[messages.length - 1].createdAt : null,
      },
    },
    200,
  )
})

// 清空聊天会话消息
message.delete('/delete', async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json(
      {
        success: false,
        error: '未授权的访问',
      },
      401,
    )
  }

  const chatId = c.req.param('chatId') as string
  if (!chatId) {
    return c.json(
      {
        success: false,
        error: '聊天会话ID不能为空',
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
        error: '聊天会话不存在',
      },
      404,
    )
  }

  if (chatMeta.creatorId !== session.user.id) {
    return c.json(
      {
        success: false,
        error: '无权访问此聊天会话',
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

    return c.json(
      {
        success: true,
        message: '聊天会话消息已清空',
      },
      200,
    )
  } catch (error) {
    console.error('清空聊天会话消息时出错:', error)
    return c.json(
      {
        success: false,
        error: '清空聊天会话消息时出错',
      },
      500,
    )
  }
})
