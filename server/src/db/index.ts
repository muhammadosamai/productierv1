import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL
  ?? 'postgresql://sarimalavi@localhost:5432/productier'

const client = postgres(connectionString)
export const db = drizzle(client, { schema })
