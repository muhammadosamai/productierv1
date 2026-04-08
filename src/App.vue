<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Toaster } from 'vue-sonner'
import MainSidebar from '@/components/layout/MainSidebar.vue'
import ProductSidebar from '@/components/layout/ProductSidebar.vue'
import SubProductSidebar from '@/components/layout/SubProductSidebar.vue'
import MainHeader from '@/components/layout/MainHeader.vue'
import { useProductStore } from '@/stores/products'

const route = useRoute()
const productStore = useProductStore()

// Routes that belong to the "products" section and show the full product sidebars
const productRoutes = new Set([
  'stories', 'tasks-list', 'initiatives', 'initiative',
  'deliveries', 'delivery', 'team', 'metrics', 'wiki',
  'releases', 'release', 'test-cycles', 'test-cycle', 'issues', 'feedbacks', 'feature-requests', 'settings',
])

const showProductSidebars = computed(() => {
  const name = route.name as string
  return productRoutes.has(name)
})

console.log('fix: 2')
</script>

<template>
  <!-- Guest layout (auth pages — no sidebars) -->
  <router-view v-if="route.meta.guest" />

  <!-- App layout (authenticated — full layout with sidebars) -->
  <div v-else class="flex h-screen w-screen overflow-hidden font-sans">
    <!-- Main Sidebar (dark icon bar) — always visible -->
    <MainSidebar />

    <!-- Product Sidebar (product switcher) — only in products section -->
    <ProductSidebar v-if="showProductSidebars" />

    <!-- Sub Product Sidebar (navigation tree) — only in products section -->
    <SubProductSidebar v-if="showProductSidebars && !productStore.subSidebarCollapsed" />

    <!-- Main Content Area -->
    <div class="flex flex-1 flex-col min-w-0">
      <!-- Header -->
      <MainHeader />

      <!-- Body -->
      <main class="flex-1 overflow-auto" style="background-color: #F8FAFF">
        <router-view />
      </main>
    </div>
  </div>

  <Toaster position="top-center" :rich-colors="true" :close-button="true" />
</template>
