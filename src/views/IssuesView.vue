<script setup lang="ts">
import { Bug } from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'

const productStore = useProductStore()
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <!-- Page Header -->
    <div class="bg-white px-8 py-5 border-b border-gray-100">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
          <Bug :size="18" class="text-[#4857FE]" />
        </div>
        <div>
          <h1 class="text-xl font-semibold text-gray-900">Issues</h1>
          <p class="text-sm text-gray-400 mt-0.5">{{ productStore.activeProduct.name }}</p>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div class="flex-1 flex flex-col items-center justify-center">
      <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Bug :size="24" class="text-gray-400" />
      </div>
      <p class="text-gray-500 text-sm font-medium mb-1">Issues coming soon</p>
      <p class="text-gray-400 text-xs">Track and resolve product issues</p>
    </div>
  </div>
</template>
