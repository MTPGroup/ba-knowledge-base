import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer, emailOTP, openAPI, username } from 'better-auth/plugins'
import { db } from '@/lib/database'
import { emailService } from '@/services/email-service'
import * as schema from '~/db'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  account: {
    updateAccountOnSignIn: true,
    accountLinking: {
      enabled: true,
      trustedProviders: ['email-password'],
    },
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await emailService.sendEmail({
        to: user.email,
        subject: '重置密码',
        html: `<p>请点击以下链接重置您的密码：<a href="${url}">${url}</a></p>`,
      })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await emailService.sendEmail({
        to: user.email,
        subject: '请验证您的电子邮件地址',
        html: `<p>请点击以下链接验证您的电子邮件地址：<a href="${url}">${url}</a></p>`,
      })
    },
  },
  plugins: [
    username(),
    bearer(),
    openAPI(),
    emailOTP({
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type === 'sign-in') {
          emailService.sendEmail({
            to: email,
            subject: '登录验证码',
            html: `<p>你的登录验证码为<strong>${otp}</strong>.</p>`,
          })
        } else if (type === 'email-verification') {
          emailService.sendEmail({
            to: email,
            subject: '注册验证码',
            html: `<p>你的注册验证码为<strong>${otp}</strong>.</p>`,
          })
        } else {
          emailService.sendEmail({
            to: email,
            subject: '重置密码验证码',
            html: `<p>你的重置密码验证码为<strong>${otp}</strong>.</p>`,
          })
        }
      },
    }),
  ],
})

export type BetterAuthSession = typeof auth.$Infer.Session
export type BetterAuthUser = typeof auth.$Infer.Session.user

export type Variables = {
  session: BetterAuthSession
}
