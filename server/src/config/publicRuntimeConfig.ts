import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { readEnv, splitCsv } from './env'

const STRING_KEYS = [
  'NODE_ENV',
  'CORS_ORIGINS',
  'AUTH_SECRET_MODE',
  'JWT_ACCESS_TTL',
  'JWT_ISSUER',
  'JWT_AUDIENCE',
  'JWT_ACTIVE_KID',
  'JWT_PUBLIC_KEYS_JSON',
  'JWT_PUBLIC_KEYS_PATH',
  'JWT_PUBLIC_KEY_PATH',
  'JWT_PUBLIC_KEY_PEM',
  'NOTIFICATIONS_ROLLOUT_MODE',
  'SEARCH_EMBEDDING_PROVIDER',
  'SEARCH_EMBEDDING_MODEL',
  'SEARCH_EMBEDDING_BASE_URL',
  'STORAGE_BACKEND',
  'STORAGE_LOCAL_ROOT',
  'STORAGE_PUBLIC_PREFIX',
  'STORAGE_PUBLIC_BASE_URL',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ENDPOINT',
  'S3_PUBLIC_BASE_URL',
  'INTEGRATIONS_SECRET_MODE',
  'SEED_PROFILE_PATH',
  'SEED_FULL_PACK_PATH',
  'SEED_USERS_PACK_PATH',
  'VITE_API_PORT',
  'VITE_API_PROXY_TARGET',
  'VITE_UPLOADS_PROXY_PREFIX',
] as const

const NUMBER_KEYS = [
  'PORT',
  'API_USERS_SEARCH_LIMIT',
  'API_USERS_LIST_LIMIT',
  'NOTIFICATIONS_PUBLISH_RETRIES',
  'NOTIFICATIONS_MAX_INBOX_PAGE_SIZE',
  'NOTIFICATIONS_UNREAD_DRIFT_WARN_THRESHOLD',
  'NOTIFICATIONS_CHANNEL_TIMEOUT_MS',
  'NOTIFICATIONS_REMINDER_INTERVAL_MS',
  'NOTIFICATIONS_REMINDER_COOLDOWN_MINUTES',
  'NOTIFICATIONS_REMINDER_DUE_SOON_HOURS',
  'NOTIFICATIONS_REMINDER_STALE_IN_PROGRESS_HOURS',
  'NOTIFICATIONS_REMINDER_REVIEW_SLA_HOURS',
  'NOTIFICATIONS_DAILY_ROLLUP_HOUR_UTC',
  'GLOBAL_SEARCH_DEFAULT_LIMIT',
  'GLOBAL_SEARCH_MAX_LIMIT',
  'GLOBAL_SEARCH_LEXICAL_PER_TYPE_LIMIT',
  'GLOBAL_SEARCH_LEXICAL_CANDIDATE_MULTIPLIER',
  'GLOBAL_SEARCH_LEXICAL_SIMILARITY_FLOOR',
  'GLOBAL_SEARCH_SEMANTIC_CANDIDATE_LIMIT',
  'GLOBAL_SEARCH_SEMANTIC_MIN_SCORE',
  'GLOBAL_SEARCH_SEMANTIC_TIMEOUT_MS',
  'GLOBAL_SEARCH_EMBEDDING_QUERY_CACHE_TTL_MS',
  'SEARCH_EMBEDDING_DIMENSIONS',
] as const

const BOOLEAN_KEYS = [
  'NOTIFICATIONS_ENABLED',
  'NOTIFICATIONS_EMAIL_CHANNEL_ENABLED',
  'NOTIFICATIONS_SLACK_CHANNEL_ENABLED',
  'NOTIFICATIONS_REMINDER_SCHEDULER_ENABLED',
  'NOTIFICATIONS_DAILY_ROLLUP_ENABLED',
  'GLOBAL_SEARCH_ENABLED',
  'GLOBAL_SEARCH_SEMANTIC_ENABLED',
  'S3_FORCE_PATH_STYLE',
] as const

