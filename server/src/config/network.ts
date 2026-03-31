import { readPublicCsvEnv, readPublicNumberEnv } from './publicRuntimeConfig'

export interface NetworkConfig {
  port: number
  corsOrigins: string[]
}

let cachedNetworkConfig: NetworkConfig | null = null

export function getNetworkConfig(): NetworkConfig {
  if (cachedNetworkConfig) return cachedNetworkConfig

  const configuredPort = readPublicNumberEnv('PORT')
  const port = configuredPort === undefined ? 3001 : Math.trunc(configuredPort)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: "${configuredPort}"`)
  }

  const corsOrigins = readPublicCsvEnv('CORS_ORIGINS') || ['http://localhost:5173']
  if (corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must include at least one origin')
  }

  cachedNetworkConfig = {
    port,
    corsOrigins,
  }
  return cachedNetworkConfig
}

export function resetNetworkConfigCacheForTests() {
  cachedNetworkConfig = null
}

