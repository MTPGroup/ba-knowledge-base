import 'dotenv/config'
import { Resend } from 'resend'

export class EmailService {
  private sender = new Resend(process.env.RESEND_API_KEY)

  async sendEmail({
    to,
    subject,
    html,
  }: {
    to: string
    subject: string
    html: string
  }) {
    await this.sender.emails.send({
      from: 'MTP <onboarding@resend.dev>',
      to,
      subject,
      html,
    })
  }
}

export const emailService = new EmailService()
