import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import type { AssetType, Asset, CreateAssetPayload, CreateAssetTypePayload } from '@/types/wiki'

export const useWikiStore = defineStore('wiki', () => {
  const assetTypes = ref<AssetType[]>([])
  const assets = ref<Asset[]>([])
  const selectedAsset = ref<Asset | null>(null)
  const loading = ref(false)

  function authHeaders() {
    const authStore = useAuthStore()
    return {
      Authorization: `Bearer ${authStore.token}`,
      'Content-Type': 'application/json',
    }
  }

  // ============ ASSET TYPES ============

  async function fetchAssetTypes(product?: string) {
    try {
      const url = product ? `/api/wiki/types?product=${encodeURIComponent(product)}` : '/api/wiki/types'
      const res = await fetch(url, { headers: authHeaders() })
      if (res.ok) {
        assetTypes.value = await res.json()
      }
    } catch {
      assetTypes.value = []
    }
  }

  async function createAssetType(payload: CreateAssetTypePayload): Promise<AssetType | null> {
    try {
      const res = await fetch('/api/wiki/types', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const created = await res.json()
        assetTypes.value.push(created)
        return created
      }
      return null
    } catch {
      return null
    }
  }

  // ============ ASSETS ============

  async function fetchAssets(product?: string, typeSlug?: string, search?: string) {
    loading.value = true
    try {
      const params = new URLSearchParams()
      if (product) params.set('product', product)
      if (typeSlug) params.set('type', typeSlug)
      if (search) params.set('search', search)
      const res = await fetch(`/api/wiki/assets?${params}`, { headers: authHeaders() })
      if (res.ok) {
        assets.value = await res.json()
      }
    } catch {
      assets.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchAsset(id: string): Promise<Asset | null> {
    try {
      const res = await fetch(`/api/wiki/assets/${id}`, { headers: authHeaders() })
      if (res.ok) {
        const asset = await res.json()
        selectedAsset.value = asset
        return asset
      }
      return null
    } catch {
      return null
    }
  }

  async function createAsset(payload: CreateAssetPayload): Promise<Asset | null> {
    try {
      const res = await fetch('/api/wiki/assets', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const created = await res.json()
        assets.value.unshift(created)
        return created
      }
      return null
    } catch {
      return null
    }
  }

  async function updateAsset(id: string, payload: Partial<CreateAssetPayload>): Promise<Asset | null> {
    try {
      const res = await fetch(`/api/wiki/assets/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const updated = await res.json()
        const idx = assets.value.findIndex(a => a.id === id)
        if (idx !== -1) assets.value[idx] = updated
        if (selectedAsset.value?.id === id) {
          selectedAsset.value = { ...selectedAsset.value, ...updated }
        }
        return updated
      }
      return null
    } catch {
      return null
    }
  }

  async function deleteAsset(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/wiki/assets/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (res.ok) {
        assets.value = assets.value.filter(a => a.id !== id)
        if (selectedAsset.value?.id === id) selectedAsset.value = null
        return true
      }
      return false
    } catch {
      return false
    }
  }

  // ============ RELATIONS ============

  async function addRelation(assetId: string, targetAssetId: string, relationType: string = 'related_to') {
    try {
      const res = await fetch(`/api/wiki/assets/${assetId}/relations`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ targetAssetId, relationType }),
      })
      if (res.ok) {
        // Re-fetch the asset to get updated relations
        await fetchAsset(assetId)
      }
    } catch { /* ignore */ }
  }

  async function removeRelation(assetId: string, relationId: string) {
    try {
      await fetch(`/api/wiki/assets/${assetId}/relations/${relationId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      // Re-fetch the asset to get updated relations
      await fetchAsset(assetId)
    } catch { /* ignore */ }
  }

  return {
    assetTypes, assets, selectedAsset, loading,
    fetchAssetTypes, createAssetType,
    fetchAssets, fetchAsset, createAsset, updateAsset, deleteAsset,
    addRelation, removeRelation,
  }
})
