import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { BaseMessage } from '@langchain/core/messages'
import { generateNode, reflectNode, retrieveNode } from './node'

const agentState = Annotation.Root({
  characterName: Annotation<string>(),
  question: Annotation<string>(),
  chatHistory: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  context: Annotation<string>(),
  reflection: Annotation<string>(),
  response: Annotation<string>(),
})

// 将定义传递给 StateGraph 构造函数
const workflow = new StateGraph(agentState)

workflow.addNode('retrieve', retrieveNode)
workflow.addNode('reflect', reflectNode)
workflow.addNode('generate', generateNode)

// @ts-ignore
workflow.addEdge(START, 'retrieve')
// @ts-ignore
workflow.addEdge('retrieve', 'reflect')
// @ts-ignore
workflow.addEdge('reflect', 'generate')
// @ts-ignore
workflow.addEdge('generate', END)

export const characterGraph = workflow.compile()
