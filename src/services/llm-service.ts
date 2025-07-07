import 'dotenv/config'
import { AlibabaTongyiEmbeddings } from '@langchain/community/embeddings/alibaba_tongyi'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'

export const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  safetySettings: [
    // {
    //   category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    //   threshold: HarmBlockThreshold.BLOCK_NONE,
    // },
    // {
    //   category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    //   threshold: HarmBlockThreshold.BLOCK_NONE,
    // },
    // {
    //   category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    //   threshold: HarmBlockThreshold.BLOCK_NONE,
    // },
    // {
    //   category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    //   threshold: HarmBlockThreshold.BLOCK_NONE,
    // },
  ],
})

// export const embeddings = new GoogleGenerativeAIEmbeddings({
//   model: 'text-embedding-004',
//   taskType: TaskType.SEMANTIC_SIMILARITY,
// })

// export const llm = new ChatAlibabaTongyi({
//   model: 'qwen-plus-2025-04-28',
//   temperature: 0.7,
// })

export const embeddings = new AlibabaTongyiEmbeddings({
  // @ts-ignore
  modelName: 'text-embedding-v4',
})
