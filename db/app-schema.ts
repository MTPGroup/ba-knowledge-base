import {
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { account, session, user } from './better-auth-schema'
import { relations, sql } from 'drizzle-orm'
import { timestamps } from './column-helpers'

// AI 角色表
export const character = pgTable('character', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  // 角色创建者
  creatorId: text('creator_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // 角色名称
  name: text('name').notNull(),
  // 角色签名（可选）
  signature: text('signature'),
  // 角色核心设定/性格描述（可选）
  persona: text('persona'),
  // 角色头像URL（可选）
  avatarUrl: text('avatar_url'),
  // 可见性: 公开或私有）
  visibility: varchar('visibility', { enum: ['public', 'private'] }).default(
    'private',
  ),
  ...timestamps,
})

// 聊天会话表
export const chat = pgTable('chat', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  // 会话创建者
  creatorId: text('creator_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // 会话关联的角色
  characterId: uuid('character_id')
    .notNull()
    .references(() => character.id, { onDelete: 'cascade' }),
  // 会话标题
  title: text('title').notNull(),
  // 会话描述（可选）
  description: text('description'),
  // 会话头像URL（可选）
  avatarUrl: text('avatar_url'),
  // 最后一条消息的文本表示（可选，默认为空）
  lastMessage: text('last_message').default(''),
  ...timestamps,
})

// 聊天消息表
export const message = pgTable('message', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  // 消息所属会话
  chatId: uuid('chat_id')
    .notNull()
    .references(() => chat.id, { onDelete: 'cascade' }),
  // 发送者角色
  role: varchar('role', { enum: ['user', 'ai'] }).notNull(),
  // 消息内容
  content: jsonb('content').notNull(),
  // 消息类型: 文本、图片等
  type: varchar('type', { enum: ['text', 'image', 'file'] })
    .default('text')
    .notNull(),
  ...timestamps,
})

// 用户联系人联结表 (多对多关系)
export const userCharacterContacts = pgTable(
  'user_character_contacts',
  {
    // 关联的用户 ID
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // 关联的角色 ID
    characterId: uuid('character_id')
      .notNull()
      .references(() => character.id, { onDelete: 'cascade' }),
    // 添加联系人的时间
    addedAt: timestamp('added_at').defaultNow().notNull(),
  },
  (table) => [
    // 确保一个用户只能添加一个角色一次
    primaryKey({
      columns: [table.userId, table.characterId],
    }),
  ],
)

// 用户关系
export const usersRelation = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  createdCharacters: many(character), // 一个用户可以创建多个角色
  chats: many(chat), // 一个用户可以有多个聊天
  contacts: many(userCharacterContacts), // 用户可以有多个联系人
}))

// AI 角色关系
export const charactersRelation = relations(character, ({ one, many }) => ({
  creator: one(user, {
    fields: [character.creatorId],
    references: [user.id],
  }), // 一个角色属于一个创建者
  chats: many(chat), // 一个角色可以参与多个聊天
  addedByUsers: many(userCharacterContacts), // 角色可以被多个用户添加为联系人
}))

// 用户联系人联结表关系
export const userCharacterContactsRelation = relations(
  userCharacterContacts,
  ({ one }) => ({
    user: one(user, {
      fields: [userCharacterContacts.userId],
      references: [user.id],
    }), // 联系人属于一个用户
    character: one(character, {
      fields: [userCharacterContacts.characterId],
      references: [character.id],
    }), // 联系人关联一个角色
  }),
)

// 聊天会话关系
export const chatsRelation = relations(chat, ({ one, many }) => ({
  user: one(user, {
    fields: [chat.creatorId],
    references: [user.id],
  }), // 一次聊天属于一个用户
  character: one(character, {
    fields: [chat.characterId],
    references: [character.id],
  }), // 一次聊天是关于一个角色的
  messages: many(message), // 一次聊天包含多条消息
}))

// 消息关系
export const messagesRelation = relations(message, ({ one }) => ({
  chat: one(chat, {
    fields: [message.chatId],
    references: [chat.id],
  }), // 一条消息属于一次聊天
}))