const CSV_STRING_KEYS = new Set<string>([
  'CORS_ORIGINS',
  'JWT_AUDIENCE',
])

const JSON_STRING_KEYS = new Set<string>([
  'JWT_PUBLIC_KEYS_JSON',
])

const NO_DEPRECATION_WARNING_KEYS = new Set<string>([
  // NODE_ENV is still commonly supplied by runtime environments directly.
  'NODE_ENV',
])

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export type PublicRuntimeStringKey = (typeof STRING_KEYS)[number]
export type PublicRuntimeNumberKey = (typeof NUMBER_KEYS)[number]
export type PublicRuntimeBooleanKey = (typeof BOOLEAN_KEYS)[number]
export type PublicRuntimeKey =
  | PublicRuntimeStringKey
  | PublicRuntimeNumberKey
  | PublicRuntimeBooleanKey

export type PublicRuntimeConfig = Partial<Record<PublicRuntimeStringKey, string>>
  & Partial<Record<PublicRuntimeNumberKey, number>>
  & Partial<Record<PublicRuntimeBooleanKey, boolean>>

let cachedPublicRuntimeConfig: PublicRuntimeConfig | null = null
let warnedLegacyEnvKeys = new Set<PublicRuntimeKey>()

function parseBooleanString(value: string, key: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  throw new Error(`Invalid boolean value for ${key}: "${value}"`)
}

function parseNumberString(value: string, key: string): number {
  const parsed = Number(value.trim())
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${key}: "${value}"`)
  }
  return parsed
}

function normalizeYamlString(value: unknown, key: string): string | undefined {
  if (value === null || value === undefined) return undefined

  if (CSV_STRING_KEYS.has(key)) {
    if (Array.isArray(value)) {
      const asStrings = value.map((entry) => {
        if (typeof entry === 'string') return entry.trim()
        if (typeof entry === 'number' || typeof entry === 'boolean') return String(entry)
        throw new Error(`Invalid ${key} entry. Expected string-compatible list values.`)
      }).filter((entry) => entry.length > 0)
      return asStrings.length > 0 ? asStrings.join(',') : undefined
    }
    if (typeof value === 'string') {
      const normalized = splitCsv(value)
      return normalized.length > 0 ? normalized.join(',') : undefined
    }
    throw new Error(`Invalid ${key} value. Expected CSV string or string list.`)
  }

  if (JSON_STRING_KEYS.has(key)) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : undefined
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return JSON.stringify(value)
    }
    throw new Error(`Invalid ${key} value. Expected JSON string or object map.`)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  throw new Error(`Invalid ${key} value. Expected scalar string-compatible value.`)
}

function normalizeYamlNumber(value: unknown, key: string): number | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid ${key} value. Expected finite number.`)
    }
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    return parseNumberString(trimmed, key)
  }
  throw new Error(`Invalid ${key} value. Expected number or numeric string.`)
}

function normalizeYamlBoolean(value: unknown, key: string): boolean | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    return parseBooleanString(trimmed, key)
  }
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
  }
  throw new Error(`Invalid ${key} value. Expected boolean, 0/1, or boolean-like string.`)
}

function resolveConfigCandidates(): string[] {
  const configuredPath = readEnv('PUBLIC_RUNTIME_CONFIG_PATH')
  const candidates = Array.from(new Set([
    ...(configuredPath
      ? [path.isAbsolute(configuredPath) ? configuredPath : path.resolve(process.cwd(), configuredPath)]
      : []),
    path.resolve(process.cwd(), 'config/runtime.public.yaml'),
    path.resolve(process.cwd(), 'config/runtime.public.yml'),
    path.resolve(moduleDir, '../../config/runtime.public.yaml'),
    path.resolve(moduleDir, '../../config/runtime.public.yml'),
    path.resolve(moduleDir, '../../../config/runtime.public.yaml'),
    path.resolve(moduleDir, '../../../config/runtime.public.yml'),
  ]))
  return candidates
}

