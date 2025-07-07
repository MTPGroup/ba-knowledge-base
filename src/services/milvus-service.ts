import { MilvusClient } from '@zilliz/milvus2-sdk-node'

export class MilvusService {
  private client: MilvusClient
  private collectionName: string = 'blue_archive_lore'

  constructor() {
    this.client = new MilvusClient({
      address: process.env.MILVS_HOST || 'localhost:19530',
    })
  }

  async search(queryVector: number[], characterName: string, k: number = 5) {
    await this.client.loadCollection({
      collection_name: this.collectionName,
    })

    const searchResult = await this.client.search({
      collection_name: this.collectionName,
      vector: queryVector,
      limit: k,
      filter: `character_name like '%${characterName}%'`,
      output_fields: ['content', 'source_type', 'topic'],
    })

    await this.client.releaseCollection({
      collection_name: this.collectionName,
    })
    searchResult.results.map((r) => {
      console.log(
        `分数: ${r.score}, 主题: ${r.topic}, 来源类型: ${r.source_type}`,
      )
    })

    return searchResult.results.map((res) => ({
      content: res.content,
      metadata: {
        sourceType: res.source_type,
        topic: res.topic,
      },
      score: res.score,
    }))
  }
}

export const milvusService = new MilvusService()
