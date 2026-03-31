import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { User } from '@/types/user'
import { STORAGE_KEYS } from '@/constants/storageKeys'
import { ApiError, apiFetch, authApi } from '@/lib/apiClient'
import { storageGet, storageRemove, storageSet } from '@/lib/browserStorage'

const TOKEN_KEY = STORAGE_KEYS.auth.token
const TOKEN_SCHEMA_KEY = STORAGE_KEYS.auth.tokenSchema
const TOKEN_SCHEMA_VERSION = STORAGE_KEYS.auth.tokenSchemaVersion
const SESSION_TOKEN_KEY = `${TOKEN_KEY}:session`
const SESSION_SCHEMA_KEY = `${TOKEN_SCHEMA_KEY}:session`

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function isUser(value: unknown): value is User {
  const record = asRecord(value)
  if (!record) return false
  return typeof record.id === 'string'
    && typeof record.name === 'string'
    && typeof record.email === 'string'
    && typeof record.role === 'string'
    && typeof record.isActive === 'boolean'
    && (record.avatar === null || typeof record.avatar === 'string')
    && typeof record.createdAt === 'string'
}

function decodeJwtSegment(segment: string): Record<string, unknown> | null {
  if (!segment) return null
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
  const normalized = `${padded}${'='.repeat((4 - (padded.length % 4)) % 4)}`
  try {
    const decoded = atob(normalized)
    const parsed = JSON.parse(decoded)
    return asRecord(parsed)
  } catch {
    return null
  }
}

function isTokenLocallyUsable(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 3) return false

  const header = decodeJwtSegment(parts[0] || '')
  const payload = decodeJwtSegment(parts[1] || '')
  if (!header || !payload) return false

  if (header.alg !== 'RS256') return false
  if (typeof header.kid !== 'string' || !header.kid.trim()) return false

  const exp = payload.exp
  if (typeof exp === 'number' && Number.isFinite(exp)) {
    if (Date.now() >= exp * 1000) return false
  }

  return true
}

function readSessionStorage(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function writeSessionStorage(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // Ignore session storage write failures (private mode/quota).
  }
}

function removeSessionStorage(key: string) {
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // Ignore session storage remove failures.
  }
}

function persistedTokenSchema(): string | null {
  const sessionSchema = readSessionStorage(SESSION_SCHEMA_KEY)
  if (sessionSchema) return sessionSchema
  return storageGet(TOKEN_SCHEMA_KEY)
}

function readPersistedToken(): string | null {
  const sessionToken = readSessionStorage(SESSION_TOKEN_KEY)
  if (sessionToken) return sessionToken
  const legacyLocalToken = storageGet(TOKEN_KEY)
  if (!legacyLocalToken) return null
  // Migrate legacy persisted tokens to session storage to reduce long-lived exposure.
  persistToken(legacyLocalToken)
  storageRemove(TOKEN_KEY)
  storageRemove(TOKEN_SCHEMA_KEY)
  return legacyLocalToken
}

function persistToken(value: string) {
  writeSessionStorage(SESSION_TOKEN_KEY, value)
  writeSessionStorage(SESSION_SCHEMA_KEY, TOKEN_SCHEMA_VERSION)
  // Clear legacy local-storage copies once we move to session-scoped token persistence.
  storageRemove(TOKEN_KEY)
  storageRemove(TOKEN_SCHEMA_KEY)
}

function clearPersistedToken() {
  storageRemove(TOKEN_KEY)
  storageRemove(TOKEN_SCHEMA_KEY)
  removeSessionStorage(SESSION_TOKEN_KEY)
  removeSessionStorage(SESSION_SCHEMA_KEY)
}

