import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/config/**/*.spec.ts'],
    environment: 'node',
    fileParallelism: false,
  },
})

