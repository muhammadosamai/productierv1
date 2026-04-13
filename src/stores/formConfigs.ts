import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import type { FormConfigJson, FormFieldConfig } from '@/types/formConfig'

export const useFormConfigsStore = defineStore('formConfigs', () => {
  // Cache: keyed by `${product}::${entityType}`
  const configs = ref<Record<string, FormConfigJson>>({})
  const loading = ref(false)

  function cacheKey(product: string, entityType: string) {
    return `${product}::${entityType}`
  }

  async function fetchConfig(product: string, entityType: string): Promise<FormConfigJson | null> {
    loading.value = true
    try {
      const res = await fetch(`/api/form-configs/${encodeURIComponent(product)}/${entityType}`)
      if (res.ok) {
        const config = await res.json() as FormConfigJson
        configs.value[cacheKey(product, entityType)] = config
        return config
      }
    } catch {}
    finally { loading.value = false }
    return null
  }

  async function saveConfig(
    product: string,
    entityType: string,
    config: FormConfigJson,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const authStore = useAuthStore()
    try {
      const res = await fetch(`/api/form-configs/${encodeURIComponent(product)}/${entityType}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`,
        },
        body: JSON.stringify({ config }),
      })
      if (res.ok) {
        configs.value[cacheKey(product, entityType)] = config
        return { ok: true }
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return {
        ok: false,
        error: body.error || `Save failed (${res.status})`,
      }
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Network error',
      }
    }
  }

  function getConfig(product: string, entityType: string): FormConfigJson | null {
    return configs.value[cacheKey(product, entityType)] || null
  }

  function getVisibleFields(product: string, entityType: string): FormFieldConfig[] {
    const config = getConfig(product, entityType)
    if (!config) return []
    return config.fields.filter(f => f.visible).sort((a, b) => a.order - b.order)
  }

  // Custom field values
  async function fetchCustomValues(entityType: string, entityId: string): Promise<Record<string, any>> {
    try {
      const res = await fetch(`/api/custom-fields/${entityType}/${entityId}`)
      if (res.ok) return await res.json()
    } catch {}
    return {}
  }

  async function saveCustomValues(entityType: string, entityId: string, values: Record<string, any>): Promise<boolean> {
    const authStore = useAuthStore()
    try {
      const res = await fetch(`/api/custom-fields/${entityType}/${entityId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`,
        },
        body: JSON.stringify({ values }),
      })
      return res.ok
    } catch {}
    return false
  }

  return { configs, loading, fetchConfig, saveConfig, getConfig, getVisibleFields, fetchCustomValues, saveCustomValues }
})
