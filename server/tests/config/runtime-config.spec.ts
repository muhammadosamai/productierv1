import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getApiConfig, resetApiConfigCacheForTests } from '../../src/config/api'
import { getAuthConfig, resetAuthConfigCacheForTests } from '../../src/config/auth'
import { getDatabaseConfig, resetDatabaseConfigCacheForTests } from '../../src/config/database'
import { resetEnvCacheForTests } from '../../src/config/env'
import { getIntegrationsConfig, resetIntegrationsConfigCacheForTests } from '../../src/config/integrations'
import { getNetworkConfig, resetNetworkConfigCacheForTests } from '../../src/config/network'
import { resetPublicRuntimeConfigCacheForTests } from '../../src/config/publicRuntimeConfig'
import { getSearchConfig, resetSearchConfigCacheForTests } from '../../src/config/search'
import { getHomeBriefConfig, resetHomeBriefConfigCacheForTests } from '../../src/config/brief'
import { getStorageConfig, resetStorageConfigCacheForTests } from '../../src/config/storage'
import { resetStorageForTests } from '../../src/storage'
import { parseSeedArgs, resolveSeedProfileOverridePath } from '../../src/db/seed-config'

const envSnapshot = { ...process.env }
const tempRuntimeConfigDirs: string[] = []

function restoreEnvSnapshot() {
  for (const key of Object.keys(process.env)) {
    delete process.env[key]
  }
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value !== undefined) process.env[key] = value
  }
}

function resetConfigCaches() {
  resetApiConfigCacheForTests()
  resetAuthConfigCacheForTests()
  resetDatabaseConfigCacheForTests()
  resetIntegrationsConfigCacheForTests()
  resetNetworkConfigCacheForTests()
  resetPublicRuntimeConfigCacheForTests()
  resetSearchConfigCacheForTests()
  resetHomeBriefConfigCacheForTests()
  resetStorageConfigCacheForTests()
  resetStorageForTests()
  resetEnvCacheForTests()
}

function cleanupTempRuntimeConfigDirs() {
  for (const dir of tempRuntimeConfigDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

function setPublicRuntimeConfig(content: string) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'productier-runtime-config-'))
  const filePath = path.join(tempDir, 'runtime.public.yaml')
  writeFileSync(filePath, content, 'utf8')
  tempRuntimeConfigDirs.push(tempDir)
  process.env.PUBLIC_RUNTIME_CONFIG_PATH = filePath
}

function setJwtKeyRingEnv(kid = 'unit-2026') {
  const generated = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  process.env.JWT_ACTIVE_KID = kid
  process.env.JWT_PRIVATE_KEY_PEM = generated.privateKey
  process.env.JWT_PUBLIC_KEY_PEM = generated.publicKey
  return generated
}

afterEach(() => {
  restoreEnvSnapshot()
  resetConfigCaches()
  cleanupTempRuntimeConfigDirs()
})

