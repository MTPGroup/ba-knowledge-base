import { z } from '@hono/zod-openapi'
import {
  createOpenAPIApp,
  createAuthenticatedRoute,
  CharacterSchema,
  CreateCharacterSchema,
  UpdateCharacterSchema,
  CharacterListQuerySchema,
  SuccessResponseSchema,
  PaginationResponseSchema,
  commonResponses,
} from '@/lib/openapi'
import { db } from '@/lib/database'
import { character as ctr } from '~/db'
import { eq, and, like, or } from 'drizzle-orm'

export const charactersOpenAPI = createOpenAPIApp()

// 获取角色列表路由
const getCharactersRoute = createAuthenticatedRoute({
  method: 'get',
  path: '/api/characters',
  tags: ['Characters'],
  summary: '获取角色列表',
  description: '获取 AI 角色列表，支持分页、搜索和可见性过滤',
  request: {
    query: CharacterListQuerySchema,
  },
  responses: {
    200: {
      description: '成功获取角色列表',
      content: {
        'application/json': {
          schema: PaginationResponseSchema(
            z.object({
              characters: z.array(CharacterSchema),
              pagination: z.object({
                page: z.number(),
                limit: z.number(),
                total: z.number(),
                totalPages: z.number(),
                hasNext: z.boolean(),
                hasPrev: z.boolean(),
              }),
            }),
          ),
        },
      },
    },
    ...commonResponses,
  },
})

