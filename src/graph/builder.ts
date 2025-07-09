import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { BaseMessage } from '@langchain/core/messages'
import { generateNode, reflectNode, retrieveNode } from '@/graph/node'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'

const agentState = Annotation.Root({
  characterName: Annotation<string>(),
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  context: Annotation<string>(),
  reflection: Annotation<string>(),
  response: Annotation<string>(),
})

// 将定义传递给 StateGraph 构造函数
const workflow = new StateGraph(agentState)
  .addNode('retrieve', retrieveNode)
  .addNode('reflect', reflectNode)
  .addNode('generate', generateNode)
  .addEdge(START, 'retrieve')
  .addEdge('retrieve', 'reflect')
  .addEdge('reflect', 'generate')
  .addEdge('generate', END)

export const checkpointer = PostgresSaver.fromConnString(
  process.env.DATABASE_URL!,
)

export const characterGraph = workflow.compile({ checkpointer })
