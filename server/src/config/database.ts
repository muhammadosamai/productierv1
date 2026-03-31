import { readRequiredEnv } from './env'

export interface DatabaseConfig {
  url: string
}

let cachedDatabaseConfig: DatabaseConfig | null = null

export function getDatabaseConfig(): DatabaseConfig {
  if (cachedDatabaseConfig) return cachedDatabaseConfig
  cachedDatabaseConfig = {
    url: readRequiredEnv('DATABASE_URL', 'database connection'),
  }
  return cachedDatabaseConfig
}

export function resetDatabaseConfigCacheForTests() {
  cachedDatabaseConfig = null
}

