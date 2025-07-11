import 'dotenv/config'
import tencentcloud from 'tencentcloud-sdk-nodejs-ses'

export class EmailService {
  private sender = new tencentcloud.ses.v20201002.Client({
    credential: {
      secretId: process.env.TENCENT_CLOUD_SECRET_ID,
      secretKey: process.env.TENCENT_CLOUD_SECRET_KEY,
    },
    region: 'ap-hongkong',
    profile: {
      httpProfile: {
        reqMethod: 'POST',
        reqTimeout: 30,
        endpoint: 'ses.tencentcloudapi.com',
      },
    },
  })

  async sendEmail({
    to,
    subject,
    templateId,
    templateData,
  }: {
    to: string
    subject: string
    templateId: number
    templateData: object
  }) {
    const params = {
      FromEmailAddress: 'momotalk-plus@shirabe.cn',
      Destination: [to],
      Subject: subject,
      Template: {
        TemplateID: templateId,
        TemplateData: JSON.stringify(templateData),
      },
    }

    try {
      const response = await this.sender.SendEmail(params)
      console.log('发送邮件成功:', response)
    } catch (error) {
      console.error('发送邮件失败:', error)
      throw error
    }
  }
}

export const emailService = new EmailService()
