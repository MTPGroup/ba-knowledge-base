import { z } from '@hono/zod-openapi'
import {
  createOpenAPIApp,
  createAuthenticatedRoute,
  ContactSchema,
  SuccessResponseSchema,
  ErrorResponseSchema,
  commonResponses,
} from '@/lib/openapi'
import { db } from '@/lib/database'
import { and, eq, sql } from 'drizzle-orm'
import { user, userCharacterContacts, chat, message, character } from '~/db'

export const contactOpenAPI = createOpenAPIApp()

// 获取联系人列表路由
const getContactListRoute = createAuthenticatedRoute({
  method: 'get',
  path: '/api/contact/list',
  tags: ['Contacts'],
  summary: '获取联系人列表',
  description: '获取当前用户已添加的所有 AI 角色联系人列表',
  responses: {
    200: {
      description: '成功获取联系人列表',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              contacts: z.array(ContactSchema),
            }),
          ),
        },
      },
    },
    ...commonResponses,
  },
})

contactOpenAPI.openapi(getContactListRoute, async (c) => {
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
      return c.json({
        success: true,
        message: '获取联系人列表成功',
        data: { contacts: [] },
        timestamp: new Date().toISOString(),
      })
    }

    return c.json({
      success: true,
      message: '获取联系人列表成功',
      data: {
        contacts: userWithContacts.contacts.map((contact) => contact.character),
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('查询联系人时出错', error)
    return c.json(
      {
        success: false,
        error: {
          message: '查询联系人时出错',
          code: 'INTERNAL_SERVER_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

// 添加联系人路由
const addContactRoute = createAuthenticatedRoute({
  method: 'post',
  path: '/api/contact/add/{characterId}',
  tags: ['Contacts'],
  summary: '添加 AI 角色联系人',
  description: '将指定的 AI 角色添加到用户的联系人列表中',
  request: {
    params: z.object({
      characterId: z.string().min(1, '角色ID不能为空'),
    }),
  },
  responses: {
    201: {
      description: '联系人添加成功',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              message: z.string(),
              contactId: z.string(),
            }),
          ),
        },
      },
    },
    409: {
      description: '联系人已存在',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    ...commonResponses,
  },
})

contactOpenAPI.openapi(addContactRoute, async (c) => {
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

  const characterId = c.req.param('characterId')
  if (!characterId) {
    return c.json(
      {
        success: false,
        error: {
          message: '角色ID不能为空',
          code: 'BAD_REQUEST',
        },
        timestamp: new Date().toISOString(),
      },
      400,
    )
  }

  try {
    // 检查联系人是否已存在
    const existingContact = await db.query.userCharacterContacts.findFirst({
      where: and(
        eq(userCharacterContacts.userId, session.user.id),
        eq(userCharacterContacts.characterId, characterId),
      ),
    })

    if (existingContact) {
      return c.json(
        {
          success: false,
          error: {
            message: '该角色已在您的联系人列表中',
            code: 'CONTACT_EXISTS',
          },
          timestamp: new Date().toISOString(),
        },
        409,
      )
    }

    // 检查角色是否存在
    const characterExists = await db.query.character.findFirst({
      where: eq(character.id, characterId),
    })

    const contact = await db
      .insert(userCharacterContacts)
      .values({
        userId: session.user.id,
        characterId: characterId,
      })
      .returning()

    return c.json(
      {
        success: true,
        message: `联系人已添加成功`,
        data: {
          message: '联系人添加成功',
          contactId: contact[0].characterId,
        },
        timestamp: new Date().toISOString(),
      },
      201,
    )
  } catch (error) {
    console.error('添加联系人时出错', error)
    return c.json(
      {
        success: false,
        error: {
          message: '添加联系人时出错',
          code: 'INTERNAL_SERVER_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

// 删除联系人路由
const deleteContactRoute = createAuthenticatedRoute({
  method: 'delete',
  path: '/api/contact/delete/{characterId}',
  tags: ['Contacts'],
  summary: '删除 AI 角色联系人',
  description:
    '从用户联系人列表中删除指定的 AI 角色，同时删除相关的聊天会话和消息',
  request: {
    params: z.object({
      characterId: z.string().min(1, '角色ID不能为空'),
    }),
  },
  responses: {
    200: {
      description: '联系人删除成功',
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

contactOpenAPI.openapi(deleteContactRoute, async (c) => {
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

  const characterId = c.req.param('characterId')
  if (!characterId) {
    return c.json(
      {
        success: false,
        error: {
          message: '角色ID不能为空',
          code: 'BAD_REQUEST',
        },
        timestamp: new Date().toISOString(),
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

    return c.json({
      success: true,
      message: '联系人及相关会话已删除',
      data: { message: '联系人及相关会话已删除' },
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('删除联系人时出错', error)

    // 处理自定义错误
    if (error.message === '联系人不存在或已被删除') {
      return c.json(
        {
          success: false,
          error: {
            message: error.message,
            code: 'NOT_FOUND',
          },
          timestamp: new Date().toISOString(),
        },
        404,
      )
    }

    return c.json(
      {
        success: false,
        error: {
          message: '删除联系人时出错',
          code: 'INTERNAL_SERVER_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

export type ContactOpenAPIType = typeof contactOpenAPI
