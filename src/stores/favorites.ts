import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import type { Favorite, FavoriteEntityType } from '@/types/favorite'
import { assertPageAction, ensureOk } from '@/lib/storeAuthz'
import { apiFetch } from '@/lib/apiClient'
import { buildProductScopedPath, resolveProductScope } from '@/lib/productScopeApi'

export const useFavoritesStore = defineStore('favorites', () => {
  const authStore = useAuthStore()
  const favorites = ref<Favorite[]>([])
  const loading = ref(false)

  const favoriteIds = computed(() => new Set(favorites.value.map(f => f.entityId)))

  function isFavorited(entityId: string): boolean {
    return favoriteIds.value.has(entityId)
  }

  function getFavoritesByType(entityType: FavoriteEntityType): Set<string> {
    return new Set(
      favorites.value
        .filter(f => f.entityType === entityType)
        .map(f => f.entityId)
    )
  }

  async function fetchFavorites(productId: string) {
    assertPageAction('home', 'read', 'favorites')
    const scope = resolveProductScope(productId)
    if (!scope) {
      favorites.value = []
      return
    }
    loading.value = true
    try {
      const res = await apiFetch(buildProductScopedPath(scope, '/favorites'), {
        token: authStore.token,
      })
      await ensureOk(res, 'Failed to fetch favorites')
      favorites.value = await res.json()
    } catch {
      // silent
    } finally {
      loading.value = false
    }
  }

  async function toggleFavorite(entityType: FavoriteEntityType, entityId: string, productId: string) {
    const scope = resolveProductScope(productId)
    if (!scope) return

    const wasFavorited = isFavorited(entityId)
    assertPageAction('home', wasFavorited ? 'delete' : 'create', 'favorites')

    // Optimistic update
    if (wasFavorited) {
      favorites.value = favorites.value.filter(f => !(f.entityType === entityType && f.entityId === entityId))
    } else {
      favorites.value.push({
        id: 'temp-' + entityId,
        userId: authStore.user?.id || '',
        entityType,
        entityId,
        productId: scope.productId,
        createdAt: new Date().toISOString(),
      })
    }

    try {
      if (wasFavorited) {
        const res = await apiFetch(buildProductScopedPath(scope, `/favorites/${entityType}/${entityId}`), {
          method: 'DELETE',
          token: authStore.token,
        })
        await ensureOk(res, 'Failed to remove favorite')
      } else {
        const res = await apiFetch(buildProductScopedPath(scope, '/favorites'), {
          method: 'POST',
          token: authStore.token,
          json: { entityType, entityId, productId: scope.productId },
        })
        await ensureOk(res, 'Failed to save favorite')
        const created = await res.json()
        // Replace temp with real record
        const idx = favorites.value.findIndex(f => f.entityId === entityId && f.entityType === entityType)
        if (idx !== -1) favorites.value[idx] = created
      }
    } catch {
      // Rollback on error
      if (wasFavorited) {
        favorites.value.push({
          id: 'rollback-' + entityId,
          userId: authStore.user?.id || '',
          entityType,
          entityId,
          productId: scope.productId,
          createdAt: new Date().toISOString(),
        })
      } else {
        favorites.value = favorites.value.filter(f => !(f.entityType === entityType && f.entityId === entityId))
      }
    }
  }

  return { favorites, loading, favoriteIds, isFavorited, getFavoritesByType, fetchFavorites, toggleFavorite }
})