async function readJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function getLoginErrorMessage(status: number, fallback?: string): string {
  if (status === 401) return 'Invalid email or password.'
  if (status === 403) return 'Account is deactivated. Contact an administrator.'
  if (status === 503) return 'Authentication service is unavailable. Ensure backend and database are running.'
  return fallback || 'Login failed'
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const initialized = ref(false)
  let initPromise: Promise<void> | null = null

  const isAuthenticated = computed(() => !!token.value && !!user.value)

  async function login(email: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const payload = await authApi.login(email, password)
      const tokenValue = typeof payload.token === 'string' ? payload.token : null
      const userValue = asRecord(payload.user)
      if (!tokenValue || !isUser(userValue)) {
        error.value = 'Unexpected response from auth service.'
        return false
      }

      token.value = tokenValue
      user.value = userValue
      persistToken(tokenValue)
      return true
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = getLoginErrorMessage(e.status, e.message)
        return false
      }
      error.value = 'Network error. Please try again.'
      return false
    } finally {
      loading.value = false
    }
  }

  async function register(
    name: string,
    email: string,
    password: string,
    options?: {
      organizationName?: string
      bootstrapOrganization?: boolean
    },
  ): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const payload = await authApi.register(name, email, password, options)
      const tokenValue = typeof payload.token === 'string' ? payload.token : null
      const userValue = asRecord(payload.user)
      if (!tokenValue || !isUser(userValue)) {
        error.value = 'Unexpected response from auth service.'
        return false
      }
      token.value = tokenValue
      user.value = userValue
      persistToken(tokenValue)
      return true
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = e.message || 'Registration failed'
        return false
      }
      error.value = 'Network error. Please try again.'
      return false
    } finally {
      loading.value = false
    }
  }

  async function forgotPassword(email: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      await authApi.forgotPassword(email)
      return true
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = e.message || 'Request failed'
        return false
      }
      error.value = 'Network error. Please try again.'
      return false
    } finally {
      loading.value = false
    }
  }

  async function fetchMe(): Promise<boolean> {
    const storedToken = token.value || readPersistedToken()
    if (!storedToken) return false
    if (!isTokenLocallyUsable(storedToken)) {
      logout()
      return false
    }

    try {
      const res = await apiFetch('/auth/me', { token: storedToken })
      if (!res.ok) {
        if (res.status === 401) {
          // Stale or invalid token from previous local session; clear silently.
          logout()
          return false
        }
        if (res.status === 403) {
          logout()
          error.value = 'Account is deactivated. Contact an administrator.'
          return false
        }
        const payload = asRecord(await readJsonSafe(res))
        error.value = typeof payload?.error === 'string' ? payload.error : 'Unable to restore your session.'
        return false
      }
      const payload = asRecord(await readJsonSafe(res))
      if (!isUser(payload)) {
        logout()
        return false
      }
      user.value = payload
      token.value = storedToken
      persistToken(storedToken)
      return true
    } catch {
      error.value = 'Unable to reach auth service. Please try again.'
      return false
    }
  }

  async function updateProfile(data: { name?: string; email?: string; avatar?: string }): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const result = await authApi.updateProfile(data, token.value)
      user.value = result
      return true
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = e.message || 'Update failed'
        return false
      }
      error.value = 'Network error. Please try again.'
      return false
    } finally {
      loading.value = false
    }
  }

  function logout() {
    user.value = null
    token.value = null
    clearPersistedToken()
  }

  async function init() {
    if (initialized.value) return
    if (initPromise) return initPromise

    initPromise = (async () => {
      const storedToken = readPersistedToken()
      const persistedSchema = persistedTokenSchema()
      if (storedToken) {
        if (persistedSchema !== TOKEN_SCHEMA_VERSION || !isTokenLocallyUsable(storedToken)) {
          logout()
          return
        }
        token.value = storedToken
        await fetchMe()
      }
      initialized.value = true
    })()

    try {
      await initPromise
    } finally {
      initPromise = null
    }
  }

  return {
    user, token, loading, error, isAuthenticated, initialized,
    login, register, forgotPassword, fetchMe, updateProfile, logout, init,
  }
})
