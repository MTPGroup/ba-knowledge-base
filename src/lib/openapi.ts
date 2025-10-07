import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Variables } from '@/lib/auth'

// 创建 OpenAPI 应用实例
export const createOpenAPIApp = () => {
  return new OpenAPIHono<{ Variables: Variables }>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            success: false,
            error: {
              message: '请求参数验证失败',
              code: 'VALIDATION_ERROR',
              details: result.error.flatten(),
            },
            timestamp: new Date().toISOString(),
          },
          400,
        )
      }
    },
  })
}

// 通用响应模式
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    message: z.string().optional(),
    data: dataSchema,
    timestamp: z.string(),
  })

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    message: z.string(),
    code: z.string(),
    details: z.any().optional(),
  }),
  timestamp: z.string(),
})

export const PaginationResponseSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
) =>
  z.object({
    success: z.literal(true),
    message: z.string().optional(),
    data: z.object({
      items: z.array(itemSchema),
      pagination: z.object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        totalPages: z.number(),
        hasNext: z.boolean(),
        hasPrev: z.boolean(),
      }),
    }),
    timestamp: z.string(),
  })

// 用户模式
export const UserSchema = z.object({
  id: z.string().describe('用户唯一标识'),
  name: z.string().describe('用户姓名'),
  email: z.string().email().describe('用户邮箱'),
  username: z.string().optional().describe('用户名'),
  image: z.string().url().optional().describe('用户头像URL'),
  createdAt: z.string().describe('创建时间'),
  updatedAt: z.string().describe('更新时间'),
})

// 创建者简化模式
export const CreatorSchema = z.object({
  id: z.string().describe('用户唯一标识'),
  name: z.string().describe('用户姓名'),
  image: z.string().url().optional().describe('用户头像URL'),
  username: z.string().optional().describe('用户名'),
})

// AI 角色模式
export const CharacterSchema = z.object({
  id: z.string().describe('角色唯一标识'),
  name: z.string().min(1).max(100).describe('角色名称'),
  signature: z.string().max(200).optional().describe('角色签名'),
  avatarUrl: z.string().url().optional().describe('角色头像URL'),
  persona: z.string().max(2000).optional().describe('角色人格描述'),
  visibility: z.enum(['public', 'private']).describe('可见性'),
  creatorId: z.string().describe('创建者ID'),
  createdAt: z.string().describe('创建时间'),
  updatedAt: z.string().describe('更新时间'),
  creator: CreatorSchema.optional(),
})

export const CreateCharacterSchema = z.object({
  name: z
    .string()
    .min(1, '角色名称不能为空')
    .max(100, '角色名称不能超过100个字符'),
  signature: z.string().max(200, '签名不能超过200个字符').optional(),
  avatarUrl: z.string().url('头像URL格式不正确').optional(),
  persona: z.string().max(2000, '人格描述不能超过2000个字符').optional(),
  visibility: z.enum(['public', 'private']).default('private'),
})

export const UpdateCharacterSchema = CreateCharacterSchema.partial()

// 聊天会话模式
export const ChatSchema = z.object({
  id: z.string().describe('会话唯一标识'),
  title: z.string().describe('会话标题'),
  description: z.string().optional().describe('会话描述'),
  avatarUrl: z.string().url().optional().describe('会话头像URL'),
  lastMessage: z.string().describe('最后一条消息'),
  creatorId: z.string().describe('创建者ID'),
  characterId: z.string().describe('角色ID'),
  createdAt: z.string().describe('创建时间'),
  updatedAt: z.string().describe('更新时间'),
  character: CharacterSchema.optional(),
})

export const CreateChatSchema = z.object({
  characterId: z.string().min(1, '角色ID不能为空'),
  title: z.string().min(1, '标题不能为空'),
  avatarUrl: z.string().url().optional(),
  description: z.string().optional(),
})

export const UpdateChatSchema = z.object({
  title: z.string().min(1, '标题不能为空'),
  avatarUrl: z.string().url().optional(),
  description: z.string().optional(),
})

