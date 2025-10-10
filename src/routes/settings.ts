import { z } from '@hono/zod-openapi'
import {
  createOpenAPIApp,
  createAuthenticatedRoute,
  commonResponses,
  SuccessResponseSchema,
} from '@/lib/openapi'
import { getUserSettings, updateUserSettings } from '@/services/user-service'

const UserSettingsSchema = z.object({
  userId: z.string(),
  theme: z.enum(['light', 'dark', 'system']),
  language: z.enum(['zh-CN', 'en-US']),
  notificationsEnabled: z.boolean(),
  soundEnabled: z.boolean(),
  vibrationEnabled: z.boolean(),
  chatBackgroundUrl: z.url(),
  contactBackgroundUrl: z.url(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const UpdateUserSettingsSchema = UserSettingsSchema.omit({
  userId: true,
  createdAt: true,
  updatedAt: true,
}).partial()

export const settingsOpenAPI = createOpenAPIApp()

const getSettingsRoute = createAuthenticatedRoute({
  method: 'get',
  path: '/api/settings',
  tags: ['Settings'],
  summary: '获取用户设置',
  description: '获取当前登录用户的应用设置。',
  responses: {
    200: {
      description: '成功获取用户设置',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(UserSettingsSchema),
        },
      },
    },
    ...commonResponses,
  },
})

settingsOpenAPI.openapi(getSettingsRoute, async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json({ success: false, error: { message: '未授权' } }, 401)
  }

  try {
    const settings = await getUserSettings(session.user.id)
    return c.json({
      success: true,
      message: '成功获取用户设置',
      data: settings,
    })
  } catch (error) {
    console.error('获取用户设置时出错:', error)
    return c.json({ success: false, error: { message: '服务器内部错误' } }, 500)
  }
})

const updateSettingsRoute = createAuthenticatedRoute({
  method: 'patch',
  path: '/api/settings',
  tags: ['Settings'],
  summary: '更新用户设置',
  description: '更新当前登录用户的一个或多个应用设置。',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateUserSettingsSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: '成功更新用户设置',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(UserSettingsSchema),
        },
      },
    },
    ...commonResponses,
  },
})

settingsOpenAPI.openapi(updateSettingsRoute, async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json({ success: false, error: { message: '未授权' } }, 401)
  }

  const body = await c.req.json()

  try {
    const validatedData = UpdateUserSettingsSchema.parse(body)

    if (Object.keys(validatedData).length === 0) {
      return c.json(
        { success: false, error: { message: '请求体不能为空' } },
        400,
      )
    }

    const updatedSettings = await updateUserSettings(
      session.user.id,
      validatedData,
    )

    return c.json({
      success: true,
      message: '成功更新用户设置',
      data: updatedSettings,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json(
        {
          success: false,
          error: { message: '无效的输入', details: error.message },
        },
        400,
      )
    }
    console.error('更新用户设置时出错:', error)
    return c.json({ success: false, error: { message: '服务器内部错误' } }, 500)
  }
})
