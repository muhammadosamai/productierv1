import { reindexSearchDocuments } from '../lib/search/searchIndex'

function parseArgs(argv: string[]) {
  const parsed: { productId?: string; chunkSize?: number } = {}
  for (const arg of argv) {
    if (arg.startsWith('--productId=')) {
      const value = arg.slice('--productId='.length).trim()
      if (value) parsed.productId = value
      continue
    }
    if (arg.startsWith('--chunk=')) {
      const raw = Number(arg.slice('--chunk='.length))
      if (Number.isFinite(raw) && raw > 0) {
        parsed.chunkSize = Math.floor(raw)
      }
    }
  }
  return parsed
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  console.log('[search-index] Reindex started', options)
  const startedAt = Date.now()
  const totals = await reindexSearchDocuments(options)
  const elapsedMs = Date.now() - startedAt
  console.log('[search-index] Reindex finished', {
    ...totals,
    elapsedMs,
  })
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('[search-index] Reindex failed', error)
    process.exit(1)
  })
