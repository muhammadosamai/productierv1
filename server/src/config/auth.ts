import { createHash, generateKeyPairSync } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { readEnv } from './env'
import {
  readPublicCsvEnv,
  readPublicEnumEnv,
  readPublicEnv,
  readRuntimeNodeEnv,
} from './publicRuntimeConfig'

export type AuthSecretMode = 'required' | 'ephemeral-dev'
export type JwtAlgorithm = 'RS256'

export interface AuthConfig {
  secretMode: AuthSecretMode
  jwtAlgorithm: JwtAlgorithm
  jwtAccessTtl: string
  jwtIssuer: string
  jwtAudience: string[]
  jwtActiveKid: string
  jwtActivePrivateKeyPem: string
  jwtPublicKeysByKid: Record<string, string>
  // Compatibility fallback for modules that still rely on a symmetric app secret.
  jwtFallbackSecret: string
}

let cachedAuthConfig: AuthConfig | null = null
let cachedEphemeralKeyMaterial: {
  activeKid: string
  activePrivateKeyPem: string
  publicKeysByKid: Record<string, string>
} | null = null
let warnedEphemeralKeyMaterial = false

function defaultSecretMode(): AuthSecretMode {
  const nodeEnv = readRuntimeNodeEnv() ?? process.env.NODE_ENV
  return nodeEnv === 'production' ? 'required' : 'ephemeral-dev'
}

function resolvePath(rawPath: string): string {
  return path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(process.cwd(), rawPath)
}

function normalizePem(value: string): string {
  return value.replace(/\\n/g, '\n').trim()
}

function readPemFromEnvOrPath(
  valueEnvName: string,
  pathEnvName: string,
  label: string,
): string | undefined {
  const inlineValue = readEnv(valueEnvName)
  if (inlineValue) return normalizePem(inlineValue)

  const configuredPath = readEnv(pathEnvName)
  if (!configuredPath) return undefined
  const absolutePath = resolvePath(configuredPath)
  if (!existsSync(absolutePath)) {
    throw new Error(`${label} file was not found at path: ${absolutePath}`)
  }
  return normalizePem(readFileSync(absolutePath, 'utf8'))
}

function readPemFromPublicConfigOrPath(
  valueName: 'JWT_PUBLIC_KEY_PEM',
  pathName: 'JWT_PUBLIC_KEY_PATH',
  label: string,
): string | undefined {
  const inlineValue = readPublicEnv(valueName)
  if (inlineValue) return normalizePem(inlineValue)

  const configuredPath = readPublicEnv(pathName)
  if (!configuredPath) return undefined
  const absolutePath = resolvePath(configuredPath)
  if (!existsSync(absolutePath)) {
    throw new Error(`${label} file was not found at path: ${absolutePath}`)
  }
  return normalizePem(readFileSync(absolutePath, 'utf8'))
}

