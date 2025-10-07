import { Variables } from '@/lib/auth'
import { db } from '@/lib/database'
import { and, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { user, userCharacterContacts, chat, message } from '~/db'

export const contact = new Hono<{
  Variables: Variables
  Bindings: {}
}>()

// 添加AI角色联系人
contact.post('/add/:characterId', async (c) => {
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

  const characterId = c.req.param('characterId')
  if (!characterId) {
    return c.json(
      {
        success: false,
        error: '角色ID不能为空',
      },
      400,
    )
  }

  try {
    const contact = await db
      .insert(userCharacterContacts)
      .values({
        userId: session.user.id,
        characterId,
      })
      .returning()

    return c.json(
      {
        success: true,
        message: `联系人已添加: ${contact[0].characterId}`,
      },
      201,
    )
  } catch (error) {
    console.error('添加联系人时出错', error)
    return c.json(
      {
        success: false,
        error: '添加联系人时出错',
      },
      500,
    )
  }
})

// 删除AI角色联系人
contact.delete('/delete/:characterId', async (c) => {
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

  const characterId = c.req.param('characterId')
  if (!characterId) {
    return c.json(
      {
        success: false,
        error: '角色ID不能为空',
      },
      400,
    )
  }

  try {
    // 使用事务确保数据一致性
    await db.transaction(async (tx) => {
      // 1. 首先检查联系人是否存在
      const contactResult = await tx
        .delete(userCharacterContacts)
        .where(
          and(
            eq(userCharacterContacts.userId, session.user.id),
            eq(userCharacterContacts.characterId, characterId),
          ),
        )
        .returning()

      if (contactResult.length === 0) {
        throw new Error('联系人不存在或已被删除')
      }

      // 2. 查找该用户与该角色的所有会话
      const userChats = await tx.query.chat.findMany({
        where: and(
          eq(chat.creatorId, session.user.id),
          eq(chat.characterId, characterId),
        ),
        columns: {
          id: true,
        },
      })

      if (userChats.length > 0) {
        // 3. 逐个删除会话和相关数据
        for (const userChat of userChats) {
          const chatId = userChat.id

          // 删除该会话的所有消息
          await tx.delete(message).where(eq(message.chatId, chatId))

          // 清空checkpointer相关数据
          await Promise.all([
            tx.execute(
              sql`DELETE FROM checkpoints WHERE thread_id = ${chatId}`,
            ),
            tx.execute(
              sql`DELETE FROM checkpoint_writes WHERE thread_id = ${chatId}`,
            ),
            tx.execute(
              sql`DELETE FROM checkpoint_blobs WHERE thread_id = ${chatId}`,
            ),
          ])

          // 删除会话记录
          await tx.delete(chat).where(eq(chat.id, chatId))
        }
      }
    })

    return c.json(
      {
        success: true,
        message: '联系人及相关会话已删除',
      },
      200,
    )
  } catch (error: any) {
    console.error('删除联系人时出错', error)

    // 处理自定义错误
    if (error.message === '联系人不存在或已被删除') {
      return c.json(
        {
          success: false,
          error: error.message,
        },
        404,
      )
    }

    return c.json(
      {
        success: false,
        error: '删除联系人时出错',
      },
      500,
    )
  }
})

// 查询已添加的AI角色联系人
contact.get('/list', async (c) => {
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
    const userWithContacts = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      with: {
        contacts: {
          with: {
            character: true,
          },
        },
      },
    })
    if (!userWithContacts) {
      return c.json(
        {
          success: true,
          data: {
            contacts: [],
          },
        },
        200,
      )
    }

    return c.json(
      {
        success: true,
        data: {
          contacts: userWithContacts.contacts.map(
            (contact) => contact.character,
          ),
        },
      },
      200,
    )
  } catch (error) {
    console.error('查询联系人时出错', error)
    return c.json(
      {
        success: false,
        error: '查询联系人时出错',
      },
      500,
    )
  }
})
