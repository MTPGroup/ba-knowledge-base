import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { Hono } from 'hono'
import { IMessage } from '../interface/message'
import { characterGraph } from '../graph/builder'

export const chat = new Hono()

chat.post('/', async (c) => {
  const { characterName, question, history } = await c.req.json()

  if (!characterName || !question) {
    return c.json({ error: '角色名和问题不能为空' }, 400)
  }

  try {
    const chatHistory = (history || []).map((msg: IMessage) =>
      msg.role === 'user'
        ? new HumanMessage(msg.content)
        : new AIMessage(msg.content),
    )

    const finalState = await characterGraph.invoke({
      characterName,
      question,
      chatHistory,
    })

    return c.json({
      response: finalState.response,
    })
  } catch (error) {
    console.error('聊天处理错误:', error)
    return c.json({ error: '处理聊天时出错' }, 500)
  }
})
