export interface IMessage {
  id: string // 消息唯一标识符
  role: 'user' | 'assistant' | 'system' // 消息角色
  content: string // 消息内容
  timestamp: Date // 消息发送时间
  metadata?: Record<string, any> // 可选的元数据，用于存储额外信息
}
