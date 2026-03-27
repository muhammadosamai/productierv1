import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import type { Favorite, FavoriteEntityType } from '@/types/favorite'

export const useFavoritesStore = defineStore('favorites', () => {
  const authStore = useAuthStore()
  const favorites = ref<Favorite[]>([])
  const loading = ref(false)

  function authHeaders() {
    return { Authorization: `Bearer ${authStore.token}` }
  }

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
    loading.value = true
    try {
      const res = await fetch(`/api/favorites?productId=${encodeURIComponent(productId)}`, {
        headers: authHeaders(),
      })
      if (res.ok) {
        favorites.value = await res.json()
      }
    } catch {
      // silent
    } finally {
      loading.value = false
    }
  }

  async function toggleFavorite(entityType: FavoriteEntityType, entityId: string, productId: string) {
    const wasFavorited = isFavorited(entityId)

    // Optimistic update
    if (wasFavorited) {
      favorites.value = favorites.value.filter(f => !(f.entityType === entityType && f.entityId === entityId))
    } else {
      favorites.value.push({
        id: 'temp-' + entityId,
        userId: authStore.user?.id || '',
        entityType,
        entityId,
        productId,
        createdAt: new Date().toISOString(),
      })
    }

    try {
      if (wasFavorited) {
        await fetch(`/api/favorites/${entityType}/${entityId}`, {
          method: 'DELETE',
          headers: authHeaders(),
        })
      } else {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityType, entityId, productId }),
        })
        if (res.ok) {
          const created = await res.json()
          // Replace temp with real record
          const idx = favorites.value.findIndex(f => f.entityId === entityId && f.entityType === entityType)
          if (idx !== -1) favorites.value[idx] = created
        }
      }
    } catch {
      // Rollback on error
      if (wasFavorited) {
        favorites.value.push({
          id: 'rollback-' + entityId,
          userId: authStore.user?.id || '',
          entityType,
          entityId,
          productId,
          createdAt: new Date().toISOString(),
        })
      } else {
        favorites.value = favorites.value.filter(f => !(f.entityType === entityType && f.entityId === entityId))
      }
    }
  }

  return { favorites, loading, favoriteIds, isFavorited, getFavoritesByType, fetchFavorites, toggleFavorite }
})
