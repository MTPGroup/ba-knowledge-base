import { Hono } from 'hono'
import {
  COSService,
  cosService,
  type UploadPathType,
} from '@/services/cos-service'

export const upload = new Hono()

/**
 * 上传图片 API
 * POST /api/upload/image
 * Content-Type: multipart/form-data
 *
 * Form 参数:
 * - image: 图片文件 (必需)
 * - path: 上传路径类型 (可选, 默认为 'general')
 * - userId: 用户ID (可选, 用于用户相关的文件分类)
 */
upload.post('/image', async (c) => {
  try {
    // 检查环境变量配置
    if (
      !process.env.TENCENT_CLOUD_SECRET_ID ||
      !process.env.TENCENT_CLOUD_SECRET_KEY ||
      !process.env.TENCENT_COS_BUCKET
    ) {
      return c.json(
        {
          success: false,
          message: '腾讯云 COS 配置缺失，请检查环境变量',
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
          success: false,
          message: '请选择要上传的图片文件',
        },
        400,
      )
    }

    // 验证路径类型
    if (!COSService.isValidPathType(pathType)) {
      return c.json(
        {
          success: false,
          message: `不支持的路径类型: ${pathType}。支持的类型: ${COSService.getSupportedPathTypes().join(', ')}`,
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
          success: false,
          message: '不支持的文件类型，请上传 JPG、PNG、GIF 或 WebP 格式的图片',
        },
        400,
      )
    }

    // 验证文件大小 (5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      return c.json(
        {
          success: false,
          message: '文件大小不能超过 5MB',
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

    return c.json({
      success: true,
      message: '图片上传成功',
      data: {
        url: result.url,
        key: result.key,
        originalName: file.name,
        size: file.size,
        type: file.type,
        pathType,
        userId,
      },
    })
  } catch (error) {
    console.error('图片上传错误:', error)
    return c.json(
      {
        success: false,
        message: error instanceof Error ? error.message : '图片上传失败',
      },
      500,
    )
  }
})

/**
 * 批量上传图片 API (支持指定路径)
 * POST /api/upload/images
 * Content-Type: multipart/form-data
 *
 * Form 参数:
 * - images: 图片文件数组 (必需)
 * - path: 上传路径类型 (可选, 默认为 'general')
 * - userId: 用户ID (可选)
 */
upload.post('/images', async (c) => {
  try {
    // 环境变量检查
    if (
      !process.env.TENCENT_CLOUD_SECRET_ID ||
      !process.env.TENCENT_CLOUD_SECRET_KEY ||
      !process.env.TENCENT_COS_BUCKET
    ) {
      return c.json(
        {
          success: false,
          message: '腾讯云 COS 配置缺失，请检查环境变量',
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
          success: false,
          message: '请选择要上传的图片文件',
        },
        400,
      )
    }

    // 验证路径类型
    if (!COSService.isValidPathType(pathType)) {
      return c.json(
        {
          success: false,
          message: `不支持的路径类型: ${pathType}。支持的类型: ${COSService.getSupportedPathTypes().join(', ')}`,
        },
        400,
      )
    }

    // 处理单个文件或多个文件
    const fileList = Array.isArray(files) ? files : [files]

    if (fileList.length > 10) {
      return c.json(
        {
          success: false,
          message: '一次最多只能上传 10 张图片',
        },
        400,
      )
    }

    const results = []
    const errors = []

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

        results.push({
          url: result.url,
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
      success: results.length > 0,
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
    })
  } catch (error) {
    console.error('批量图片上传错误:', error)
    return c.json(
      {
        success: false,
        message: '批量图片上传失败',
      },
      500,
    )
  }
})

/**
 * 获取支持的路径类型列表
 * GET /api/upload/path-types
 */
upload.get('/path-types', (c) => {
  return c.json({
    success: true,
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
  })
})