// 消息模式
export const MessageSchema = z.object({
  id: z.string().describe('消息唯一标识'),
  chatId: z.string().describe('会话ID'),
  role: z.enum(['user', 'ai']).describe('消息角色'),
  content: z.string().describe('消息内容'),
  createdAt: z.string().describe('创建时间'),
  sender: z
    .object({
      name: z.string(),
      avatar: z.string().optional(),
    })
    .optional(),
})

export const SendMessageSchema = z.object({
  message: z.string().min(1, '消息不能为空'),
})

// 联系人模式
export const ContactSchema = CharacterSchema

// 上传模式
export const UploadResultSchema = z.object({
  url: z.string().url().describe('文件访问URL'),
  key: z.string().describe('文件存储键值'),
  originalName: z.string().describe('原始文件名'),
  size: z.number().describe('文件大小(字节)'),
  type: z.string().describe('文件MIME类型'),
  pathType: z.string().describe('上传路径类型'),
  userId: z.string().optional().describe('用户ID'),
})

export const BatchUploadResultSchema = z.object({
  uploaded: z.array(UploadResultSchema).describe('成功上传的文件'),
  errors: z.array(z.string()).describe('上传失败的错误信息'),
  total: z.number().describe('总文件数'),
  success: z.number().describe('成功上传数'),
  failed: z.number().describe('上传失败数'),
  pathType: z.string().describe('上传路径类型'),
  userId: z.string().optional().describe('用户ID'),
})

export const PathTypesSchema = z.object({
  pathTypes: z.array(z.string()).describe('支持的路径类型列表'),
  descriptions: z.record(z.string(), z.string()).describe('路径类型说明'),
})

// 查询参数模式
export const PaginationQuerySchema = z.object({
  page: z.string().optional().describe('页码，默认为1'),
  limit: z.string().optional().describe('每页数量，默认为20，最大100'),
})

export const CharacterListQuerySchema = PaginationQuerySchema.extend({
  visibility: z.enum(['public', 'private', 'all']).optional(),
  search: z.string().optional(),
})

export const MessageListQuerySchema = z.object({
  limit: z.string().optional().describe('消息数量限制，默认为20，最大100'),
  before: z.string().optional().describe('获取指定时间之前的消息'),
})

// 通用标签定义
export const tags = [
  {
    name: 'Authentication',
    description: '用户认证相关接口',
  },
  {
    name: 'Characters',
    description: 'AI 角色管理接口',
  },
  {
    name: 'Chats',
    description: '聊天会话管理接口',
  },
  {
    name: 'Messages',
    description: '消息管理接口',
  },
  {
    name: 'Contacts',
    description: '联系人管理接口',
  },
  {
    name: 'Upload',
    description: '文件上传接口',
  },
]

// 安全配置
export const securitySchemes = {
  BearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Better Auth Bearer Token',
  },
} as const

// OpenAPI 基础信息
export const openAPIInfo = {
  title: 'AI 角色聊天系统 API',
  version: '1.0.0',
  description: '基于 HonoJS 和 Better Auth 构建的 AI 角色聊天系统',
  contact: {
    name: 'API Support',
    email: 'hanasakayui2022@gmail.com',
  },
  license: {
    name: 'MIT',
    url: 'https://opensource.org/licenses/MIT',
  },
}

// 服务器配置
export const servers = [
  {
    url: 'https://api.shirabe.cn',
    description: '生产环境',
  },
  {
    url: 'http://localhost:3001',
    description: '开发环境',
  },
]

// 通用路由工厂函数
export const createAuthenticatedRoute = (
  config: Parameters<typeof createRoute>[0],
) => {
  return createRoute({
    ...config,
    security: [{ BearerAuth: [] }],
  })
}

// 错误响应定义
export const commonResponses = {
  400: {
    description: '请求参数错误',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
      },
    },
  },
  401: {
    description: '未授权访问',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
      },
    },
  },
  403: {
    description: '权限不足',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
      },
    },
  },
  404: {
    description: '资源不存在',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
      },
    },
  },
  500: {
    description: '服务器内部错误',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
      },
    },
  },
}
