import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import { getDatabaseConfig } from '../config/database'

const connectionString = getDatabaseConfig().url

const client = postgres(connectionString)
export const db = drizzle(client, { schema })
