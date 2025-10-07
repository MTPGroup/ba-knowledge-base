import { Variables } from '@/lib/auth'
import { db } from '@/lib/database'
import { character as ctr } from '~/db'
import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

// 请求验证模式
const CreateCharacterSchema = z.object({
  name: z
    .string()
    .min(1, '角色名称不能为空')
    .max(100, '角色名称不能超过100个字符'),
  signature: z.string().max(200, '签名不能超过200个字符').optional(),
  avatarUrl: z.string().url('头像URL格式不正确').optional(),
  persona: z.string().max(2000, '人格描述不能超过2000个字符').optional(),
  visibility: z.enum(['public', 'private']).default('private'),
})

const UpdateCharacterSchema = CreateCharacterSchema.partial().extend({
  name: z
    .string()
    .min(1, '角色名称不能为空')
    .max(100, '角色名称不能超过100个字符')
    .optional(),
})

const CharacterParamsSchema = z.object({
  id: z.string().min(1, '角色ID不能为空'),
})

// 查询参数验证
const ListCharacterSchema = z.object({
  page: z
    .string()
    .transform((val) => parseInt(val) || 1)
    .pipe(z.number().min(1))
    .optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val) || 20)
    .pipe(z.number().min(1).max(100))
    .optional(),
  visibility: z.enum(['public', 'private', 'all']).optional(),
  search: z.string().optional(),
})

export const characters = new Hono<{
  Variables: Variables
  Bindings: {}
}>()

// 标准响应格式
const successResponse = (
  data: any,
  message?: string,
  statusCode: number = 200,
) => ({
  success: true,
  message,
  data,
  timestamp: new Date().toISOString(),
})

const errorResponse = (
  error: string,
  code?: string,
  statusCode: number = 400,
) => ({
  success: false,
  error: {
    message: error,
    code: code || 'BAD_REQUEST',
  },
  timestamp: new Date().toISOString(),
})

/**
 * @swagger
 * /api/characters:
 *   get:
 *     summary: 获取角色列表
 *     tags: [Characters]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: 每页数量
 *       - in: query
 *         name: visibility
 *         schema:
 *           type: string
 *           enum: [public, private, all]
 *         description: 可见性过滤
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *     responses:
 *       200:
 *         description: 成功获取角色列表
 *       401:
 *         description: 未授权访问
 */
characters.get('/', zValidator('query', ListCharacterSchema), async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json(errorResponse('未授权的访问', 'UNAUTHORIZED'), 401)
  }

  const { page = 1, limit = 20, visibility, search } = c.req.valid('query')
  const offset = (page - 1) * limit

  try {
    // 构建查询条件
    let whereCondition = (ctr: any, { eq, or, like }: any) => {
      let conditions = [
        or(eq(ctr.visibility, 'public'), eq(ctr.creatorId, session.user.id)),
      ]

      if (visibility && visibility !== 'all') {
        if (visibility === 'private') {
          conditions = [eq(ctr.creatorId, session.user.id)]
        } else {
          conditions = [eq(ctr.visibility, visibility)]
        }
      }

      if (search) {
        conditions.push(like(ctr.name, `%${search}%`))
      }

      return conditions.length > 1
        ? conditions.reduce((acc, cond) => acc && cond)
        : conditions[0]
    }

    const [characters, totalCount] = await Promise.all([
      db.query.character.findMany({
        where: whereCondition,
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
        limit,
        offset,
        orderBy: (ctr, { desc }) => desc(ctr.createdAt),
      }),
      db.query.character
        .findMany({
          where: whereCondition,
          columns: { id: true },
        })
        .then((result) => result.length),
    ])

    const pagination = {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      hasNext: page * limit < totalCount,
      hasPrev: page > 1,
    }

    return c.json(
      successResponse({ characters, pagination }, '获取角色列表成功'),
    )
  } catch (error) {
    console.error('获取角色列表时出错:', error)
    return c.json(
      errorResponse('获取角色列表时出错', 'INTERNAL_SERVER_ERROR'),
      500,
    )
  }
})

/**
 * @swagger
 * /api/characters:
 *   post:
 *     summary: 创建AI角色
 *     tags: [Characters]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCharacter'
 *     responses:
 *       201:
 *         description: 角色创建成功
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权访问
 */
characters.post('/', zValidator('json', CreateCharacterSchema), async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json(errorResponse('未授权的访问', 'UNAUTHORIZED'), 401)
  }

  const validated = c.req.valid('json')

  try {
    const [newCharacter] = await db
      .insert(ctr)
      .values({
        ...validated,
        creatorId: session.user.id,
      })
      .returning()

    return c.json(successResponse(newCharacter, '角色创建成功'), 201)
  } catch (error) {
    console.error('创建角色时出错:', error)
    return c.json(errorResponse('创建角色时出错', 'INTERNAL_SERVER_ERROR'), 500)
  }
})

/**
 * @swagger
 * /api/characters/{id}:
 *   get:
 *     summary: 获取角色详情
 *     tags: [Characters]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 角色ID
 *     responses:
 *       200:
 *         description: 成功获取角色详情
 *       404:
 *         description: 角色不存在
 *       403:
 *         description: 无权访问
 */
