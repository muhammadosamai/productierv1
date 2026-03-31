import { readPublicNumberEnv } from './publicRuntimeConfig'

export interface ApiConfig {
  usersSearchLimit: number
  usersListLimit: number
}

let cachedApiConfig: ApiConfig | null = null

type ApiNumberName = 'API_USERS_SEARCH_LIMIT' | 'API_USERS_LIST_LIMIT'

function readPositiveIntegerEnv(name: ApiNumberName, fallback: number): number {
  const configured = readPublicNumberEnv(name)
  if (configured === undefined) return fallback

  if (!Number.isInteger(configured) || configured <= 0) {
    throw new Error(`Invalid ${name} value: "${configured}". Expected a positive integer.`)
  }
  return configured
}

export function getApiConfig(): ApiConfig {
  if (cachedApiConfig) return cachedApiConfig

  const usersSearchLimit = readPositiveIntegerEnv('API_USERS_SEARCH_LIMIT', 50)
  const usersListLimit = readPositiveIntegerEnv('API_USERS_LIST_LIMIT', 100)

  if (usersSearchLimit > usersListLimit) {
    throw new Error(
      'Invalid API users list/search configuration: ' +
      `API_USERS_SEARCH_LIMIT (${usersSearchLimit}) cannot exceed ` +
      `API_USERS_LIST_LIMIT (${usersListLimit}).`,
    )
  }

  cachedApiConfig = {
    usersSearchLimit,
    usersListLimit,
  }
  return cachedApiConfig
}

export function resetApiConfigCacheForTests() {
  cachedApiConfig = null
}
