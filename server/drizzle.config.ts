import { defineConfig } from 'drizzle-kit'
import { getDatabaseConfig } from './src/config/database'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseConfig().url,
  },
})
