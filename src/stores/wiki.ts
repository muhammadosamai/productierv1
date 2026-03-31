import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import type {
  AssetType,
  Asset,
  AssetRevision,
  AssetRevisionDiff,
  CreateAssetPayload,
  CreateAssetTypePayload,
} from '@/types/wiki'
import { assertPageAction, ensureOk } from '@/lib/storeAuthz'
import { apiFetch } from '@/lib/apiClient'
import { buildProductScopedPath, resolveProductScope } from '@/lib/productScopeApi'

export const useWikiStore = defineStore('wiki', () => {
  const assetTypes = ref<AssetType[]>([])
  const assets = ref<Asset[]>([])
  const selectedAsset = ref<Asset | null>(null)
  const revisionsByAsset = ref<Record<string, AssetRevision[]>>({})
  const revisionDiffByAsset = ref<Record<string, AssetRevisionDiff | null>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  function authToken() {
    return useAuthStore().token
  }

  // ============ ASSET TYPES ============

  async function fetchAssetTypes(product?: string) {
    const scope = resolveProductScope(product)
    if (!scope) {
      assetTypes.value = []
      return
    }
    try {
      assertPageAction('wiki', 'read', 'wiki assets')
      const res = await apiFetch(buildProductScopedPath(scope, '/wiki/types'), {
        token: authToken(),
      })
      await ensureOk(res, 'Failed to fetch wiki asset types')
      assetTypes.value = await res.json()
    } catch (e) {
      error.value = (e as Error).message
      assetTypes.value = []
    }
  }

  async function createAssetType(payload: CreateAssetTypePayload): Promise<AssetType | null> {
    try {
      assertPageAction('wiki', 'create', 'wiki asset types')
      const scope = resolveProductScope(payload.productId)
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, '/wiki/types'), {
        method: 'POST',
        token: authToken(),
        json: {
          ...payload,
          productId: scope.productId,
        },
      })
      await ensureOk(res, 'Failed to create wiki asset type')
      const created = await res.json()
      assetTypes.value.push(created)
      return created
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  // ============ ASSETS ============

  async function fetchAssets(product?: string, typeSlug?: string, search?: string) {
    assertPageAction('wiki', 'read', 'wiki assets')
    const scope = resolveProductScope(product)
    if (!scope) {
      assets.value = []
      return
    }
    loading.value = true
    error.value = null
    try {
      const params = new URLSearchParams()
      if (typeSlug) params.set('type', typeSlug)
      if (search) params.set('search', search)
      const res = await apiFetch(buildProductScopedPath(scope, '/wiki/assets'), {
        token: authToken(),
        query: Object.fromEntries(params.entries()),
      })
      await ensureOk(res, 'Failed to fetch wiki assets')
      assets.value = await res.json()
    } catch (e) {
      error.value = (e as Error).message
      assets.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchAsset(id: string): Promise<Asset | null> {
    try {
      assertPageAction('wiki', 'read', 'wiki assets')
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/wiki/assets/${id}`), { token: authToken() })
      await ensureOk(res, 'Failed to fetch wiki asset')
      const asset = await res.json()
      selectedAsset.value = asset
      return asset
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function fetchRevisions(assetId: string, limit = 50): Promise<AssetRevision[]> {
    try {
      assertPageAction('wiki', 'read', 'wiki revisions')
      const scope = resolveProductScope()
      if (!scope) {
        revisionsByAsset.value = {
          ...revisionsByAsset.value,
          [assetId]: [],
        }
        return []
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/wiki/assets/${assetId}/revisions`), {
        token: authToken(),
        query: { limit },
      })
      await ensureOk(res, 'Failed to fetch wiki revisions')
      const revisions = await res.json() as AssetRevision[]
      revisionsByAsset.value = {
        ...revisionsByAsset.value,
        [assetId]: revisions,
      }
      return revisions
    } catch (e) {
      error.value = (e as Error).message
      revisionsByAsset.value = {
        ...revisionsByAsset.value,
        [assetId]: [],
      }
      return []
    }
  }

  async function fetchRevisionDiff(
    assetId: string,
    revisionId: string,
    baseRevisionId?: string,
  ): Promise<AssetRevisionDiff | null> {
    try {
      assertPageAction('wiki', 'read', 'wiki revision diffs')
      const scope = resolveProductScope()
      if (!scope) {
        revisionDiffByAsset.value = {
          ...revisionDiffByAsset.value,
          [assetId]: null,
        }
        return null
      }
      const params = new URLSearchParams()
      if (baseRevisionId) params.set('baseRevisionId', baseRevisionId)
      const res = await apiFetch(buildProductScopedPath(scope, `/wiki/assets/${assetId}/revisions/${revisionId}/diff`), {
        token: authToken(),
        query: Object.fromEntries(params.entries()),
      })
      await ensureOk(res, 'Failed to fetch wiki revision diff')
      const diff = await res.json() as AssetRevisionDiff
      revisionDiffByAsset.value = {
        ...revisionDiffByAsset.value,
        [assetId]: diff,
      }
      return diff
    } catch (e) {
      error.value = (e as Error).message
      revisionDiffByAsset.value = {
        ...revisionDiffByAsset.value,
        [assetId]: null,
      }
      return null
    }
  }

  async function createAsset(payload: CreateAssetPayload): Promise<Asset | null> {
    try {
      assertPageAction('wiki', 'create', 'wiki assets')
      const scope = resolveProductScope(payload.productId)
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, '/wiki/assets'), {
        method: 'POST',
        token: authToken(),
        json: {
          ...payload,
          productId: scope.productId,
        },
      })
      await ensureOk(res, 'Failed to create wiki asset')
      const created = await res.json()
      assets.value.unshift(created)
      return created
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function updateAsset(id: string, payload: Partial<CreateAssetPayload>): Promise<Asset | null> {
    try {
      assertPageAction('wiki', 'edit', 'wiki assets')
      const scope = resolveProductScope((payload as { productId?: string | null }).productId)
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/wiki/assets/${id}`), {
        method: 'PUT',
        token: authToken(),
        json: payload,
      })
      await ensureOk(res, 'Failed to update wiki asset')
      const updated = await res.json()
      const idx = assets.value.findIndex(a => a.id === id)
      if (idx !== -1) assets.value[idx] = updated
      if (selectedAsset.value?.id === id) {
        selectedAsset.value = { ...selectedAsset.value, ...updated }
      }
      return updated
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function deleteAsset(id: string): Promise<boolean> {
    try {
      assertPageAction('wiki', 'delete', 'wiki assets')
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return false
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/wiki/assets/${id}`), {
        method: 'DELETE',
        token: authToken(),
      })
      await ensureOk(res, 'Failed to delete wiki asset')
      assets.value = assets.value.filter(a => a.id !== id)
      if (selectedAsset.value?.id === id) selectedAsset.value = null
      delete revisionsByAsset.value[id]
      delete revisionDiffByAsset.value[id]
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  async function restoreRevision(
    assetId: string,
    revisionId: string,
    changeSummary?: string,
  ): Promise<Asset | null> {
    try {
      assertPageAction('wiki', 'edit', 'wiki assets')
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/wiki/assets/${assetId}/revisions/${revisionId}/restore`), {
        method: 'POST',
        token: authToken(),
        json: {
          changeSummary,
        },
      })
      await ensureOk(res, 'Failed to restore wiki revision')
      const payload = await res.json() as { asset: Asset }
      const restored = payload.asset
      const idx = assets.value.findIndex((item) => item.id === assetId)
      if (idx !== -1) assets.value[idx] = restored
      if (selectedAsset.value?.id === assetId) selectedAsset.value = restored
      await fetchRevisions(assetId)
      return restored
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  // ============ RELATIONS ============

  async function addRelation(assetId: string, targetAssetId: string, relationType: string = 'related_to') {
    try {
      assertPageAction('wiki', 'create', 'wiki relations')
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/wiki/assets/${assetId}/relations`), {
        method: 'POST',
        token: authToken(),
        json: { targetAssetId, relationType },
      })
      await ensureOk(res, 'Failed to add wiki relation')
      await fetchAsset(assetId)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function removeRelation(assetId: string, relationId: string) {
    try {
      assertPageAction('wiki', 'delete', 'wiki relations')
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/wiki/assets/${assetId}/relations/${relationId}`), {
        method: 'DELETE',
        token: authToken(),
      })
      await ensureOk(res, 'Failed to remove wiki relation')
      await fetchAsset(assetId)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  return {
    assetTypes, assets, selectedAsset, revisionsByAsset, revisionDiffByAsset, loading, error,
    fetchAssetTypes, createAssetType,
    fetchAssets, fetchAsset, fetchRevisions, fetchRevisionDiff, createAsset, updateAsset, deleteAsset, restoreRevision,
    addRelation, removeRelation,
  }
})
