import { Variables } from '@/lib/auth'
import { db } from '@/lib/database'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { user, userCharacterContacts } from '~/db'

export const contact = new Hono<{
  Variables: Variables
  Bindings: {}
}>()

// 添加AI角色联系人
contact.post('/add/:characterId', async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json({ error: '未授权的访问' }, 401)
  }

  const characterId = c.req.param('characterId')
  if (!characterId) {
    return c.json({ error: '角色ID不能为空' }, 400)
  }

  try {
    const contact = await db
      .insert(userCharacterContacts)
      .values({
        userId: session.user.id,
        characterId,
      })
      .returning()

    return c.json(contact[0], 201)
  } catch (error) {
    console.error('添加联系人时出错', error)
    return c.json({ error: '添加联系人时出错' }, 500)
  }
})

// 删除AI角色联系人
contact.delete('/remove/:characterId', async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json({ error: '未授权的访问' }, 401)
  }

  const characterId = c.req.param('characterId')
  if (!characterId) {
    return c.json({ error: '角色ID不能为空' }, 400)
  }

  try {
    const result = await db
      .delete(userCharacterContacts)
      .where(
        and(
          eq(userCharacterContacts.userId, session.user.id),
          eq(userCharacterContacts.characterId, characterId),
        ),
      )
      .returning()

    if (result.length === 0) {
      return c.json({ error: '联系人不存在或已被删除' }, 404)
    }

    return c.json({ message: '联系人已删除' }, 200)
  } catch (error) {
    console.error('删除联系人时出错', error)
    return c.json({ error: '删除联系人时出错' }, 500)
  }
})

// 查询已添加的AI角色联系人
contact.get('/list', async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json({ error: '未授权的访问' }, 401)
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
      return c.json([], 200)
    }

    return c.json(
      userWithContacts.contacts.map((contact) => contact.character),
      200,
    )
  } catch (error) {
    console.error('查询联系人时出错', error)
    return c.json({ error: '查询联系人时出错' }, 500)
  }
})
