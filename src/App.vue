<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import MainSidebar from '@/components/layout/MainSidebar.vue'
import ProductSidebar from '@/components/layout/ProductSidebar.vue'
import SubProductSidebar from '@/components/layout/SubProductSidebar.vue'
import MainHeader from '@/components/layout/MainHeader.vue'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { useOnboardingStore } from '@/stores/onboarding'
import { useRolesStore } from '@/stores/roles'
import { useNavigationRegistry } from '@/registry/navigation'
import { useMetadataStore } from '@/stores/metadata'

const route = useRoute()
const productStore = useProductStore()
const authStore = useAuthStore()
const onboardingStore = useOnboardingStore()
const rolesStore = useRolesStore()
const metadataStore = useMetadataStore()
const navigationRegistry = useNavigationRegistry()

const showProductSidebars = computed(() => {
  return navigationRegistry.isProductShellPath(route.path)
})

const isShelllessRoute = computed(() => Boolean(route.meta.guest) || Boolean(route.meta.standalone))

watch(() => authStore.isAuthenticated, (isAuth) => {
  if (isAuth) {
    metadataStore.ensureLoaded(['routes', 'navigation', 'enums', 'settingsKeys'])
  } else {
    metadataStore.reset()
    rolesStore.reset()
  }
}, { immediate: true })

const canLoadProducts = computed(() => {
  if (!authStore.isAuthenticated) return false
  if (authStore.user?.role === 'super_admin') return true
  return rolesStore.loaded && rolesStore.canAccess('home')
})

watch([canLoadProducts, () => onboardingStore.activeOrganizationId], ([allowed, activeOrganizationId]) => {
  if (!allowed || !activeOrganizationId) return
  productStore.fetchProducts()
}, { immediate: true })
</script>

<template>
  <!-- Guest layout (auth pages — no sidebars) -->
  <router-view v-if="isShelllessRoute" />

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
</template>
