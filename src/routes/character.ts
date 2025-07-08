import { Variables } from '@/lib/auth'
import { db } from '@/lib/database'
import { character as ctr } from '~/db'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'

export const character = new Hono<{
  Variables: Variables
  Bindings: {}
}>()

// 创建AI角色
character.post('/create', async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json({ error: '未授权的访问' }, 401)
  }

  const { name, signature, avatarUrl, creatorId, persona, visibility } =
    await c.req.json()

  if (!name) {
    return c.json({ error: '角色名称不能为空' }, 400)
  }

  try {
    const newCharacter = await db
      .insert(ctr)
      .values({
        name,
        creatorId,
        persona,
        signature,
        avatarUrl,
        visibility: visibility || 'private',
      })
      .returning()

    return c.json(newCharacter[0], 201)
  } catch (error) {
    console.error('创建角色时出错:', error)
    return c.json({ error: '创建角色时出错' }, 500)
  }
})

// 删除AI角色
character.delete('/delete/:characterId', async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json({ error: '未授权的访问' }, 401)
  }

  const characterId = c.req.param('characterId')

  try {
    // 检查角色是否为当前用户创建
    const _character = await db.query.character.findFirst({
      where: eq(ctr.id, characterId) && eq(ctr.creatorId, session.user.id),
    })

    if (!_character) {
      return c.json({ error: '角色不存在或您没有权限删除此角色' }, 403)
    }

    // 删除角色
    const deletedCharacter = await db
      .delete(ctr)
      .where(eq(ctr.id, characterId))
      .returning()

    if (deletedCharacter.length === 0) {
      return c.json({ error: '角色不存在或已被删除' }, 404)
    }

    return c.json({ message: '角色已成功删除' }, 200)
  } catch (error) {
    console.error('删除角色时出错:', error)
    return c.json({ error: '删除角色时出错' }, 500)
  }
})

// 获取可获取的角色列表
character.get('/list', async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json({ error: '未授权的访问' }, 401)
  }

  try {
    const characters = await db.query.character.findMany({
      where: (ctr, { eq }) =>
        eq(ctr.visibility, 'public') || eq(ctr.creatorId, session.user.id),
      with: {
        creator: {
          columns: {
            id: true,
            name: true,
            image: true,
            username: true,
          },
        },
      },
    })

    return c.json(characters, 200)
  } catch (error) {
    console.error('获取角色列表时出错:', error)
    return c.json({ error: '获取角色列表时出错' }, 500)
  }
})

// 获取角色详情
character.get('/detail/:characterId', async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json({ error: '未授权的访问' }, 401)
  }

  const characterId = c.req.param('characterId')

  if (!characterId) {
    return c.json({ error: '角色ID不能为空' }, 400)
  }

  try {
    const characterData = await db.query.character.findFirst({
      where: eq(ctr.id, characterId),
      with: {
        creator: {
          columns: {
            id: true,
            name: true,
            image: true,
            username: true,
          },
        },
      },
    })

    if (!characterData) {
      return c.json({ error: '角色不存在' }, 404)
    }

    if (
      characterData.visibility === 'private' &&
      characterData.creatorId !== session.user.id
    ) {
      return c.json({ error: '您没有权限查看此角色' }, 403)
    }

    return c.json(characterData, 200)
  } catch (error) {
    console.error('获取角色信息时出错:', error)
    return c.json({ error: '获取角色信息时出错' }, 500)
  }
})

// 更新角色信息
character.post('/update/:characterId', async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json({ error: '未授权的访问' }, 401)
  }

  const characterId = c.req.param('characterId')
  const { name, signature, avatarUrl, persona, visibility } = await c.req.json()

  if (!characterId || !name) {
    return c.json({ error: '角色ID和名称不能为空' }, 400)
  }

  try {
    // 检查角色是否为当前用户创建
    const _character = await db.query.character.findFirst({
      where: eq(ctr.id, characterId) && eq(ctr.creatorId, session.user.id),
    })

    if (!_character) {
      return c.json({ error: '角色不存在或您没有权限更新此角色' }, 403)
    }

    // 更新角色信息
    const updatedCharacter = await db
      .update(ctr)
      .set({
        name,
        signature,
        avatarUrl,
        persona,
        visibility,
      })
      .where(eq(ctr.id, characterId))
      .returning()

    return c.json(updatedCharacter[0], 200)
  } catch (error) {
    console.error('更新角色信息时出错:', error)
    return c.json({ error: '更新角色信息时出错' }, 500)
  }
})
