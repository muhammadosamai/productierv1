import { readEnv } from './env'
import {
  readPublicBooleanEnv,
  readPublicEnumEnv,
  readPublicEnv,
  readPublicNumberEnv,
} from './publicRuntimeConfig'

export type SearchEmbeddingProvider = 'none' | 'openai'

export interface SearchConfig {
  enabled: boolean
  semanticEnabled: boolean
  semanticProviderReady: boolean
  defaultLimit: number
  maxLimit: number
  lexicalPerTypeLimit: number
  lexicalCandidateMultiplier: number
  lexicalSimilarityFloor: number
  semanticCandidateLimit: number
  semanticMinScore: number
  semanticTimeoutMs: number
  embeddingQueryCacheTtlMs: number
  embeddingProvider: SearchEmbeddingProvider
  embeddingModel: string
  embeddingDimensions: number
  embeddingBaseUrl: string
  embeddingApiKey: string | null
}

let cachedSearchConfig: SearchConfig | null = null

type SearchPositiveIntegerName =
  | 'GLOBAL_SEARCH_DEFAULT_LIMIT'
  | 'GLOBAL_SEARCH_MAX_LIMIT'
  | 'GLOBAL_SEARCH_LEXICAL_PER_TYPE_LIMIT'
  | 'GLOBAL_SEARCH_LEXICAL_CANDIDATE_MULTIPLIER'
  | 'GLOBAL_SEARCH_SEMANTIC_CANDIDATE_LIMIT'
  | 'GLOBAL_SEARCH_SEMANTIC_TIMEOUT_MS'
  | 'GLOBAL_SEARCH_EMBEDDING_QUERY_CACHE_TTL_MS'
  | 'SEARCH_EMBEDDING_DIMENSIONS'

type SearchScoreName =
  | 'GLOBAL_SEARCH_LEXICAL_SIMILARITY_FLOOR'
  | 'GLOBAL_SEARCH_SEMANTIC_MIN_SCORE'

function readPositiveIntegerEnv(name: SearchPositiveIntegerName, fallback: number): number {
  const configured = readPublicNumberEnv(name)
  if (configured === undefined) return fallback
  if (!Number.isInteger(configured) || configured <= 0) {
    throw new Error(`Invalid ${name} value: "${configured}". Expected a positive integer.`)
  }
  return configured
}

function readScoreEnv(name: SearchScoreName, fallback: number): number {
  const configured = readPublicNumberEnv(name)
  if (configured === undefined) return fallback
  if (!Number.isFinite(configured) || configured < 0 || configured > 1) {
    throw new Error(`Invalid ${name} value: "${configured}". Expected a number between 0 and 1.`)
  }
  return Number(configured)
}

export function getSearchConfig(): SearchConfig {
  if (cachedSearchConfig) return cachedSearchConfig

  const enabled = readPublicBooleanEnv('GLOBAL_SEARCH_ENABLED') ?? true
  const semanticEnabledFlag = readPublicBooleanEnv('GLOBAL_SEARCH_SEMANTIC_ENABLED') ?? true
  const embeddingProvider = readPublicEnumEnv(
    'SEARCH_EMBEDDING_PROVIDER',
    ['none', 'openai'] as const,
  ) ?? 'none'
  const embeddingApiKey = readEnv('SEARCH_EMBEDDING_API_KEY') ?? null
  const semanticProviderReady = embeddingProvider === 'openai' && !!embeddingApiKey

  const defaultLimit = readPositiveIntegerEnv('GLOBAL_SEARCH_DEFAULT_LIMIT', 20)
  const maxLimit = readPositiveIntegerEnv('GLOBAL_SEARCH_MAX_LIMIT', 50)
  const lexicalPerTypeLimit = readPositiveIntegerEnv('GLOBAL_SEARCH_LEXICAL_PER_TYPE_LIMIT', 35)
  const lexicalCandidateMultiplier = readPositiveIntegerEnv('GLOBAL_SEARCH_LEXICAL_CANDIDATE_MULTIPLIER', 3)
  const lexicalSimilarityFloor = readScoreEnv('GLOBAL_SEARCH_LEXICAL_SIMILARITY_FLOOR', 0.2)
  const semanticCandidateLimit = readPositiveIntegerEnv('GLOBAL_SEARCH_SEMANTIC_CANDIDATE_LIMIT', 80)
  const semanticMinScore = readScoreEnv('GLOBAL_SEARCH_SEMANTIC_MIN_SCORE', 0.24)
  const semanticTimeoutMs = readPositiveIntegerEnv('GLOBAL_SEARCH_SEMANTIC_TIMEOUT_MS', 1200)
  const embeddingQueryCacheTtlMs = readPositiveIntegerEnv('GLOBAL_SEARCH_EMBEDDING_QUERY_CACHE_TTL_MS', 45000)

  if (defaultLimit > maxLimit) {
    throw new Error(
      'Invalid search limit configuration: ' +
      `GLOBAL_SEARCH_DEFAULT_LIMIT (${defaultLimit}) cannot exceed ` +
      `GLOBAL_SEARCH_MAX_LIMIT (${maxLimit}).`,
    )
  }

  cachedSearchConfig = {
    enabled,
    semanticEnabled: enabled && semanticEnabledFlag,
    semanticProviderReady,
    defaultLimit,
    maxLimit,
    lexicalPerTypeLimit,
    lexicalCandidateMultiplier,
    lexicalSimilarityFloor,
    semanticCandidateLimit,
    semanticMinScore,
    semanticTimeoutMs,
    embeddingQueryCacheTtlMs,
    embeddingProvider,
    embeddingModel: readPublicEnv('SEARCH_EMBEDDING_MODEL') ?? 'text-embedding-3-small',
    embeddingDimensions: readPositiveIntegerEnv('SEARCH_EMBEDDING_DIMENSIONS', 1536),
    embeddingBaseUrl: (readPublicEnv('SEARCH_EMBEDDING_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    embeddingApiKey,
  }

  return cachedSearchConfig
}

export function resetSearchConfigCacheForTests() {
  cachedSearchConfig = null
}
