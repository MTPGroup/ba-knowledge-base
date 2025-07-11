import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer, emailOTP, openAPI, username } from 'better-auth/plugins'
import { db } from '@/lib/database'
import { emailService } from '@/services/email-service'
import * as schema from '~/db'
import {
  ACTION_LINK_TEMPLATE_ID,
  OTP_TEMPLATE_ID,
  PRODUCT_NAME,
} from '@/utils/constant'

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
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await emailService.sendEmail({
        to: user.email,
        subject: '重置密码',
        templateId: ACTION_LINK_TEMPLATE_ID,
        templateData: {
          title: '重置您的密码',
          greeting: `您好，${user.name || user.email}！`,
          main_text: `我们收到了一个重置您 ${PRODUCT_NAME} 账户密码的请求。请点击下方的按钮来设置新的密码。如果您没有请求重置密码，请忽略此邮件。`,
          button_text: '重置密码',
          action_url: url,
          product_name: PRODUCT_NAME,
        },
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
        templateId: ACTION_LINK_TEMPLATE_ID,
        templateData: {
          title: '验证您的电子邮件地址',
          greeting: `欢迎加入 ${PRODUCT_NAME}！`,
          main_text:
            '为了完成注册，请点击下方的按钮来验证您的邮箱。我们期待您的加入！',
          button_text: '立即验证邮箱',
          action_url: url,
          product_name: PRODUCT_NAME,
        },
      })
    },
  },
  plugins: [
    username(),
    bearer(),
    openAPI(),
    emailOTP({
      sendVerificationOTP: async ({ email, otp, type }) => {
        let reason = ''
        if (type === 'sign-in') {
          reason = '登录'
        } else if (type === 'email-verification') {
          reason = '注册'
        } else {
          reason = '重置密码'
        }

        await emailService.sendEmail({
          to: email,
          subject: `您的 ${PRODUCT_NAME} ${reason} 验证码`,
          templateId: OTP_TEMPLATE_ID,
          templateData: {
            greeting: '您好！',
            reason: reason,
            otp_code: otp,
            product_name: PRODUCT_NAME,
          },
        })
      },
    }),
  ],
})

export type BetterAuthSession = typeof auth.$Infer.Session
export type BetterAuthUser = typeof auth.$Infer.Session.user

export type Variables = {
  session: BetterAuthSession
}