function readRawPublicConfig(): Record<string, unknown> {
  const configPath = resolveConfigCandidates().find((candidate) => existsSync(candidate))
  if (!configPath) return {}

  const content = readFileSync(configPath, 'utf8')
  const parsed = parseYaml(content)
  if (parsed === null || parsed === undefined) return {}
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Invalid public runtime config at "${configPath}". Root must be a key/value object.`,
    )
  }
  return parsed as Record<string, unknown>
}

function buildPublicRuntimeConfig(raw: Record<string, unknown>): PublicRuntimeConfig {
  const config: PublicRuntimeConfig = {}

  for (const key of STRING_KEYS) {
    const value = normalizeYamlString(raw[key], key)
    if (value !== undefined) config[key] = value
  }

  for (const key of NUMBER_KEYS) {
    const value = normalizeYamlNumber(raw[key], key)
    if (value !== undefined) config[key] = value
  }

  for (const key of BOOLEAN_KEYS) {
    const value = normalizeYamlBoolean(raw[key], key)
    if (value !== undefined) config[key] = value
  }

  return config
}

function getPublicRuntimeConfig(): PublicRuntimeConfig {
  if (cachedPublicRuntimeConfig) return cachedPublicRuntimeConfig
  const raw = readRawPublicConfig()
  cachedPublicRuntimeConfig = buildPublicRuntimeConfig(raw)
  return cachedPublicRuntimeConfig
}

function warnLegacyEnvFallback(name: PublicRuntimeKey) {
  if (NO_DEPRECATION_WARNING_KEYS.has(name)) return
  if (warnedLegacyEnvKeys.has(name)) return
  console.warn(
    `[config] Legacy non-secret env var "${name}" is deprecated and will be removed in a future release. ` +
    'Move it to server/config/runtime.public.yaml.',
  )
  warnedLegacyEnvKeys.add(name)
}

function readLegacyEnv(name: PublicRuntimeKey): string | undefined {
  const value = readEnv(name)
  if (!value) return undefined
  warnLegacyEnvFallback(name)
  return value
}

export function readPublicEnv(name: PublicRuntimeStringKey): string | undefined {
  const value = getPublicRuntimeConfig()[name]
  if (typeof value === 'string') return value
  const legacy = readLegacyEnv(name)
  if (legacy !== undefined) return legacy
  return undefined
}

export function readPublicNumberEnv(name: PublicRuntimeNumberKey): number | undefined {
  const value = getPublicRuntimeConfig()[name]
  if (typeof value === 'number') return value
  const legacy = readLegacyEnv(name)
  if (legacy !== undefined) {
    return parseNumberString(legacy, name)
  }
  return undefined
}

export function readPublicBooleanEnv(name: PublicRuntimeBooleanKey): boolean | undefined {
  const value = getPublicRuntimeConfig()[name]
  if (typeof value === 'boolean') return value
  const legacy = readLegacyEnv(name)
  if (legacy !== undefined) {
    return parseBooleanString(legacy, name)
  }
  return undefined
}

export function readPublicEnumEnv<T extends string>(
  name: PublicRuntimeStringKey,
  allowed: readonly T[],
): T | undefined {
  const value = readPublicEnv(name)
  if (!value) return undefined
  if ((allowed as readonly string[]).includes(value)) return value as T
  throw new Error(`Invalid public runtime config ${name}: "${value}". Allowed: ${allowed.join(', ')}`)
}

export function readPublicCsvEnv(name: 'CORS_ORIGINS' | 'JWT_AUDIENCE'): string[] | undefined {
  const value = readPublicEnv(name)
  if (!value) return undefined
  const parsed = splitCsv(value)
  if (parsed.length === 0) {
    throw new Error(`Invalid public runtime config ${name}: expected non-empty CSV value`)
  }
  return parsed
}

export function readRuntimeNodeEnv(): string | undefined {
  return readPublicEnv('NODE_ENV')
}

export function resetPublicRuntimeConfigCacheForTests() {
  cachedPublicRuntimeConfig = null
  warnedLegacyEnvKeys = new Set<PublicRuntimeKey>()
}

