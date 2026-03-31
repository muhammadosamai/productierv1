import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  readPublicBooleanEnv,
  readPublicEnv,
  readPublicEnumEnv,
} from './publicRuntimeConfig'

export type StorageBackend = 'local' | 's3'

interface BaseStorageConfig {
  backend: StorageBackend
  publicPrefix: string
  publicBaseUrl: string | null
}

export interface LocalStorageConfig extends BaseStorageConfig {
  backend: 'local'
  localRoot: string
}

export interface S3StorageConfig extends BaseStorageConfig {
  backend: 's3'
  s3Bucket: string
  s3Region: string
  s3Endpoint: string | null
  s3ForcePathStyle: boolean
}

export type StorageConfig = LocalStorageConfig | S3StorageConfig

let cachedStorageConfig: StorageConfig | null = null
const configDir = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.resolve(configDir, '..', '..')

function readRequiredPublicEnv(name: 'S3_BUCKET' | 'S3_REGION', reason?: string): string {
  const value = readPublicEnv(name)
  if (value) return value
  const suffix = reason ? ` (${reason})` : ''
  throw new Error(`Missing required env var: ${name}${suffix}`)
}

function normalizePrefix(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return '/uploads'
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash
}

function normalizeBaseUrl(input: string | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

function resolveLocalRoot(input: string | undefined): string {
  const normalized = input?.trim()
  if (!normalized) {
    return path.resolve(serverRoot, 'uploads')
  }
  return path.isAbsolute(normalized)
    ? normalized
    : path.resolve(serverRoot, normalized)
}

export function getStorageConfig(): StorageConfig {
  if (cachedStorageConfig) return cachedStorageConfig

  const backend = readPublicEnumEnv('STORAGE_BACKEND', ['local', 's3'] as const) || 'local'
  const publicPrefix = normalizePrefix(readPublicEnv('STORAGE_PUBLIC_PREFIX') || '/uploads')
  const publicBaseUrl = normalizeBaseUrl(readPublicEnv('STORAGE_PUBLIC_BASE_URL'))

  if (backend === 'local') {
    cachedStorageConfig = {
      backend,
      localRoot: resolveLocalRoot(readPublicEnv('STORAGE_LOCAL_ROOT')),
      publicPrefix,
      publicBaseUrl,
    }
    return cachedStorageConfig
  }

  cachedStorageConfig = {
    backend,
    publicPrefix,
    publicBaseUrl: publicBaseUrl || normalizeBaseUrl(readPublicEnv('S3_PUBLIC_BASE_URL')),
    s3Bucket: readRequiredPublicEnv('S3_BUCKET', 'required when STORAGE_BACKEND=s3'),
    s3Region: readRequiredPublicEnv('S3_REGION', 'required when STORAGE_BACKEND=s3'),
    s3Endpoint: normalizeBaseUrl(readPublicEnv('S3_ENDPOINT')),
    s3ForcePathStyle: readPublicBooleanEnv('S3_FORCE_PATH_STYLE') ?? false,
  }
  return cachedStorageConfig
}

export function resetStorageConfigCacheForTests() {
  cachedStorageConfig = null
}

