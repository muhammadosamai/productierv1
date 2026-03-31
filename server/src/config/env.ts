import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type EnvMap = Map<string, string>

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const envFileCandidates = Array.from(new Set([
  path.resolve(process.cwd(), '.env'),
  path.resolve(moduleDir, '../../.env'),
  path.resolve(moduleDir, '../../../.env'),
]))

let cachedEnvFileMap: EnvMap | null = null

function parseDotEnv(content: string): EnvMap {
  const map: EnvMap = new Map()
  const lines = content.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) continue

    const key = trimmed.slice(0, eqIndex).trim()
    if (!key) continue

    let value = trimmed.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    map.set(key, value)
  }

  return map
}

function loadEnvFileMap(): EnvMap {
  if (cachedEnvFileMap) return cachedEnvFileMap

  const map: EnvMap = new Map()
  for (const candidate of envFileCandidates) {
    if (!existsSync(candidate)) continue
    const content = readFileSync(candidate, 'utf8')
    const parsed = parseDotEnv(content)
    for (const [key, value] of parsed.entries()) {
      if (!map.has(key)) map.set(key, value)
    }
  }

  cachedEnvFileMap = map
  return map
}

export function readEnv(name: string): string | undefined {
  const hasRuntimeOverride = Object.prototype.hasOwnProperty.call(process.env, name)
  if (hasRuntimeOverride) {
    const runtimeValue = process.env[name]
    if (typeof runtimeValue === 'string') {
      const trimmed = runtimeValue.trim()
      return trimmed.length > 0 ? trimmed : undefined
    }
    return undefined
  }

  const fileValue = loadEnvFileMap().get(name)
  if (!fileValue) return undefined
  const trimmedFileValue = fileValue.trim()
  return trimmedFileValue.length > 0 ? trimmedFileValue : undefined
}

export function readRequiredEnv(name: string, reason?: string): string {
  const value = readEnv(name)
  if (value) return value
  const suffix = reason ? ` (${reason})` : ''
  throw new Error(`Missing required env var: ${name}${suffix}`)
}

export function readBooleanEnv(name: string): boolean | undefined {
  const value = readEnv(name)
  if (!value) return undefined
  const normalized = value.toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  throw new Error(`Invalid boolean env var ${name}: "${value}"`)
}

export function readNumberEnv(name: string): number | undefined {
  const value = readEnv(name)
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric env var ${name}: "${value}"`)
  }
  return parsed
}

export function readEnumEnv<T extends string>(name: string, allowed: readonly T[]): T | undefined {
  const value = readEnv(name)
  if (!value) return undefined
  if ((allowed as readonly string[]).includes(value)) return value as T
  throw new Error(`Invalid env var ${name}: "${value}". Allowed: ${allowed.join(', ')}`)
}

export function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

export function resetEnvCacheForTests() {
  cachedEnvFileMap = null
}

