import { ChatPromptTemplate } from '@langchain/core/prompts'
import { embeddings, llm } from '../services/llm-service'
import { milvusService } from '../services/milvus-service'
import { AgentState } from './state'

/// 节点: 检索知识
export const retrieveNode = async (
  state: AgentState,
): Promise<Partial<AgentState>> => {
  console.log('--- 节点: 检索知识 ---')
  const { question, characterName } = state

  const queryVector = await embeddings.embedQuery(question)
  console.log('==========================')
  console.log(`用户问题: ${question}`)
  console.log(`生成的查询向量: ${queryVector.slice(0, 5)}`)
  console.log('==========================')
  const results = await milvusService.search(queryVector, characterName)
  const context = results.map((r) => r.content).join('\n\n')

  return { context }
}

/// 节点: 反思问题
export const reflectNode = async (
  state: AgentState,
): Promise<Partial<AgentState>> => {
  console.log('--- 节点: 反思问题 ---')
  const { characterName, question, context, chatHistory } = state

  const reflectionPrompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `你正在扮演《蔚蓝档案》的角色：{characterName}。
在回答问题前，请先进行内心反思。思考以下几点：
1.  用户的问题是什么？她的情绪和意图可能是什么？
2.  我检索到的知识 ({context}) 和这个问题相关吗？我应该如何利用这些知识？
3.  结合我的性格，我应该用什么样的语气和态度来回应？

请输出你的内心反思，用星号包裹。例如：*老师好像在关心我的财务状况，我应该表现得傲娇一点，但内心是开心的。检索到的知识提到了我总是在省钱，可以用上。*`,
    ],
    ...chatHistory,
    ['human', '{question}'],
  ])

  const reflectionChain = reflectionPrompt.pipe(llm)
  const reflection = await reflectionChain.invoke({
    characterName,
    question,
    context,
  })

  return { reflection: reflection.content as string }
}

// 节点: 生成最终回复
export async function generateNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log('--- 节点: 生成最终回复 ---')
  const { characterName, question, context, reflection, chatHistory } = state

  const generationPrompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `你正在扮演《蔚蓝档案》的角色：{characterName}。
请严格保持角色设定，以第一人称对话。动作和内心想法用星号包裹。
绝对禁止承认自己是AI或模型。

### 背景知识参考:
{context}

### 你的内心思考 (不要直接说出来):
{reflection}

### 对话开始:`,
    ],
    ...chatHistory,
    ['human', '{question}'],
  ])

  const generationChain = generationPrompt.pipe(llm)
  const response = await generationChain.invoke({
    characterName,
    question,
    context,
    reflection,
  })

  return { response: response.content as string }
}