characters.get(
  '/:id',
  zValidator('param', CharacterParamsSchema),
  async (c) => {
    const session = c.get('session')
    if (!session) {
      return c.json(errorResponse('未授权的访问', 'UNAUTHORIZED'), 401)
    }

    const { id } = c.req.valid('param')

    try {
      const characterData = await db.query.character.findFirst({
        where: eq(ctr.id, id),
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
        return c.json(errorResponse('角色不存在', 'NOT_FOUND'), 404)
      }

      if (
        characterData.visibility === 'private' &&
        characterData.creatorId !== session.user.id
      ) {
        return c.json(errorResponse('您没有权限查看此角色', 'FORBIDDEN'), 403)
      }

      return c.json(successResponse(characterData, '获取角色详情成功'))
    } catch (error) {
      console.error('获取角色信息时出错:', error)
      return c.json(
        errorResponse('获取角色信息时出错', 'INTERNAL_SERVER_ERROR'),
        500,
      )
    }
  },
)

/**
 * @swagger
 * /api/characters/{id}:
 *   put:
 *     summary: 更新角色信息（完整更新）
 *     tags: [Characters]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 角色ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCharacter'
 *     responses:
 *       200:
 *         description: 角色更新成功
 *       403:
 *         description: 无权限更新
 *       404:
 *         description: 角色不存在
 */
characters.put(
  '/:id',
  zValidator('param', CharacterParamsSchema),
  zValidator('json', CreateCharacterSchema),
  async (c) => {
    const session = c.get('session')
    if (!session) {
      return c.json(errorResponse('未授权的访问', 'UNAUTHORIZED'), 401)
    }

    const { id } = c.req.valid('param')
    const validated = c.req.valid('json')

    try {
      // 检查角色是否为当前用户创建
      const existingCharacter = await db.query.character.findFirst({
        where: and(eq(ctr.id, id), eq(ctr.creatorId, session.user.id)),
      })

      if (!existingCharacter) {
        return c.json(
          errorResponse('角色不存在或您没有权限更新此角色', 'FORBIDDEN'),
          403,
        )
      }

      const [updatedCharacter] = await db
        .update(ctr)
        .set({
          ...validated,
          updatedAt: new Date(),
        })
        .where(eq(ctr.id, id))
        .returning()

      return c.json(successResponse(updatedCharacter, '角色信息已成功更新'))
    } catch (error) {
      console.error('更新角色信息时出错:', error)
      return c.json(
        errorResponse('更新角色信息时出错', 'INTERNAL_SERVER_ERROR'),
        500,
      )
    }
  },
)

/**
 * @swagger
 * /api/characters/{id}:
 *   patch:
 *     summary: 更新角色信息（部分更新）
 *     tags: [Characters]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 角色ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCharacter'
 *     responses:
 *       200:
 *         description: 角色更新成功
 *       403:
 *         description: 无权限更新
 *       404:
 *         description: 角色不存在
 */
characters.patch(
  '/:id',
  zValidator('param', CharacterParamsSchema),
  zValidator('json', UpdateCharacterSchema),
  async (c) => {
    const session = c.get('session')
    if (!session) {
      return c.json(errorResponse('未授权的访问', 'UNAUTHORIZED'), 401)
    }

    const { id } = c.req.valid('param')
    const validated = c.req.valid('json')

    // 如果没有要更新的字段
    if (Object.keys(validated).length === 0) {
      return c.json(errorResponse('没有提供要更新的字段', 'BAD_REQUEST'), 400)
    }

    try {
      // 检查角色是否为当前用户创建
      const existingCharacter = await db.query.character.findFirst({
        where: and(eq(ctr.id, id), eq(ctr.creatorId, session.user.id)),
      })

      if (!existingCharacter) {
        return c.json(
          errorResponse('角色不存在或您没有权限更新此角色', 'FORBIDDEN'),
          403,
        )
      }

      const [updatedCharacter] = await db
        .update(ctr)
        .set({
          ...validated,
          updatedAt: new Date(),
        })
        .where(eq(ctr.id, id))
        .returning()

      return c.json(successResponse(updatedCharacter, '角色信息已成功更新'))
    } catch (error) {
      console.error('更新角色信息时出错:', error)
      return c.json(
        errorResponse('更新角色信息时出错', 'INTERNAL_SERVER_ERROR'),
        500,
      )
    }
  },
)

/**
 * @swagger
 * /api/characters/{id}:
 *   delete:
 *     summary: 删除角色
 *     tags: [Characters]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 角色ID
 *     responses:
 *       200:
 *         description: 角色删除成功
 *       403:
 *         description: 无权限删除
 *       404:
 *         description: 角色不存在
 */
characters.delete(
  '/:id',
  zValidator('param', CharacterParamsSchema),
  async (c) => {
    const session = c.get('session')
    if (!session) {
      return c.json(errorResponse('未授权的访问', 'UNAUTHORIZED'), 401)
    }

    const { id } = c.req.valid('param')

    try {
      // 检查角色是否为当前用户创建
      const existingCharacter = await db.query.character.findFirst({
        where: and(eq(ctr.id, id), eq(ctr.creatorId, session.user.id)),
      })

      if (!existingCharacter) {
        return c.json(
          errorResponse('角色不存在或您没有权限删除此角色', 'FORBIDDEN'),
          403,
        )
      }

      await db.delete(ctr).where(eq(ctr.id, id))

      return c.json(successResponse(null, '角色已成功删除'))
    } catch (error) {
      console.error('删除角色时出错:', error)
      return c.json(
        errorResponse('删除角色时出错', 'INTERNAL_SERVER_ERROR'),
        500,
      )
    }
  },
)