charactersOpenAPI.openapi(getCharactersRoute, async (c) => {
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

  const query = c.req.query()
  const page = parseInt(query.page || '1')
  const limit = parseInt(query.limit || '20')
  const visibility = query.visibility
  const search = query.search
  const offset = (page - 1) * limit

  try {
    // 构建查询条件
    let whereCondition = or(
      eq(ctr.visibility, 'public'),
      eq(ctr.creatorId, session.user.id),
    )

    if (visibility && visibility !== 'all') {
      if (visibility === 'private') {
        whereCondition = eq(ctr.creatorId, session.user.id)
      } else if (visibility === 'public') {
        whereCondition = eq(ctr.visibility, 'public')
      }
    }

    let searchCondition
    if (search) {
      searchCondition = like(ctr.name, `%${search}%`)
    }

    const finalCondition = searchCondition
      ? and(whereCondition, searchCondition)
      : whereCondition

    const [characters, totalCount] = await Promise.all([
      db.query.character.findMany({
        where: finalCondition,
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
          where: finalCondition,
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

    return c.json({
      success: true,
      message: '获取角色列表成功',
      data: { characters, pagination },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('获取角色列表时出错:', error)
    return c.json(
      {
        success: false,
        error: {
          message: '获取角色列表时出错',
          code: 'INTERNAL_SERVER_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

// 创建角色路由
const createCharacterRoute = createAuthenticatedRoute({
  method: 'post',
  path: '/api/characters',
  tags: ['Characters'],
  summary: '创建 AI 角色',
  description: '创建新的 AI 聊天角色',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateCharacterSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: '角色创建成功',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CharacterSchema),
        },
      },
    },
    ...commonResponses,
  },
})

charactersOpenAPI.openapi(createCharacterRoute, async (c) => {
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

  const body = await c.req.json()
  const validated = body

  try {
    const [newCharacter] = await db
      .insert(ctr)
      .values({
        ...(validated as any),
        creatorId: session.user.id,
      })
      .returning()

    return c.json(
      {
        success: true,
        message: '角色创建成功',
        data: newCharacter,
        timestamp: new Date().toISOString(),
      },
      201,
    )
  } catch (error) {
    console.error('创建角色时出错:', error)
    return c.json(
      {
        success: false,
        error: {
          message: '创建角色时出错',
          code: 'INTERNAL_SERVER_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

// 获取角色详情路由
const getCharacterRoute = createAuthenticatedRoute({
  method: 'get',
  path: '/api/characters/{id}',
  tags: ['Characters'],
  summary: '获取角色详情',
  description: '根据 ID 获取特定角色的详细信息',
  request: {
    params: z.object({
      id: z.string().min(1, '角色ID不能为空'),
    }),
  },
  responses: {
    200: {
      description: '成功获取角色详情',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CharacterSchema),
        },
      },
    },
    ...commonResponses,
  },
})

charactersOpenAPI.openapi(getCharacterRoute, async (c) => {
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
          message: '角色ID不能为空',
          code: 'BAD_REQUEST',
        },
        timestamp: new Date().toISOString(),
      },
      400,
    )
  }

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
      return c.json(
        {
          success: false,
          error: {
            message: '角色不存在',
            code: 'NOT_FOUND',
          },
          timestamp: new Date().toISOString(),
        },
        404,
      )
    }

    if (
      characterData.visibility === 'private' &&
      characterData.creatorId !== session.user.id
    ) {
      return c.json(
        {
          success: false,
          error: {
            message: '您没有权限查看此角色',
            code: 'FORBIDDEN',
          },
          timestamp: new Date().toISOString(),
        },
        403,
      )
    }

    return c.json({
      success: true,
      message: '获取角色详情成功',
      data: characterData,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('获取角色信息时出错:', error)
    return c.json(
      {
        success: false,
        error: {
          message: '获取角色信息时出错',
          code: 'INTERNAL_SERVER_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

// 完整更新角色路由
const updateCharacterRoute = createAuthenticatedRoute({
  method: 'put',
  path: '/api/characters/{id}',
  tags: ['Characters'],
  summary: '更新角色信息（完整更新）',
  description: '完整更新角色的所有信息',
  request: {
    params: z.object({
      id: z.string().min(1, '角色ID不能为空'),
    }),
    body: {
      content: {
        'application/json': {
          schema: CreateCharacterSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: '角色更新成功',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CharacterSchema),
        },
      },
    },
    ...commonResponses,
  },
})

charactersOpenAPI.openapi(updateCharacterRoute, async (c) => {
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
          message: '角色ID不能为空',
          code: 'BAD_REQUEST',
        },
        timestamp: new Date().toISOString(),
      },
      400,
    )
  }

  const body = await c.req.json()
  const validated = body

  try {
    // 检查角色是否为当前用户创建
    const existingCharacter = await db.query.character.findFirst({
      where: and(eq(ctr.id, id), eq(ctr.creatorId, session.user.id)),
    })

    if (!existingCharacter) {
      return c.json(
        {
          success: false,
          error: {
            message: '角色不存在或您没有权限更新此角色',
            code: 'FORBIDDEN',
          },
          timestamp: new Date().toISOString(),
        },
        403,
      )
    }

    const [updatedCharacter] = await db
      .update(ctr)
      .set({
        ...(validated as any),
        updatedAt: new Date(),
      })
      .where(eq(ctr.id, id))
      .returning()

    return c.json({
      success: true,
      message: '角色信息已成功更新',
      data: updatedCharacter,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('更新角色信息时出错:', error)
    return c.json(
      {
        success: false,
        error: {
          message: '更新角色信息时出错',
          code: 'INTERNAL_SERVER_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

// 部分更新角色路由
const patchCharacterRoute = createAuthenticatedRoute({
  method: 'patch',
  path: '/api/characters/{id}',
  tags: ['Characters'],
  summary: '更新角色信息（部分更新）',
  description: '部分更新角色信息，只更新提供的字段',
  request: {
    params: z.object({
      id: z.string().min(1, '角色ID不能为空'),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateCharacterSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: '角色更新成功',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CharacterSchema),
        },
      },
    },
    ...commonResponses,
  },
})

charactersOpenAPI.openapi(patchCharacterRoute, async (c) => {
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
          message: '角色ID不能为空',
          code: 'BAD_REQUEST',
        },
        timestamp: new Date().toISOString(),
      },
      400,
    )
  }

  const body = await c.req.json()
  const validated = body

  // 如果没有要更新的字段
  if (Object.keys(validated).length === 0) {
    return c.json(
      {
        success: false,
        error: {
          message: '没有提供要更新的字段',
          code: 'BAD_REQUEST',
        },
        timestamp: new Date().toISOString(),
      },
      400,
    )
  }

  try {
    // 检查角色是否为当前用户创建
    const existingCharacter = await db.query.character.findFirst({
      where: and(eq(ctr.id, id), eq(ctr.creatorId, session.user.id)),
    })

    if (!existingCharacter) {
      return c.json(
        {
          success: false,
          error: {
            message: '角色不存在或您没有权限更新此角色',
            code: 'FORBIDDEN',
          },
          timestamp: new Date().toISOString(),
        },
        403,
      )
    }

    const [updatedCharacter] = await db
      .update(ctr)
      .set({
        ...(validated as any),
        updatedAt: new Date(),
      })
      .where(eq(ctr.id, id))
      .returning()

    return c.json({
      success: true,
      message: '角色信息已成功更新',
      data: updatedCharacter,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('更新角色信息时出错:', error)
    return c.json(
      {
        success: false,
        error: {
          message: '更新角色信息时出错',
          code: 'INTERNAL_SERVER_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

// 删除角色路由
const deleteCharacterRoute = createAuthenticatedRoute({
  method: 'delete',
  path: '/api/characters/{id}',
  tags: ['Characters'],
  summary: '删除角色',
  description: '删除指定的 AI 角色（仅创建者可删除）',
  request: {
    params: z.object({
      id: z.string().min(1, '角色ID不能为空'),
    }),
  },
  responses: {
    200: {
      description: '角色删除成功',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.null()),
        },
      },
    },
    ...commonResponses,
  },
})

charactersOpenAPI.openapi(deleteCharacterRoute, async (c) => {
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
          message: '角色ID不能为空',
          code: 'BAD_REQUEST',
        },
        timestamp: new Date().toISOString(),
      },
      400,
    )
  }

  try {
    // 检查角色是否为当前用户创建
    const existingCharacter = await db.query.character.findFirst({
      where: and(eq(ctr.id, id), eq(ctr.creatorId, session.user.id)),
    })

    if (!existingCharacter) {
      return c.json(
        {
          success: false,
          error: {
            message: '角色不存在或您没有权限删除此角色',
            code: 'FORBIDDEN',
          },
          timestamp: new Date().toISOString(),
        },
        403,
      )
    }

    await db.delete(ctr).where(eq(ctr.id, id))

    return c.json({
      success: true,
      message: '角色已成功删除',
      data: null,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('删除角色时出错:', error)
    return c.json(
      {
        success: false,
        error: {
          message: '删除角色时出错',
          code: 'INTERNAL_SERVER_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

// 设置类型以便在主应用中使用
export type CharactersOpenAPIType = typeof charactersOpenAPI
