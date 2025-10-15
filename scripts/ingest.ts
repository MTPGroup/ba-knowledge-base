import path from 'path'
import fs from 'fs/promises'
import frontMatter from 'front-matter'
import { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { DataType, MilvusClient } from '@zilliz/milvus2-sdk-node'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { AlibabaTongyiEmbeddings } from '@langchain/community/embeddings/alibaba_tongyi'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: path.resolve(__dirname, '../.env') })

// --- 配置区 ---
const KNOWLEDGE_BASE_PATH = path.resolve(__dirname, '../knowledge_base')
const COLLECTION_NAME = 'blue_archive_lore'
const MILVUS_HOST = process.env.MILVUS_HOST || 'localhost:19530'
const VECTOR_DIMENSION = 1024

// const embeddings = new GoogleGenerativeAIEmbeddings({
//   model: 'text-embedding-004',
//   taskType: TaskType.SEMANTIC_SIMILARITY,
// })
const embeddings = new AlibabaTongyiEmbeddings({
  // @ts-ignore
  modelName: 'text-embedding-v4',
})

// --- 主函数 ---
async function main() {
  console.log('🚀 开始构建向量数据库...')

  // 连接 Milvus
  const milvusClient = new MilvusClient({ address: MILVUS_HOST })

  // 创建 Collection (如果不存在)
  await createCollectionIfNotExists(milvusClient)

  // 加载并解析所有 Markdown 文件
  const documents = await loadDocumentsFromPath(KNOWLEDGE_BASE_PATH)
  if (documents.length === 0) {
    console.log('在知识库目录中没有找到任何文档。')
    return
  }
  console.log(`✅ 成功加载 ${documents.length} 个 Markdown 文件。`)

  // 切分文档
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000, // 根据内容调整
    chunkOverlap: 100,
  })
  const chunks = await splitter.splitDocuments(documents)
  console.log(`🔪 文档被切分为 ${chunks.length} 个文本块。`)

  // 为所有文本块生成向量 (Embedding)
  console.log('🧠 正在为所有文本块生成向量 (这可能需要一些时间)...')
  const contents = chunks.map((chunk) => chunk.pageContent)
  const batchSize = 10 // 定义API允许的最大批处理大小
  const allVectors = []

  for (let i = 0; i < contents.length; i += batchSize) {
    const batch = contents.slice(i, i + batchSize)
    console.log(
      `  - 正在处理批次 ${i / batchSize + 1} (共 ${Math.ceil(contents.length / batchSize)} 批), 大小: ${batch.length}`,
    )
    const batchVectors = await embeddings.embedDocuments(batch)
    allVectors.push(...batchVectors)
  }

  // 确保将 allVectors 赋值给 vectors，以便后续代码使用
  const vectors = allVectors
  console.log(`✅ 成功生成 ${vectors.length} 个向量。`)

  // 准备要插入 Milvus 的数据
  const dataToInsert = chunks.map((chunk, index) => {
    const metadata = chunk.metadata
    console.log(`向量${index + 1} ${vectors[index].slice(0, 10)}`)
    // 将元数据转换为 Milvus 支持的格式
    return {
      character_name: metadata.character_name?.join(',') || '',
      source_type: metadata.source_type || '',
      topic: metadata.topic?.join(',') || '',
      content: chunk.pageContent,
      vector: vectors[index],
    }
  })

  // 插入数据到 Milvus
  console.log(`✍️ 正在将 ${dataToInsert.length} 条数据插入到 Milvus...`)
  const result = await milvusClient.insert({
    collection_name: COLLECTION_NAME,
    data: dataToInsert,
  })

  if (result.status.error_code !== 'Success') {
    console.error('❌ 数据插入 Milvus 失败:')
    throw new Error(
      `Failed to insert data into Milvus: ${result.status.reason}`,
    )
  }

  console.log('✅ 数据插入成功!', result)

  // 创建索引以加速搜索
  console.log('🔍 正在为向量创建索引...')
  await milvusClient.createIndex({
    collection_name: COLLECTION_NAME,
    field_name: 'vector',
    index_type: 'HNSW', // 一种常用且高效的索引类型
    metric_type: 'L2', // 距离度量方式
    params: { M: 8, efConstruction: 64 },
  })
  console.log('✅ 索引创建成功!')

  console.log('🎉 向量数据库构建完成！')
}

// 递归加载所有 .md 文件
async function loadDocumentsFromPath(dirPath: string): Promise<Document[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const documents: Document[] = []

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      documents.push(...(await loadDocumentsFromPath(fullPath)))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const content = await fs.readFile(fullPath, 'utf-8')
      const { attributes, body } = frontMatter(content)

      // 将文件路径信息也加入元数据
      const pathMetadata = {
        source_path: fullPath.replace(KNOWLEDGE_BASE_PATH, ''), // 相对路径
      }

      documents.push(
        new Document({
          pageContent: body,
          metadata: { ...(attributes || {}), ...pathMetadata },
        }),
      )
    }
  }
  return documents
}

// 创建 Milvus Collection
async function createCollectionIfNotExists(client: MilvusClient) {
  const collections = await client.showCollections()
  if (collections.data.some((c) => c.name === COLLECTION_NAME)) {
    console.log(`Collection "${COLLECTION_NAME}" 已存在，跳过创建。`)
    // 在开发中，先删除旧的 collection
    // await client.dropCollection({ collection_name: COLLECTION_NAME })
    // console.log('旧 Collection 已删除。')
    // return
  }

  console.log(`Collection "${COLLECTION_NAME}" 不存在，正在创建...`)
  await client.createCollection({
    collection_name: COLLECTION_NAME,
    fields: [
      {
        name: 'id',
        data_type: DataType.Int64,
        is_primary_key: true,
        autoID: true,
      },
      { name: 'character_name', data_type: DataType.VarChar, max_length: 512 },
      { name: 'source_type', data_type: DataType.VarChar, max_length: 128 },
      { name: 'topic', data_type: DataType.VarChar, max_length: 1024 },
      { name: 'content', data_type: DataType.VarChar, max_length: 4096 }, // 根据内容长度调整
      {
        name: 'vector',
        data_type: DataType.FloatVector,
        dim: VECTOR_DIMENSION,
      },
    ],
  })
  console.log(`✅ Collection "${COLLECTION_NAME}" 创建成功。`)
}

// --- 运行脚本 ---
main().catch((error) => {
  console.error('❌ 构建过程中发生错误:', error)
})
