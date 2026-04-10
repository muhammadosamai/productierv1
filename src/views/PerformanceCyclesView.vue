<script setup lang="ts">
import { Gauge } from 'lucide-vue-next'
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <div class="bg-white px-8 py-5 border-b border-gray-100">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
          <Gauge :size="18" class="text-[#4857FE]" />
        </div>
        <div>
          <h1 class="text-xl font-semibold text-gray-900">Performance Cycles</h1>
          <p class="text-sm text-gray-400 mt-0.5">Track and manage performance validation cycles</p>
        </div>
      </div>
    </div>

    <div class="flex-1 flex items-center justify-center px-8">
      <div class="text-center">
        <div class="w-16 h-16 rounded-2xl bg-[#4857FE]/5 flex items-center justify-center mx-auto mb-4">
          <Gauge :size="28" class="text-[#4857FE]/40" />
        </div>
        <h2 class="text-lg font-semibold text-gray-700">Coming soon</h2>
        <p class="text-sm text-gray-400 mt-1 max-w-sm">
          Performance cycle planning, tracking, and reporting will appear here.
        </p>
      </div>
    </div>
  </div>
</template>
