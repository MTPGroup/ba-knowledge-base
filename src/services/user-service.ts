import { db } from '@/lib/database'
import { userSettings } from '~/db/app-schema'
import { eq } from 'drizzle-orm'

// 获取用户设置，如果不存在则创建默认值
export async function getUserSettings(userId: string) {
  let settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  })

  if (!settings) {
    ;[settings] = await db
      .insert(userSettings)
      .values({ userId: userId })
      .returning()
  }

  return settings
}

// 更新用户设置
export async function updateUserSettings(
  userId: string,
  data: Partial<typeof userSettings.$inferInsert>,
) {
  const [updatedSettings] = await db
    .update(userSettings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId))
    .returning()

  return updatedSettings
}
