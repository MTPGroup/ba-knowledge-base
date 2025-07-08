import { Hono } from 'hono'
import { Variables } from '@/lib/auth'
import { db } from '@/lib/database'
import { chat as ct, user } from '~/db/index'
import { message } from '@/routes/chat/message'
import { and, eq, sql } from 'drizzle-orm'

export const chat = new Hono<{
  Variables: Variables
  Bindings: {}
}>()

chat.route('/:chatId/message', message)

// 创建聊天会话
chat.post('/create', async (c) => {
  const { characterId, title, avatarUrl, description } = await c.req.json()
  if (!characterId || !title) {
    return c.json(
      {
        success: false,
        error: '角色ID和标题不能为空',
      },
      400,
    )
  }

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

  try {
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
      },
      201,
    )
  } catch (error) {
    console.error('创建聊天会话时出错:', error)
    return c.json(
      {
        success: false,
        error: '创建聊天会话时出错',
      },
      500,
    )
  }
})

// 删除聊天会话
chat.delete('/delete/:chatId', async (c) => {
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

  const chatId = c.req.param('chatId')
  if (!chatId) {
    return c.json(
      {
        success: false,
        error: '聊天会话ID不能为空',
      },
      400,
    )
  }

  try {
    const result = await db
      .delete(ct)
      .where(and(eq(ct.id, chatId), eq(ct.creatorId, session.user.id)))

    if (result.rowCount === 0) {
      return c.json(
        {
          success: false,
          error: '聊天会话不存在或无权删除',
        },
        404,
      )
    }

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
        message: '聊天会话已删除',
      },
      200,
    )
  } catch (error) {
    console.error('删除聊天会话时出错:', error)
    return c.json(
      {
        success: false,
        error: '删除聊天会话时出错',
      },
      500,
    )
  }
})

// 获取聊天会话列表
chat.get('/list', async (c) => {
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

  try {
    const userWithChats = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      with: {
        chats: true,
      },
    })

    if (!userWithChats) {
      return c.json(
        {
          success: true,
          data: {
            chats: [],
          },
        },
        200,
      )
    }

    return c.json(
      {
        success: true,
        data: {
          chats: userWithChats.chats,
        },
      },
      200,
    )
  } catch (error) {
    console.error('获取聊天会话列表时出错:', error)
    return c.json(
      {
        success: false,
        error: '获取聊天会话列表时出错',
      },
      500,
    )
  }
})

// 更新聊天会话信息
chat.post('/update/:chatId', async (c) => {
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

  const chatId = c.req.param('chatId')
  if (!chatId) {
    return c.json(
      {
        success: false,
        error: '聊天会话ID不能为空',
      },
      400,
    )
  }

  const { title, avatarUrl, description } = await c.req.json()
  if (!title) {
    return c.json(
      {
        success: false,
        error: '标题不能为空',
      },
      400,
    )
  }

  try {
    const updatedChat = await db
      .update(ct)
      .set({
        title,
        avatarUrl,
        description,
      })
      .where(and(eq(ct.id, chatId), eq(ct.creatorId, session.user.id)))
      .returning()

    if (updatedChat.length === 0) {
      return c.json(
        {
          success: false,
          error: '聊天会话不存在或无权更新',
        },
        404,
      )
    }

    return c.json(
      {
        success: true,
        message: '聊天会话更新成功',
      },
      200,
    )
  } catch (error) {
    console.error('更新聊天会话时出错:', error)
    return c.json(
      {
        success: false,
        error: '更新聊天会话时出错',
      },
      500,
    )
  }
})
