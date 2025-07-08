import { characterGraph } from '@/graph/builder'
import { Variables } from '@/lib/auth'
import { db } from '@/lib/database'
import { HumanMessage } from '@langchain/core/messages'
import { RunnableConfig } from '@langchain/core/runnables'
import { eq } from 'drizzle-orm'
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
    return c.json({ error: '未授权的访问' }, 401)
  }

  const chatId = c.req.param('chatId') as string
  const { message: msg } = await c.req.json()

  if (!msg) {
    return c.json({ error: '消息不能为空' }, 400)
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
    return c.json({ error: '聊天会话不存在' }, 404)
  }

  if (chatMeta.creatorId !== session.user.id) {
    return c.json({ error: '无权访问此聊天会话' }, 403)
  }
  // 插入用户消息到数据库
  await db.insert(tmsg).values({
    chatId,
    role: 'user',
    content: msg,
  })

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

    await db.insert(tmsg).values({
      chatId,
      role: 'ai',
      content: finalState.response,
    })

    return c.json({
      response: finalState.response,
    })
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
