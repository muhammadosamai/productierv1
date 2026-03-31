import { apiJson } from '@/lib/api/core'

export const settingsApi = {
  getAll(token?: string | null) {
    return apiJson<Record<string, unknown>>('/settings', { token })
  },
  getByKey(key: string, token?: string | null) {
    return apiJson<{ key: string; value: unknown }>(`/settings/${encodeURIComponent(key)}`, { token })
  },
  setByKey(key: string, value: unknown, token?: string | null) {
    return apiJson<{ key: string; value: unknown }>(`/settings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      token,
      json: { value },
    })
  },
}
