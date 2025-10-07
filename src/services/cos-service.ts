import COS from 'cos-nodejs-sdk-v5'
import { Buffer } from 'buffer'

interface COSConfig {
  SecretId: string
  SecretKey: string
  Region: string
  Bucket: string
}

interface UploadResult {
  url: string
  key: string
  location: string
}

// 定义允许的上传路径类型
export type UploadPathType =
  | 'user-avatar' // 用户头像
  | 'user-background' // 用户背景
  | 'character-avatar' // 角色头像
  | 'character-background' // 角色背景
  | 'chat-image' // 聊天中的图片
  | 'general' // 通用图片

// 路径映射
const PATH_MAPPING: Record<UploadPathType, string> = {
  'user-avatar': 'avatars/users',
  'user-background': 'backgrounds/users',
  'character-avatar': 'avatars/characters',
  'character-background': 'backgrounds/characters',
  'chat-image': 'chat/images',
  general: 'images/general',
}

export class COSService {
  private cos: COS
  private bucket: string
  private region: string

  constructor(config: COSConfig) {
    this.cos = new COS({
      SecretId: config.SecretId,
      SecretKey: config.SecretKey,
    })
    this.bucket = config.Bucket
    this.region = config.Region
  }

  /**
   * 上传图片到腾讯云 COS
   * @param file 文件 buffer
   * @param fileName 文件名
   * @param pathType 上传路径类型
   * @param userId 用户ID（可选，用于进一步区分用户文件）
   * @returns Promise<UploadResult>
   */
  async uploadImage(
    file: Buffer,
    fileName: string,
    pathType: UploadPathType = 'general',
    userId?: string,
  ): Promise<UploadResult> {
    try {
      // 验证路径类型
      if (!PATH_MAPPING[pathType]) {
        throw new Error(`不支持的路径类型: ${pathType}`)
      }

      // 生成唯一的文件名
      const timestamp = Date.now()
      const randomString = Math.random().toString(36).substring(2, 15)
      const fileExtension = fileName.split('.').pop() || 'jpg'

      // 构建完整路径
      let basePath = PATH_MAPPING[pathType]
      if (
        userId &&
        (pathType.includes('user') || pathType.includes('character'))
      ) {
        basePath = `${basePath}/${userId}`
      }

      const key = `${basePath}/${timestamp}_${randomString}.${fileExtension}`

      const result = await new Promise<COS.PutObjectResult>(
        (resolve, reject) => {
          this.cos.putObject(
            {
              Bucket: this.bucket,
              Region: this.region,
              Key: key,
              Body: file,
              ContentType: this.getContentType(fileExtension),
            },
            (err, data) => {
              if (err) {
                reject(err)
              } else {
                resolve(data)
              }
            },
          )
        },
      )

      const url = `https://${this.bucket}.cos.${this.region}.myqcloud.com/${key}`

      return {
        url,
        key,
        location: result.Location,
      }
    } catch (error) {
      console.error('COS 上传失败:', error)
      throw new Error(`图片上传失败: ${error}`)
    }
  }

  /**
   * 根据文件扩展名获取 Content-Type
   */
  private getContentType(extension: string): string {
    const contentTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
    }
    return contentTypes[extension.toLowerCase()] || 'application/octet-stream'
  }

  /**
   * 获取所有支持的路径类型
   */
  static getSupportedPathTypes(): UploadPathType[] {
    return Object.keys(PATH_MAPPING) as UploadPathType[]
  }

  /**
   * 验证路径类型是否有效
   */
  static isValidPathType(pathType: string): pathType is UploadPathType {
    return Object.keys(PATH_MAPPING).includes(pathType as UploadPathType)
  }
}

// 单例模式导出 COS 服务实例
export const cosService = new COSService({
  SecretId: process.env.TENCENT_CLOUD_SECRET_ID || '',
  SecretKey: process.env.TENCENT_CLOUD_SECRET_KEY || '',
  Region: process.env.TENCENT_COS_REGION || 'ap-shanghai',
  Bucket: process.env.TENCENT_COS_BUCKET || '',
})
