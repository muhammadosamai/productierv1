import { readBooleanEnv, readEnumEnv, readEnv, readNumberEnv } from './env'

export type HomeBriefProvider = 'none' | 'openai'
export type HomeBriefApiKeySource = 'home_daily_brief' | 'search_embedding' | 'none'
export type HomeBriefProviderReadinessIssue =
  | 'feature_disabled'
  | 'provider_not_selected'
  | 'missing_api_key'
  | null

export interface HomeBriefConfig {
  enabled: boolean
  provider: HomeBriefProvider
  providerReady: boolean
  providerReadinessIssue: HomeBriefProviderReadinessIssue
  model: string
  baseUrl: string
  apiKey: string | null
  apiKeySource: HomeBriefApiKeySource
  hasDedicatedApiKey: boolean
  hasSearchFallbackApiKey: boolean
  timeoutMs: number
  maxTokens: number
  summaryMaxTokens: number
  fullMaxTokens: number
  temperature: number
  retryModel: string
  retryContextMaxChars: number
  cacheTtlMs: number
  fallbackCacheTtlMs: number
}

let cachedHomeBriefConfig: HomeBriefConfig | null = null

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const configured = readNumberEnv(name)
  if (configured === undefined) return fallback
  if (!Number.isInteger(configured) || configured <= 0) {
    throw new Error(`Invalid ${name} value: "${configured}". Expected a positive integer.`)
  }
  return configured
}

function readNonNegativeIntegerEnv(name: string, fallback: number): number {
  const configured = readNumberEnv(name)
  if (configured === undefined) return fallback
  if (!Number.isInteger(configured) || configured < 0) {
    throw new Error(`Invalid ${name} value: "${configured}". Expected a non-negative integer.`)
  }
  return configured
}

function readTemperatureEnv(name: string, fallback: number): number {
  const configured = readNumberEnv(name)
  if (configured === undefined) return fallback
  if (!Number.isFinite(configured) || configured < 0 || configured > 2) {
    throw new Error(`Invalid ${name} value: "${configured}". Expected a number between 0 and 2.`)
  }
  return configured
}

export function getHomeBriefConfig(): HomeBriefConfig {
  if (cachedHomeBriefConfig) return cachedHomeBriefConfig

  const enabled = readBooleanEnv('HOME_DAILY_BRIEF_ENABLED') ?? false
  const provider = readEnumEnv('HOME_DAILY_BRIEF_PROVIDER', ['none', 'openai'] as const) ?? 'none'
  const model = readEnv('HOME_DAILY_BRIEF_MODEL') ?? 'gpt-4o-mini'
  const baseUrl = (readEnv('HOME_DAILY_BRIEF_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const dedicatedApiKey = readEnv('HOME_DAILY_BRIEF_API_KEY') ?? null
  const searchFallbackApiKey = readEnv('SEARCH_EMBEDDING_API_KEY') ?? null
  const apiKey = dedicatedApiKey ?? searchFallbackApiKey
  const apiKeySource: HomeBriefApiKeySource = dedicatedApiKey
    ? 'home_daily_brief'
    : searchFallbackApiKey
      ? 'search_embedding'
      : 'none'
  let providerReadinessIssue: HomeBriefProviderReadinessIssue = null
  if (!enabled) providerReadinessIssue = 'feature_disabled'
  else if (provider !== 'openai') providerReadinessIssue = 'provider_not_selected'
  else if (!apiKey) providerReadinessIssue = 'missing_api_key'
  const timeoutMs = readPositiveIntegerEnv('HOME_DAILY_BRIEF_TIMEOUT_MS', 4500)
  const maxTokens = readPositiveIntegerEnv('HOME_DAILY_BRIEF_MAX_TOKENS', 220)
  const summaryMaxTokens = readPositiveIntegerEnv('HOME_DAILY_BRIEF_SUMMARY_MAX_TOKENS', maxTokens)
  const fullMaxTokens = readPositiveIntegerEnv('HOME_DAILY_BRIEF_FULL_MAX_TOKENS', Math.max(maxTokens, 420))
  const temperature = readTemperatureEnv('HOME_DAILY_BRIEF_TEMPERATURE', 0.2)
  const retryModel = readEnv('HOME_DAILY_BRIEF_RETRY_MODEL') ?? 'gpt-4o-mini'
  const retryContextMaxChars = readPositiveIntegerEnv('HOME_DAILY_BRIEF_RETRY_CONTEXT_MAX_CHARS', 4200)
  const cacheTtlMs = readPositiveIntegerEnv('HOME_DAILY_BRIEF_CACHE_TTL_MS', 3600000)
  const fallbackCacheTtlMs = readNonNegativeIntegerEnv('HOME_DAILY_BRIEF_FALLBACK_CACHE_TTL_MS', 15000)

  cachedHomeBriefConfig = {
    enabled,
    provider,
    providerReady: providerReadinessIssue === null,
    providerReadinessIssue,
    model,
    baseUrl,
    apiKey,
    apiKeySource,
    hasDedicatedApiKey: Boolean(dedicatedApiKey),
    hasSearchFallbackApiKey: Boolean(searchFallbackApiKey),
    timeoutMs,
    maxTokens,
    summaryMaxTokens,
    fullMaxTokens,
    temperature,
    retryModel,
    retryContextMaxChars,
    cacheTtlMs,
    fallbackCacheTtlMs,
  }

  return cachedHomeBriefConfig
}

export function resetHomeBriefConfigCacheForTests() {
  cachedHomeBriefConfig = null
}
