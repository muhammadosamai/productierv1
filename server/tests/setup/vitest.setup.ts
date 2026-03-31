import { afterAll, beforeEach } from 'vitest'
import { closeDatabase, resetDatabase } from './testDb'

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await closeDatabase()
})
