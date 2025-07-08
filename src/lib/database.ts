import 'dotenv/config'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '~/db'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
})

export const db = drizzle({
  client: pool,
  schema: schema,
})

export type Database = typeof db
