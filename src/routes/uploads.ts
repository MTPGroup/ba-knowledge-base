import { createRoute, z } from '@hono/zod-openapi'
import {
  createOpenAPIApp,
  UploadResultSchema,
  BatchUploadResultSchema,
  PathTypesSchema,
  SuccessResponseSchema,
  commonResponses,
} from '@/lib/openapi'
import {
  COSService,
  cosService,
  type UploadPathType,
} from '@/services/cos-service'

export const uploadOpenAPI = createOpenAPIApp()

// 单张图片上传路由
const uploadImageRoute = createRoute({
  method: 'post',
  path: '/api/uploads/images',
  tags: ['Upload'],
  summary: '上传图片',
  description: '上传单张图片到腾讯云 COS 存储',
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            image: z
              .any()
              .openapi({ type: 'string', format: 'binary' })
              .describe('图片文件 (必需)'),
            path: z
              .string()
              .optional()
              .describe('上传路径类型 (可选, 默认为 general)'),
            userId: z
              .string()
              .optional()
              .describe('用户ID (可选, 用于用户相关的文件分类)'),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: '图片上传成功',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(UploadResultSchema),
        },
      },
    },
    ...commonResponses,
  },
})

uploadOpenAPI.openapi(uploadImageRoute, async (c: any) => {
  try {
    // 检查环境变量配置
    if (
      !process.env.TENCENT_CLOUD_SECRET_ID ||
      !process.env.TENCENT_CLOUD_SECRET_KEY ||
      !process.env.TENCENT_COS_BUCKET
    ) {
      return c.json(
        {
          success: false as const,
          error: {
            message: '腾讯云 COS 配置缺失，请检查环境变量',
            code: 'CONFIG_ERROR',
          },
          timestamp: new Date().toISOString(),
        },
        500,
      )
    }

    const body = await c.req.parseBody()
    const file = body['image'] as File
    const pathType = (body['path'] as string) || 'general'
    const userId = body['userId'] as string | undefined

    if (!file) {
      return c.json(
        {
          success: false as const,
          error: {
            message: '请选择要上传的图片文件',
            code: 'FILE_REQUIRED',
          },
          timestamp: new Date().toISOString(),
        },
        400,
      )
    }

    // 验证路径类型
    if (!COSService.isValidPathType(pathType)) {
      return c.json(
        {
          success: false as const,
          error: {
            message: `不支持的路径类型: ${pathType}。支持的类型: ${COSService.getSupportedPathTypes().join(', ')}`,
            code: 'INVALID_PATH_TYPE',
          },
          timestamp: new Date().toISOString(),
        },
        400,
      )
    }

    // 验证文件类型
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
    ]
    if (!allowedTypes.includes(file.type)) {
      return c.json(
        {
          success: false as const,
          error: {
            message:
              '不支持的文件类型，请上传 JPG、PNG、GIF 或 WebP 格式的图片',
            code: 'INVALID_FILE_TYPE',
          },
          timestamp: new Date().toISOString(),
        },
        400,
      )
    }

    // 验证文件大小 (5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      return c.json(
        {
          success: false as const,
          error: {
            message: '文件大小不能超过 5MB',
            code: 'FILE_TOO_LARGE',
          },
          timestamp: new Date().toISOString(),
        },
        400,
      )
    }

    // 将文件转换为 Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 上传到腾讯云 COS
    const result = await cosService.uploadImage(
      buffer,
      file.name,
      pathType as UploadPathType,
      userId,
    )

    // 检测是否配置自定义域名
    const domain = process.env.TENCENT_COS_DOMAIN
    const url = domain ? `${domain}/${result.key}` : result.url

    return c.json({
      success: true as const,
      message: '图片上传成功',
      data: {
        url: url,
        key: result.key,
        originalName: file.name,
        size: file.size,
        type: file.type,
        pathType,
        userId,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('图片上传错误:', error)
    return c.json(
      {
        success: false as const,
        error: {
          message: error instanceof Error ? error.message : '图片上传失败',
          code: 'UPLOAD_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

// 批量图片上传路由
const uploadImagesRoute = createRoute({
  method: 'post',
  path: '/api/uploads/images/batch',
  tags: ['Upload'],
  summary: '批量上传图片',
  description: '批量上传图片文件，最多支持 10 张图片同时上传',
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            images: z
              .union([
                z.any().openapi({ type: 'string', format: 'binary' }),
                z.array(z.any().openapi({ type: 'string', format: 'binary' })),
              ])
              .describe('图片文件数组 (必需)'),
            path: z
              .string()
              .optional()
              .describe('上传路径类型 (可选, 默认为 general)'),
            userId: z.string().optional().describe('用户ID (可选)'),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: '批量图片上传完成',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(BatchUploadResultSchema),
        },
      },
    },
    ...commonResponses,
  },
})

uploadOpenAPI.openapi(uploadImagesRoute, async (c: any) => {
  try {
    // 环境变量检查
    if (
      !process.env.TENCENT_CLOUD_SECRET_ID ||
      !process.env.TENCENT_CLOUD_SECRET_KEY ||
      !process.env.TENCENT_COS_BUCKET
    ) {
      return c.json(
        {
          success: false as const,
          error: {
            message: '腾讯云 COS 配置缺失，请检查环境变量',
            code: 'CONFIG_ERROR',
          },
          timestamp: new Date().toISOString(),
        },
        500,
      )
    }

    const body = await c.req.parseBody()
    const files = body['images'] as File[] | File
    const pathType = (body['path'] as string) || 'general'
    const userId = body['userId'] as string | undefined

    if (!files) {
      return c.json(
        {
          success: false as const,
          error: {
            message: '请选择要上传的图片文件',
            code: 'FILES_REQUIRED',
          },
          timestamp: new Date().toISOString(),
        },
        400,
      )
    }

    // 验证路径类型
    if (!COSService.isValidPathType(pathType)) {
      return c.json(
        {
          success: false as const,
          error: {
            message: `不支持的路径类型: ${pathType}。支持的类型: ${COSService.getSupportedPathTypes().join(', ')}`,
            code: 'INVALID_PATH_TYPE',
          },
          timestamp: new Date().toISOString(),
        },
        400,
      )
    }

    // 处理单个文件或多个文件
    const fileList = Array.isArray(files) ? files : [files]

    if (fileList.length > 10) {
      return c.json(
        {
          success: false as const,
          error: {
            message: '一次最多只能上传 10 张图片',
            code: 'TOO_MANY_FILES',
          },
          timestamp: new Date().toISOString(),
        },
        400,
      )
    }

    const results = []
    const errors = []

    // 检测是否配置自定义域名
    const domain = process.env.TENCENT_COS_DOMAIN

    for (const file of fileList) {
      try {
        // 验证文件类型和大小
        const allowedTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'image/webp',
        ]
        if (!allowedTypes.includes(file.type)) {
          errors.push(`${file.name}: 不支持的文件类型`)
          continue
        }

        const maxSize = 5 * 1024 * 1024
        if (file.size > maxSize) {
          errors.push(`${file.name}: 文件大小超过 5MB`)
          continue
        }

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const result = await cosService.uploadImage(
          buffer,
          file.name,
          pathType as UploadPathType,
          userId,
        )

        const url = domain ? `${domain}/${result.key}` : result.url

        results.push({
          url: url,
          key: result.key,
          originalName: file.name,
          size: file.size,
          type: file.type,
          pathType,
          userId,
        })
      } catch (error) {
        errors.push(`${file.name}: 上传失败`)
      }
    }

    return c.json({
      success: true as const,
      message: `成功上传 ${results.length} 张图片${errors.length > 0 ? `，${errors.length} 张失败` : ''}`,
      data: {
        uploaded: results,
        errors: errors,
        total: fileList.length,
        success: results.length,
        failed: errors.length,
        pathType,
        userId,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('批量图片上传错误:', error)
    return c.json(
      {
        success: false as const,
        error: {
          message: '批量图片上传失败',
          code: 'BATCH_UPLOAD_ERROR',
        },
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
})

// 获取支持的路径类型路由
const getPathTypesRoute = createRoute({
  method: 'get',
  path: '/api/uploads/path-types',
  tags: ['Upload'],
  summary: '获取支持的路径类型',
  description: '获取文件上传支持的所有路径类型及其说明',
  responses: {
    200: {
      description: '成功获取路径类型列表',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(PathTypesSchema),
        },
      },
    },
  },
})

uploadOpenAPI.openapi(getPathTypesRoute, (c) => {
  return c.json({
    success: true as const,
    message: '获取路径类型列表成功',
    data: {
      pathTypes: COSService.getSupportedPathTypes(),
      descriptions: {
        'user-avatar': '用户头像',
        'user-background': '用户背景图',
        'character-avatar': '角色头像',
        'character-background': '角色背景图',
        'chat-image': '聊天中的图片',
        general: '通用图片',
      },
    },
    timestamp: new Date().toISOString(),
  })
})

export type UploadOpenAPIType = typeof uploadOpenAPI
