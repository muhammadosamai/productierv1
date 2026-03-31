import { getAuthConfig } from './auth'
import { readEnv, readRequiredEnv } from './env'
import { readPublicEnumEnv, readRuntimeNodeEnv } from './publicRuntimeConfig'

export type IntegrationsSecretMode = 'required' | 'allow-jwt-fallback'

export interface IntegrationsConfig {
  secretMode: IntegrationsSecretMode
  secretKey: string
}

let cachedIntegrationsConfig: IntegrationsConfig | null = null
let warnedFallback = false

function defaultSecretMode(): IntegrationsSecretMode {
  const nodeEnv = readRuntimeNodeEnv() ?? process.env.NODE_ENV
  return nodeEnv === 'production' ? 'required' : 'allow-jwt-fallback'
}

export function getIntegrationsConfig(): IntegrationsConfig {
  if (cachedIntegrationsConfig) return cachedIntegrationsConfig

  const secretMode = readPublicEnumEnv(
    'INTEGRATIONS_SECRET_MODE',
    ['required', 'allow-jwt-fallback'] as const,
  ) || defaultSecretMode()
  const nodeEnv = readRuntimeNodeEnv() ?? process.env.NODE_ENV
  const isTestEnv = nodeEnv === 'test'

  const explicitSecret = isTestEnv
    ? readEnv('INTEGRATIONS_SECRET_KEY')
    : readRequiredEnv(
      'INTEGRATIONS_SECRET_KEY',
      'integrations credentials encryption outside test',
    )
  if (explicitSecret) {
    cachedIntegrationsConfig = { secretMode, secretKey: explicitSecret }
    return cachedIntegrationsConfig
  }

  if (!isTestEnv || secretMode === 'required') {
    throw new Error('INTEGRATIONS_SECRET_KEY is required when INTEGRATIONS_SECRET_MODE=required')
  }

  const authConfig = getAuthConfig()
  if (!warnedFallback) {
    console.warn(
      '[integrations] INTEGRATIONS_SECRET_KEY is not set in test mode. Falling back to derived auth key.',
    )
    warnedFallback = true
  }

  cachedIntegrationsConfig = {
    secretMode,
    secretKey: authConfig.jwtFallbackSecret,
  }
  return cachedIntegrationsConfig
}

export function resetIntegrationsConfigCacheForTests() {
  cachedIntegrationsConfig = null
  warnedFallback = false
}

