import type { Ref } from 'vue'
import { settingsApi } from '@/lib/apiClient'

export type SettingsPayload = Record<string, unknown>

export function useHybridSettings(
  authToken: Ref<string | null>,
  debounceMs = 500,
) {
  const saveTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
  const pendingWrites = new Map<string, { value: unknown; token: string }>()

  function persistSetting(key: string, payload: { value: unknown; token: string }) {
    void settingsApi.setByKey(key, payload.value, payload.token).catch(() => {
      // Local storage remains the fallback source.
    })
  }

  function scheduleWrite(key: string) {
    const existing = saveTimeouts.get(key)
    if (existing) clearTimeout(existing)

    const timeout = setTimeout(() => {
      saveTimeouts.delete(key)
      const payload = pendingWrites.get(key)
      if (!payload) return
      pendingWrites.delete(key)
      persistSetting(key, payload)
    }, debounceMs)

    saveTimeouts.set(key, timeout)
  }

  function saveSetting(key: string, value: unknown) {
    const token = authToken.value
    if (!token) return
    pendingWrites.set(key, { value, token })
    scheduleWrite(key)
  }

  async function loadSettings(): Promise<SettingsPayload> {
    const token = authToken.value
    if (!token) return {}
    try {
      const payload = await settingsApi.getAll(token)
      return (payload ?? {}) as SettingsPayload
    } catch {
      return {}
    }
  }

  function cleanup() {
    for (const timeout of saveTimeouts.values()) {
      clearTimeout(timeout)
    }
    saveTimeouts.clear()

    for (const [key, payload] of pendingWrites.entries()) {
      persistSetting(key, payload)
    }
    pendingWrites.clear()
  }

  return {
    saveSetting,
    loadSettings,
    cleanup,
  }
}
