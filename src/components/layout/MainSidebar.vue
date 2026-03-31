<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRolesStore } from '@/stores/roles'
import { useNavigationRegistry } from '@/registry/navigation'
import { iconForMainToken } from '@/registry/navigationUi'
import type { MainSidebarNavigationEntry } from '@/types/metadata'

const route = useRoute()
const router = useRouter()
const rolesStore = useRolesStore()
const navigationRegistry = useNavigationRegistry()

const mainItems = computed(() =>
  navigationRegistry.mainSidebarItems.value
    .filter((item) => item.placement === 'main')
    .sort((a, b) => a.order - b.order)
)

const footerItems = computed(() =>
  navigationRegistry.mainSidebarItems.value
    .filter((item) => item.placement === 'footer')
    .sort((a, b) => a.order - b.order)
)

const activeItemId = computed(() => {
  const direct = navigationRegistry.resolveMainSidebarItem(route.path)
  if (direct) return direct.id
  if (navigationRegistry.isProductShellPath(route.path)) return 'products'
  return null
})

function canAccessItem(item: MainSidebarNavigationEntry): boolean {
  return rolesStore.canAccess(item.pageKey)
}

function isActive(item: MainSidebarNavigationEntry): boolean {
  return activeItemId.value === item.id
}

function iconForItem(item: MainSidebarNavigationEntry) {
  return iconForMainToken(item.iconToken)
}

function navigateTo(item: MainSidebarNavigationEntry) {
  router.push(item.route)
}
</script>

<template>
  <aside class="flex w-[65px] flex-col items-center py-4" style="background-color: rgb(32 36 81)">
    <div class="flex flex-col items-center mb-2">
      <div class="flex items-center justify-center w-10 h-10">
        <img src="/logo.png" alt="Productier" class="w-9 h-9 rounded-full" />
      </div>
    </div>

    <div class="w-6 border-t border-white/30 my-4 opacity-30"></div>

    <div class="flex flex-col items-center gap-7 flex-1">
      <button
        v-for="item in mainItems"
        :key="item.id"
        v-show="canAccessItem(item)"
        class="flex items-center justify-center w-10 h-10 rounded-xl text-white transition-colors"
        :class="isActive(item) ? 'bg-white/15' : 'hover:bg-white/10'"
        @click="navigateTo(item)"
      >
        <component :is="iconForItem(item)" :size="20" />
      </button>
    </div>

    <div class="flex flex-col items-center">
      <button
        v-for="item in footerItems"
        :key="item.id"
        v-show="canAccessItem(item)"
        class="flex items-center justify-center w-10 h-10 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        @click="navigateTo(item)"
      >
        <component :is="iconForItem(item)" :size="20" />
      </button>
    </div>
  </aside>
</template>
