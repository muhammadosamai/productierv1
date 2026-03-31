function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeHttpBaseUrl(rawBaseUrl: string, envName: string): string {
  const normalized = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error(`${envName} must be a valid absolute URL. Received "${rawBaseUrl}".`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${envName} must use http or https protocol. Received "${rawBaseUrl}".`)
  }

  return normalized
}

const DEFAULT_TEST_APP_BASE_URL = 'http://127.0.0.1'
const DEFAULT_TEST_AUTH_PASSWORD = 'integration-test-password'

export const TEST_APP_BASE_URL = normalizeHttpBaseUrl(
  readOptionalEnv('TEST_APP_BASE_URL') ?? DEFAULT_TEST_APP_BASE_URL,
  'TEST_APP_BASE_URL',
)

export const TEST_AUTH_PASSWORD = readOptionalEnv('TEST_AUTH_PASSWORD') ?? DEFAULT_TEST_AUTH_PASSWORD
