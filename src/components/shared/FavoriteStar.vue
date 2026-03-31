<script setup lang="ts">
import { Star } from 'lucide-vue-next'
import { useFavoritesStore } from '@/stores/favorites'
import type { FavoriteEntityType } from '@/types/favorite'

const props = defineProps<{
  entityType: FavoriteEntityType
  entityId: string
  productId: string
}>()

const favoritesStore = useFavoritesStore()

function toggle(e: Event) {
  e.stopPropagation()
  favoritesStore.toggleFavorite(props.entityType, props.entityId, props.productId)
}
</script>

<template>
  <button
    class="p-0.5 transition-all cursor-pointer shrink-0"
    :class="favoritesStore.isFavorited(entityId)
      ? 'opacity-100'
      : 'opacity-0 group-hover:opacity-100'"
    :title="favoritesStore.isFavorited(entityId) ? 'Remove from favorites' : 'Add to favorites'"
    @click="toggle"
  >
    <Star
      :size="14"
      :class="favoritesStore.isFavorited(entityId)
        ? 'fill-amber-400 text-amber-400'
        : 'text-gray-300 hover:text-amber-300'"
    />
  </button>
</template>
