import { getSearchConfig } from '../../config/search'

interface OpenAIEmbeddingPayload {
  data?: Array<{ embedding?: number[] }>
}

interface EmbeddingCacheEntry {
  embedding: number[]
  expiresAt: number
}

interface GenerateEmbeddingOptions {
  timeoutMs?: number
  useCache?: boolean
}

let warnedAboutSemanticConfig = false
const queryEmbeddingCache = new Map<string, EmbeddingCacheEntry>()

function normalizeEmbedding(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const normalized = raw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
  if (normalized.length === 0 || normalized.length !== raw.length) return null
  return normalized
}

function warnSemanticConfigOnce(message: string) {
  if (warnedAboutSemanticConfig) return
  warnedAboutSemanticConfig = true
  console.warn(`[search] ${message}`)
}

export function embeddingToVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

function normalizeCacheKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function embeddingCacheKey(input: string, model: string, dimensions: number): string {
  return `${model}:${dimensions}:${normalizeCacheKey(input)}`
}

function readCachedEmbedding(cacheKey: string): number[] | null {
  const cached = queryEmbeddingCache.get(cacheKey)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    queryEmbeddingCache.delete(cacheKey)
    return null
  }
  return [...cached.embedding]
}

function writeCachedEmbedding(cacheKey: string, embedding: number[], ttlMs: number) {
  if (ttlMs <= 0) return
  queryEmbeddingCache.set(cacheKey, {
    embedding: [...embedding],
    expiresAt: Date.now() + ttlMs,
  })
  if (queryEmbeddingCache.size > 500) {
    for (const [key, value] of queryEmbeddingCache.entries()) {
      if (value.expiresAt <= Date.now()) queryEmbeddingCache.delete(key)
      if (queryEmbeddingCache.size <= 400) break
    }
  }
}

export async function generateEmbedding(
  text: string,
  options: GenerateEmbeddingOptions = {},
): Promise<number[] | null> {
  const input = text.trim()
  if (!input) return null

  const config = getSearchConfig()
  if (!config.semanticEnabled) return null
  if (config.embeddingProvider === 'none') return null
  if (!config.semanticProviderReady || !config.embeddingApiKey) {
    warnSemanticConfigOnce(
      'Semantic search enabled but SEARCH_EMBEDDING_API_KEY is not configured. Using lexical fallback.',
    )
    return null
  }

  const timeoutMs = options.timeoutMs ?? config.semanticTimeoutMs
  const cacheEnabled = options.useCache === true && config.embeddingQueryCacheTtlMs > 0
  const cacheKey = cacheEnabled
    ? embeddingCacheKey(input, config.embeddingModel, config.embeddingDimensions)
    : null
  if (cacheKey) {
    const cached = readCachedEmbedding(cacheKey)
    if (cached) return cached
  }

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${config.embeddingBaseUrl}/embeddings`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.embeddingApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.embeddingModel,
        input,
        dimensions: config.embeddingDimensions,
      }),
    })

    if (!response.ok) {
      const message = await response.text()
      console.warn(`[search] Embedding request failed (${response.status}): ${message}`)
      return null
    }

    const payload = await response.json() as OpenAIEmbeddingPayload
    const rawEmbedding = payload?.data?.[0]?.embedding
    const embedding = normalizeEmbedding(rawEmbedding)
    if (!embedding) {
      console.warn('[search] Embedding response missing vector payload.')
      return null
    }
    if (cacheKey) {
      writeCachedEmbedding(cacheKey, embedding, config.embeddingQueryCacheTtlMs)
    }
    return embedding
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.warn('[search] Embedding request timed out; using lexical fallback.')
      return null
    }
    console.warn('[search] Embedding request failed; using lexical fallback.', error)
    return null
  } finally {
    clearTimeout(timeoutHandle)
  }
}

export function resetEmbeddingCacheForTests() {
  queryEmbeddingCache.clear()
}