describe('runtime configuration', () => {
  it('enforces JWT key-ring when auth mode is required', () => {
    setPublicRuntimeConfig('')
    process.env.AUTH_SECRET_MODE = 'required'
    process.env.JWT_ACTIVE_KID = ''
    process.env.JWT_PRIVATE_KEY_PEM = ''
    process.env.JWT_PUBLIC_KEY_PEM = ''
    process.env.JWT_PUBLIC_KEYS_JSON = ''
    process.env.JWT_PUBLIC_KEYS_PATH = ''

    expect(() => getAuthConfig()).toThrow(
      'JWT key-ring configuration is required when AUTH_SECRET_MODE=required',
    )
  })

  it('reads RS256 JWT settings from env', () => {
    process.env.AUTH_SECRET_MODE = 'required'
    setJwtKeyRingEnv('unit-rs256')
    process.env.JWT_ACCESS_TTL = '15m'
    process.env.JWT_ISSUER = 'productier-tests'
    process.env.JWT_AUDIENCE = 'web,cli'

    const config = getAuthConfig()
    expect(config.jwtAlgorithm).toBe('RS256')
    expect(config.jwtActiveKid).toBe('unit-rs256')
    expect(config.jwtAccessTtl).toBe('15m')
    expect(config.jwtIssuer).toBe('productier-tests')
    expect(config.jwtAudience).toEqual(['web', 'cli'])
    expect(config.jwtPublicKeysByKid['unit-rs256']).toContain('BEGIN PUBLIC KEY')
    expect(config.jwtFallbackSecret).toHaveLength(64)
  })

  it('uses runtime DATABASE_URL value for DB config', () => {
    process.env.DATABASE_URL = 'postgresql://example:example@127.0.0.1:5432/demo'

    const config = getDatabaseConfig()
    expect(config.url).toBe('postgresql://example:example@127.0.0.1:5432/demo')
  })

  it('parses port and CORS origins from env', () => {
    process.env.PORT = '4010'
    process.env.CORS_ORIGINS = 'http://localhost:5173,https://example.com'

    const config = getNetworkConfig()
    expect(config.port).toBe(4010)
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'https://example.com'])
  })

  it('supports local storage defaults', () => {
    process.env.STORAGE_BACKEND = 'local'
    process.env.STORAGE_PUBLIC_PREFIX = '/uploads'

    const config = getStorageConfig()
    expect(config.backend).toBe('local')
    if (config.backend === 'local') {
      expect(config.publicPrefix).toBe('/uploads')
      expect(config.localRoot.length).toBeGreaterThan(0)
    }
  })

  it('requires bucket/region for s3 storage backend', () => {
    process.env.STORAGE_BACKEND = 's3'
    process.env.S3_BUCKET = ''
    process.env.S3_REGION = ''

    expect(() => getStorageConfig()).toThrow('Missing required env var: S3_BUCKET')
  })

  it('requires dedicated integrations key outside test env', () => {
    process.env.NODE_ENV = 'development'
    process.env.INTEGRATIONS_SECRET_MODE = 'allow-jwt-fallback'
    process.env.INTEGRATIONS_SECRET_KEY = ''

    expect(() => getIntegrationsConfig()).toThrow(
      'Missing required env var: INTEGRATIONS_SECRET_KEY (integrations credentials encryption outside test)',
    )
  })

  it('requires dedicated integrations key in required mode', () => {
    process.env.NODE_ENV = 'test'
    process.env.INTEGRATIONS_SECRET_MODE = 'required'
    process.env.INTEGRATIONS_SECRET_KEY = ''

    expect(() => getIntegrationsConfig()).toThrow(
      'INTEGRATIONS_SECRET_KEY is required when INTEGRATIONS_SECRET_MODE=required',
    )
  })

  it('can explicitly fallback integrations secret to derived auth key in test mode', () => {
    process.env.NODE_ENV = 'test'
    process.env.AUTH_SECRET_MODE = 'required'
    setJwtKeyRingEnv('unit-fallback')
    process.env.INTEGRATIONS_SECRET_MODE = 'allow-jwt-fallback'
    process.env.INTEGRATIONS_SECRET_KEY = ''

    const authConfig = getAuthConfig()
    const config = getIntegrationsConfig()
    expect(config.secretKey).toBe(authConfig.jwtFallbackSecret)
  })

  it('reads API users list/search limits from env', () => {
    process.env.API_USERS_SEARCH_LIMIT = '25'
    process.env.API_USERS_LIST_LIMIT = '80'

    const config = getApiConfig()
    expect(config.usersSearchLimit).toBe(25)
    expect(config.usersListLimit).toBe(80)
  })

  it('rejects invalid API users limit ordering', () => {
    process.env.API_USERS_SEARCH_LIMIT = '120'
    process.env.API_USERS_LIST_LIMIT = '100'

    expect(() => getApiConfig()).toThrow('API_USERS_SEARCH_LIMIT')
  })

  it('uses safe defaults for global search config', () => {
    delete process.env.GLOBAL_SEARCH_ENABLED
    delete process.env.GLOBAL_SEARCH_SEMANTIC_ENABLED
    process.env.SEARCH_EMBEDDING_PROVIDER = 'none'
    process.env.SEARCH_EMBEDDING_API_KEY = ''

    const config = getSearchConfig()
    expect(config.enabled).toBe(true)
    expect(config.semanticEnabled).toBe(true)
    expect(config.embeddingProvider).toBe('none')
    expect(config.semanticProviderReady).toBe(false)
    expect(config.defaultLimit).toBe(20)
    expect(config.maxLimit).toBe(50)
    expect(config.lexicalCandidateMultiplier).toBe(3)
    expect(config.lexicalSimilarityFloor).toBe(0.2)
    expect(config.semanticMinScore).toBe(0.24)
    expect(config.embeddingQueryCacheTtlMs).toBe(45000)
  })

  it('supports semantic provider config overrides', () => {
    process.env.SEARCH_EMBEDDING_PROVIDER = 'openai'
    process.env.SEARCH_EMBEDDING_API_KEY = 'test-key'
    process.env.SEARCH_EMBEDDING_MODEL = 'text-embedding-3-large'
    process.env.SEARCH_EMBEDDING_DIMENSIONS = '3072'
    process.env.GLOBAL_SEARCH_SEMANTIC_TIMEOUT_MS = '900'
    process.env.GLOBAL_SEARCH_LEXICAL_CANDIDATE_MULTIPLIER = '4'
    process.env.GLOBAL_SEARCH_LEXICAL_SIMILARITY_FLOOR = '0.35'
    process.env.GLOBAL_SEARCH_SEMANTIC_MIN_SCORE = '0.3'
    process.env.GLOBAL_SEARCH_EMBEDDING_QUERY_CACHE_TTL_MS = '120000'

    const config = getSearchConfig()
    expect(config.embeddingProvider).toBe('openai')
    expect(config.semanticProviderReady).toBe(true)
    expect(config.embeddingModel).toBe('text-embedding-3-large')
    expect(config.embeddingDimensions).toBe(3072)
    expect(config.semanticTimeoutMs).toBe(900)
    expect(config.lexicalCandidateMultiplier).toBe(4)
    expect(config.lexicalSimilarityFloor).toBe(0.35)
    expect(config.semanticMinScore).toBe(0.3)
    expect(config.embeddingQueryCacheTtlMs).toBe(120000)
  })

  it('uses safe defaults for home daily brief config', () => {
    process.env.HOME_DAILY_BRIEF_ENABLED = 'false'
    process.env.HOME_DAILY_BRIEF_PROVIDER = 'none'
    process.env.HOME_DAILY_BRIEF_API_KEY = ''
    process.env.SEARCH_EMBEDDING_API_KEY = ''
    process.env.HOME_DAILY_BRIEF_MODEL = ''
    process.env.HOME_DAILY_BRIEF_TIMEOUT_MS = ''
    process.env.HOME_DAILY_BRIEF_MAX_TOKENS = ''
    process.env.HOME_DAILY_BRIEF_SUMMARY_MAX_TOKENS = ''
    process.env.HOME_DAILY_BRIEF_FULL_MAX_TOKENS = ''
    process.env.HOME_DAILY_BRIEF_TEMPERATURE = ''
    process.env.HOME_DAILY_BRIEF_CACHE_TTL_MS = ''
    process.env.HOME_DAILY_BRIEF_FALLBACK_CACHE_TTL_MS = ''
    process.env.HOME_DAILY_BRIEF_RETRY_MODEL = ''
    process.env.HOME_DAILY_BRIEF_RETRY_CONTEXT_MAX_CHARS = ''
    process.env.HOME_DAILY_BRIEF_REASONING_EFFORT = ''

    const config = getHomeBriefConfig()
    expect(config.enabled).toBe(false)
    expect(config.provider).toBe('none')
    expect(config.providerReady).toBe(false)
    expect(config.providerReadinessIssue).toBe('feature_disabled')
    expect(config.apiKeySource).toBe('none')
    expect(config.hasDedicatedApiKey).toBe(false)
    expect(config.hasSearchFallbackApiKey).toBe(false)
    expect(config.model).toBe('gpt-5.4-mini')
    expect(config.maxTokens).toBe(500)
    expect(config.summaryMaxTokens).toBe(500)
    expect(config.fullMaxTokens).toBe(900)
    expect(config.timeoutMs).toBe(15000)
    expect(config.fallbackCacheTtlMs).toBe(15000)
    expect(config.reasoningEffort).toBe('low')
    expect(config.retryModel).toBe('gpt-5.4-mini')
    expect(config.retryContextMaxChars).toBe(4200)
  })

  it('supports explicit home daily brief provider overrides', () => {
    process.env.HOME_DAILY_BRIEF_ENABLED = 'true'
    process.env.HOME_DAILY_BRIEF_PROVIDER = 'openai'
    process.env.HOME_DAILY_BRIEF_MODEL = 'gpt-5.4-mini'
    process.env.HOME_DAILY_BRIEF_API_KEY = 'brief-key'
    process.env.SEARCH_EMBEDDING_API_KEY = ''
    process.env.HOME_DAILY_BRIEF_TIMEOUT_MS = '3000'
    process.env.HOME_DAILY_BRIEF_MAX_TOKENS = '180'
    process.env.HOME_DAILY_BRIEF_SUMMARY_MAX_TOKENS = '240'
    process.env.HOME_DAILY_BRIEF_FULL_MAX_TOKENS = '640'
    process.env.HOME_DAILY_BRIEF_TEMPERATURE = '0.4'
    process.env.HOME_DAILY_BRIEF_CACHE_TTL_MS = '120000'
    process.env.HOME_DAILY_BRIEF_FALLBACK_CACHE_TTL_MS = '5000'
    process.env.HOME_DAILY_BRIEF_RETRY_MODEL = 'gpt-4.1-mini'
    process.env.HOME_DAILY_BRIEF_RETRY_CONTEXT_MAX_CHARS = '3600'
    process.env.HOME_DAILY_BRIEF_REASONING_EFFORT = 'high'

    const config = getHomeBriefConfig()
    expect(config.enabled).toBe(true)
    expect(config.provider).toBe('openai')
    expect(config.providerReady).toBe(true)
    expect(config.providerReadinessIssue).toBeNull()
    expect(config.apiKeySource).toBe('home_daily_brief')
    expect(config.hasDedicatedApiKey).toBe(true)
    expect(config.hasSearchFallbackApiKey).toBe(false)
    expect(config.model).toBe('gpt-5.4-mini')
    expect(config.timeoutMs).toBe(3000)
    expect(config.maxTokens).toBe(180)
    expect(config.summaryMaxTokens).toBe(240)
    expect(config.fullMaxTokens).toBe(640)
    expect(config.temperature).toBe(1)
    expect(config.cacheTtlMs).toBe(120000)
    expect(config.fallbackCacheTtlMs).toBe(5000)
    expect(config.reasoningEffort).toBe('high')
    expect(config.retryModel).toBe('gpt-4.1-mini')
    expect(config.retryContextMaxChars).toBe(3600)
  })

  it('preserves configured temperature for non-gpt-5 brief models', () => {
    process.env.HOME_DAILY_BRIEF_ENABLED = 'true'
    process.env.HOME_DAILY_BRIEF_PROVIDER = 'openai'
    process.env.HOME_DAILY_BRIEF_MODEL = 'gpt-4.1-mini'
    process.env.HOME_DAILY_BRIEF_API_KEY = 'brief-key'
    process.env.SEARCH_EMBEDDING_API_KEY = ''
    process.env.HOME_DAILY_BRIEF_TEMPERATURE = '0.4'

    const config = getHomeBriefConfig()
    expect(config.model).toBe('gpt-4.1-mini')
    expect(config.temperature).toBe(0.4)
  })

  it('keeps configured retry model when it matches primary gpt-5 model', () => {
    process.env.HOME_DAILY_BRIEF_ENABLED = 'true'
    process.env.HOME_DAILY_BRIEF_PROVIDER = 'openai'
    process.env.HOME_DAILY_BRIEF_MODEL = 'gpt-5.4-mini'
    process.env.HOME_DAILY_BRIEF_API_KEY = 'brief-key'
    process.env.SEARCH_EMBEDDING_API_KEY = ''
    process.env.HOME_DAILY_BRIEF_RETRY_MODEL = 'gpt-5.4-mini'

    const config = getHomeBriefConfig()
    expect(config.model).toBe('gpt-5.4-mini')
    expect(config.retryModel).toBe('gpt-5.4-mini')
  })

  it('falls back mode token envs to legacy max token config', () => {
    process.env.HOME_DAILY_BRIEF_ENABLED = 'true'
    process.env.HOME_DAILY_BRIEF_PROVIDER = 'openai'
    process.env.HOME_DAILY_BRIEF_API_KEY = 'brief-key'
    process.env.HOME_DAILY_BRIEF_MAX_TOKENS = '260'
    process.env.HOME_DAILY_BRIEF_SUMMARY_MAX_TOKENS = ''
    process.env.HOME_DAILY_BRIEF_FULL_MAX_TOKENS = ''

    const config = getHomeBriefConfig()
    expect(config.maxTokens).toBe(260)
    expect(config.summaryMaxTokens).toBe(260)
    expect(config.fullMaxTokens).toBe(900)
  })

  it('uses search embedding key as home brief key fallback when dedicated key is missing', () => {
    process.env.HOME_DAILY_BRIEF_ENABLED = 'true'
    process.env.HOME_DAILY_BRIEF_PROVIDER = 'openai'
    process.env.HOME_DAILY_BRIEF_API_KEY = ''
    process.env.SEARCH_EMBEDDING_API_KEY = 'search-key'

    const config = getHomeBriefConfig()
    expect(config.providerReady).toBe(true)
    expect(config.providerReadinessIssue).toBeNull()
    expect(config.apiKeySource).toBe('search_embedding')
    expect(config.hasDedicatedApiKey).toBe(false)
    expect(config.hasSearchFallbackApiKey).toBe(true)
  })

  it('reports missing key readiness issue for enabled openai provider', () => {
    process.env.HOME_DAILY_BRIEF_ENABLED = 'true'
    process.env.HOME_DAILY_BRIEF_PROVIDER = 'openai'
    process.env.HOME_DAILY_BRIEF_API_KEY = ''
    process.env.SEARCH_EMBEDDING_API_KEY = ''

    const config = getHomeBriefConfig()
    expect(config.providerReady).toBe(false)
    expect(config.providerReadinessIssue).toBe('missing_api_key')
    expect(config.apiKeySource).toBe('none')
  })

  it('loads non-secret settings from public runtime YAML', () => {
    setPublicRuntimeConfig(`
PORT: 4123
CORS_ORIGINS:
  - https://yaml-one.example
  - https://yaml-two.example
API_USERS_SEARCH_LIMIT: 31
API_USERS_LIST_LIMIT: 90
GLOBAL_SEARCH_DEFAULT_LIMIT: 15
GLOBAL_SEARCH_MAX_LIMIT: 40
GLOBAL_SEARCH_LEXICAL_PER_TYPE_LIMIT: 20
GLOBAL_SEARCH_LEXICAL_CANDIDATE_MULTIPLIER: 2
GLOBAL_SEARCH_LEXICAL_SIMILARITY_FLOOR: 0.3
GLOBAL_SEARCH_SEMANTIC_CANDIDATE_LIMIT: 60
GLOBAL_SEARCH_SEMANTIC_MIN_SCORE: 0.25
GLOBAL_SEARCH_SEMANTIC_TIMEOUT_MS: 700
GLOBAL_SEARCH_EMBEDDING_QUERY_CACHE_TTL_MS: 10000
SEARCH_EMBEDDING_PROVIDER: none
SEARCH_EMBEDDING_MODEL: text-embedding-3-large
SEARCH_EMBEDDING_DIMENSIONS: 1024
SEARCH_EMBEDDING_BASE_URL: https://example-openai-proxy.test/v1
`)
    process.env.PORT = ''
    process.env.CORS_ORIGINS = ''
    process.env.API_USERS_SEARCH_LIMIT = ''
    process.env.API_USERS_LIST_LIMIT = ''
    process.env.GLOBAL_SEARCH_DEFAULT_LIMIT = ''
    process.env.GLOBAL_SEARCH_MAX_LIMIT = ''
    process.env.GLOBAL_SEARCH_LEXICAL_PER_TYPE_LIMIT = ''
    process.env.GLOBAL_SEARCH_LEXICAL_CANDIDATE_MULTIPLIER = ''
    process.env.GLOBAL_SEARCH_LEXICAL_SIMILARITY_FLOOR = ''
    process.env.GLOBAL_SEARCH_SEMANTIC_CANDIDATE_LIMIT = ''
    process.env.GLOBAL_SEARCH_SEMANTIC_MIN_SCORE = ''
    process.env.GLOBAL_SEARCH_SEMANTIC_TIMEOUT_MS = ''
    process.env.GLOBAL_SEARCH_EMBEDDING_QUERY_CACHE_TTL_MS = ''
    process.env.SEARCH_EMBEDDING_PROVIDER = ''
    process.env.SEARCH_EMBEDDING_MODEL = ''
    process.env.SEARCH_EMBEDDING_DIMENSIONS = ''
    process.env.SEARCH_EMBEDDING_BASE_URL = ''

    const network = getNetworkConfig()
    expect(network.port).toBe(4123)
    expect(network.corsOrigins).toEqual(['https://yaml-one.example', 'https://yaml-two.example'])

    const api = getApiConfig()
    expect(api.usersSearchLimit).toBe(31)
    expect(api.usersListLimit).toBe(90)

    const search = getSearchConfig()
    expect(search.defaultLimit).toBe(15)
    expect(search.maxLimit).toBe(40)
    expect(search.lexicalPerTypeLimit).toBe(20)
    expect(search.lexicalCandidateMultiplier).toBe(2)
    expect(search.lexicalSimilarityFloor).toBe(0.3)
    expect(search.semanticCandidateLimit).toBe(60)
    expect(search.semanticMinScore).toBe(0.25)
    expect(search.semanticTimeoutMs).toBe(700)
    expect(search.embeddingQueryCacheTtlMs).toBe(10000)
    expect(search.embeddingProvider).toBe('none')
    expect(search.embeddingModel).toBe('text-embedding-3-large')
    expect(search.embeddingDimensions).toBe(1024)
    expect(search.embeddingBaseUrl).toBe('https://example-openai-proxy.test/v1')
  })

  it('keeps legacy env precedence over YAML during migration window', () => {
    setPublicRuntimeConfig(`
PORT: 4900
CORS_ORIGINS:
  - https://yaml.example
`)
    process.env.PORT = '4999'
    process.env.CORS_ORIGINS = 'https://legacy-env.example'

    const network = getNetworkConfig()
    expect(network.port).toBe(4999)
    expect(network.corsOrigins).toEqual(['https://legacy-env.example'])
  })

  it('warns once when legacy non-secret env vars are used', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    setPublicRuntimeConfig('PORT: 4701')
    process.env.PORT = '4702'

    const network = getNetworkConfig()
    expect(network.port).toBe(4702)
    const warned = warnSpy.mock.calls.some((call) => String(call[0]).includes('Legacy non-secret env var "PORT"'))
    expect(warned).toBe(true)

    warnSpy.mockRestore()
  })

  it('keeps embedding API key secret-only (YAML key is ignored)', () => {
    setPublicRuntimeConfig(`
SEARCH_EMBEDDING_PROVIDER: openai
SEARCH_EMBEDDING_API_KEY: yaml-should-not-be-used
`)
    process.env.SEARCH_EMBEDDING_API_KEY = ''

    const search = getSearchConfig()
    expect(search.embeddingProvider).toBe('openai')
    expect(search.embeddingApiKey).toBeNull()
    expect(search.semanticProviderReady).toBe(false)
  })

  it('supports seed profile override path from public runtime YAML', () => {
    setPublicRuntimeConfig('SEED_PROFILE_PATH: src/db/seed-profiles/full-default.json')
    process.env.SEED_PROFILE_PATH = ''

    const resolved = resolveSeedProfileOverridePath(parseSeedArgs([]))
    expect(resolved).toBe(path.resolve(process.cwd(), 'src/db/seed-profiles/full-default.json'))
  })
})

