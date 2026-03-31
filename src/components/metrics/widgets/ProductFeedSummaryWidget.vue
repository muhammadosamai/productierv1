<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useProductStore } from '@/stores/products'
import { useBacklogStore } from '@/stores/backlog'
import { useInitiativesStore } from '@/stores/initiatives'

const productStore = useProductStore()
const backlogStore = useBacklogStore()
const initiativesStore = useInitiativesStore()

async function loadStoriesForFeed(productId: string) {
  await backlogStore.fetchStories(productId, { limit: 80 })
  let safetyCounter = 0
  while (backlogStore.hasMore && backlogStore.nextCursor && safetyCounter < 10) {
    await backlogStore.fetchStories(productId, {
      limit: 80,
      cursor: backlogStore.nextCursor,
      append: true,
    })
    safetyCounter += 1
  }
}

async function loadSummary() {
  const productId = productStore.activeProduct.id || ''
  if (!productId) return
  await Promise.all([
    loadStoriesForFeed(productId),
    initiativesStore.fetchInitiatives(productId),
  ])
}

const totalStories = computed(() => backlogStore.stories.length)
const totalInitiatives = computed(() => initiativesStore.initiatives.length)
const inProgressStories = computed(() => backlogStore.stories.filter((item) => item.status === 'in_progress').length)
const completedStories = computed(() => backlogStore.stories.filter((item) => item.status === 'completed').length)

const summaryError = computed(() => backlogStore.error || initiativesStore.error || null)

onMounted(() => {
  loadSummary()
})

watch(() => productStore.activeProduct.id, () => {
  loadSummary()
})
</script>

<template>
  <div class="space-y-4 p-4 sm:p-5">
    <p v-if="summaryError" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      {{ summaryError }}
    </p>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-xl border border-gray-100 bg-white p-4">
        <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Total Stories</p>
        <p class="mt-2 text-2xl font-semibold text-gray-900">{{ totalStories }}</p>
      </div>
      <div class="rounded-xl border border-gray-100 bg-white p-4">
        <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Initiatives</p>
        <p class="mt-2 text-2xl font-semibold text-gray-900">{{ totalInitiatives }}</p>
      </div>
      <div class="rounded-xl border border-gray-100 bg-white p-4">
        <p class="text-xs font-medium uppercase tracking-wider text-gray-400">In Progress</p>
        <p class="mt-2 text-2xl font-semibold text-blue-600">{{ inProgressStories }}</p>
      </div>
      <div class="rounded-xl border border-gray-100 bg-white p-4">
        <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Completed</p>
        <p class="mt-2 text-2xl font-semibold text-green-600">{{ completedStories }}</p>
      </div>
    </div>
  </div>
</template>
