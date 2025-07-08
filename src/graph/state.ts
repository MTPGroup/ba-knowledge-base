import { BaseMessage } from '@langchain/core/messages'

export interface AgentState {
  characterName: string
  messages: BaseMessage[]
  /// 从 Milvus 检索到的相关内容
  context?: string
  /// 对话的反思或总结
  reflection?: string
  /// LLM 的响应内容
  response?: string
}