function parsePemMap(raw: string, label: string): Record<string, string> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${label} must be valid JSON map: {"kid":"-----BEGIN PUBLIC KEY-----..."}`)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object keyed by kid`)
  }

  const normalized: Record<string, string> = {}
  for (const [kid, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!kid.trim()) {
      throw new Error(`${label} contains an empty kid key`)
    }
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${label} value for kid "${kid}" must be a non-empty PEM string`)
    }
    normalized[kid] = normalizePem(value)
  }
  return normalized
}

function readPemMapFromPublicPath(
  pathName: 'JWT_PUBLIC_KEYS_PATH',
  label: string,
): Record<string, string> {
  const configuredPath = readPublicEnv(pathName)
  if (!configuredPath) return {}
  const absolutePath = resolvePath(configuredPath)
  if (!existsSync(absolutePath)) {
    throw new Error(`${label} file was not found at path: ${absolutePath}`)
  }
  return parsePemMap(readFileSync(absolutePath, 'utf8'), label)
}

function readConfiguredKeyMaterial() {
  const activeKid = readPublicEnv('JWT_ACTIVE_KID')
  const activePrivateKeyPem = readPemFromEnvOrPath(
    'JWT_PRIVATE_KEY_PEM',
    'JWT_PRIVATE_KEY_PATH',
    'Active JWT private key',
  )
  const activePublicKeyPem = readPemFromPublicConfigOrPath(
    'JWT_PUBLIC_KEY_PEM',
    'JWT_PUBLIC_KEY_PATH',
    'Active JWT public key',
  )

  const publicKeysByKid = {
    ...readPemMapFromPublicPath('JWT_PUBLIC_KEYS_PATH', 'JWT public key ring'),
    ...(readPublicEnv('JWT_PUBLIC_KEYS_JSON')
      ? parsePemMap(readPublicEnv('JWT_PUBLIC_KEYS_JSON')!, 'JWT_PUBLIC_KEYS_JSON')
      : {}),
  }

  if (activeKid && activePublicKeyPem) {
    publicKeysByKid[activeKid] = activePublicKeyPem
  }

  const hasAnyKeyConfig = Boolean(
    activeKid
    || activePrivateKeyPem
    || activePublicKeyPem
    || Object.keys(publicKeysByKid).length > 0
    || readPublicEnv('JWT_PUBLIC_KEYS_PATH')
    || readPublicEnv('JWT_PUBLIC_KEYS_JSON'),
  )

  if (!hasAnyKeyConfig) {
    return null
  }

  const missing: string[] = []
  if (!activeKid) missing.push('JWT_ACTIVE_KID')
  if (!activePrivateKeyPem) missing.push('JWT_PRIVATE_KEY_PEM or JWT_PRIVATE_KEY_PATH')
  if (activeKid && !publicKeysByKid[activeKid]) {
    missing.push(`public key for active kid "${activeKid}"`)
  }
  if (missing.length > 0) {
    throw new Error(
      `Incomplete JWT key-ring configuration. Missing: ${missing.join(', ')}.`,
    )
  }

  return {
    activeKid: activeKid!,
    activePrivateKeyPem: activePrivateKeyPem!,
    publicKeysByKid,
  }
}

function getEphemeralKeyMaterial() {
  if (!cachedEphemeralKeyMaterial) {
    const generated = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    const dayStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const activeKid = `dev-${dayStamp}`
    cachedEphemeralKeyMaterial = {
      activeKid,
      activePrivateKeyPem: generated.privateKey,
      publicKeysByKid: {
        [activeKid]: generated.publicKey,
      },
    }
  }
  if (!warnedEphemeralKeyMaterial) {
    console.warn('[auth] JWT key-ring is not set. Using ephemeral RS256 development key pair.')
    warnedEphemeralKeyMaterial = true
  }
  return cachedEphemeralKeyMaterial
}

export function getAuthConfig(): AuthConfig {
  if (cachedAuthConfig) return cachedAuthConfig

  const secretMode = readPublicEnumEnv(
    'AUTH_SECRET_MODE',
    ['required', 'ephemeral-dev'] as const,
  ) || defaultSecretMode()
  const jwtAccessTtl = readPublicEnv('JWT_ACCESS_TTL') || '7d'
  const jwtIssuer = readPublicEnv('JWT_ISSUER') || 'productier'
  const jwtAudience = readPublicCsvEnv('JWT_AUDIENCE') || ['productier-web']

  if (!jwtAccessTtl.trim()) {
    throw new Error('JWT_ACCESS_TTL must not be empty')
  }
  if (!jwtIssuer.trim()) {
    throw new Error('JWT_ISSUER must not be empty')
  }

  if (jwtAudience.length === 0) {
    throw new Error('JWT_AUDIENCE must contain at least one audience value')
  }

  const configuredKeyMaterial = readConfiguredKeyMaterial()
  const keyMaterial = configuredKeyMaterial
    || (secretMode === 'ephemeral-dev' ? getEphemeralKeyMaterial() : null)

  if (!keyMaterial) {
    throw new Error(
      'JWT key-ring configuration is required when AUTH_SECRET_MODE=required. ' +
      'Provide JWT_ACTIVE_KID, JWT_PRIVATE_KEY_PEM|JWT_PRIVATE_KEY_PATH, and public key ring settings.',
    )
  }

  const jwtFallbackSecret = createHash('sha256')
    .update(`${keyMaterial.activeKid}:${keyMaterial.activePrivateKeyPem}`)
    .digest('hex')

  cachedAuthConfig = {
    secretMode,
    jwtAlgorithm: 'RS256',
    jwtAccessTtl,
    jwtIssuer,
    jwtAudience,
    jwtActiveKid: keyMaterial.activeKid,
    jwtActivePrivateKeyPem: keyMaterial.activePrivateKeyPem,
    jwtPublicKeysByKid: keyMaterial.publicKeysByKid,
    jwtFallbackSecret,
  }
  return cachedAuthConfig
}

export function resetAuthConfigCacheForTests() {
  cachedAuthConfig = null
  cachedEphemeralKeyMaterial = null
  warnedEphemeralKeyMaterial = false
}

