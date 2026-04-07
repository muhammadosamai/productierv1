<script setup lang="ts">
import { Search, Settings, Moon, HelpCircle, Bell, ChevronDown, LogOut, BookText, ListTodo, Bug, Target, BookOpen } from 'lucide-vue-next'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'
import type { SearchQuickItem, SearchQuickResponse } from '@/types/search'
import { useRouter } from 'vue-router'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const authStore = useAuthStore()
const productStore = useProductStore()

const router = useRouter()

const searchQuery = ref('')
const suggestions = ref<SearchQuickResponse['groups'] | null>(null)
const debounceTimer = ref<number | null>(null)
const isLoadingSuggestions = ref(false)
const showSuggestions = ref(false)
const searchContainerRef = ref<HTMLElement | null>(null)

const suggestionSections = computed(() => {
  if (!suggestions.value) return []
  return [
    { label: 'Stories', items: suggestions.value.stories },
    { label: 'Tasks', items: suggestions.value.tasks },
    { label: 'Issues', items: suggestions.value.issues },
    { label: 'Initiatives', items: suggestions.value.initiatives },
    { label: 'Wiki', items: suggestions.value.wikiAssets },
  ].filter(section => section.items.length > 0)
})

const hasSuggestions = computed(() => suggestionSections.value.length > 0)

function handleSearchSubmit() {
  if (!searchQuery.value) return

  const firstItem = suggestionSections.value[0]?.items[0]
  if (firstItem) {
    handleSuggestionClick(firstItem)
    return
  }

  showSuggestions.value = false
}

async function handleSuggestionClick(item: SearchQuickItem) {
  if (item.product) {
    let productIndex = productStore.products.findIndex(p => p.name === item.product)
    if (productIndex < 0) {
      await productStore.fetchProducts()
      productIndex = productStore.products.findIndex(p => p.name === item.product)
    }
    if (productIndex >= 0) {
      productStore.selectProduct(productIndex)
    }
  }

  showSuggestions.value = false
  router.push(item.href)
}

function handleSearchFocus() {
  if (searchQuery.value.trim()) {
    showSuggestions.value = true
  }
}

function formatStatusLabel(status?: string | null) {
  if (!status) return ''
  return status
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatUpdatedLabel(updatedAt?: string | null) {
  if (!updatedAt) return ''
  const timestamp = new Date(updatedAt)
  if (Number.isNaN(timestamp.getTime())) return ''

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfToday.getDate() - 1)

  if (timestamp >= startOfToday) {
    const minutesDiff = Math.max(0, Math.floor((now.getTime() - timestamp.getTime()) / (1000 * 60)))
    if (minutesDiff < 1) return 'Just now'
    if (minutesDiff < 60) return `${minutesDiff}m ago`
    const hoursDiff = Math.floor(minutesDiff / 60)
    return `${hoursDiff}h ago`
  }

  if (timestamp >= startOfYesterday) {
    return 'Yesterday'
  }

  return timestamp.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function getEntityIcon(entityType: SearchQuickItem['entityType']) {
  if (entityType === 'story') return BookText
  if (entityType === 'task') return ListTodo
  if (entityType === 'issue') return Bug
  if (entityType === 'initiative') return Target
  return BookOpen
}

const entityIconTheme: Record<SearchQuickItem['entityType'], string> = {
  story: 'bg-blue-50 text-blue-600',
  task: 'bg-emerald-50 text-emerald-600',
  issue: 'bg-red-50 text-red-600',
  initiative: 'bg-violet-50 text-violet-600',
  wiki: 'bg-amber-50 text-amber-600',
}

const iconBadgeBaseClass = 'inline-flex items-center justify-center rounded-md p-1 mr-1 shrink-0'

function getEntityIconBadgeClass(entityType: SearchQuickItem['entityType']) {
  return `${iconBadgeBaseClass} ${entityIconTheme[entityType]}`
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as Node | null
  if (!searchContainerRef.value || !target) return
  if (!searchContainerRef.value.contains(target)) {
    showSuggestions.value = false
  }
}

// Debounced live suggestions to /api/search/quick?q=...
watch(searchQuery, (val) => {
  if (debounceTimer.value) window.clearTimeout(debounceTimer.value)
  if (!val) {
    suggestions.value = null
    isLoadingSuggestions.value = false
    showSuggestions.value = false
    return
  }

  showSuggestions.value = true
  isLoadingSuggestions.value = true

  debounceTimer.value = window.setTimeout(async () => {
    try {
      const authStore = useAuthStore()
      const params = new URLSearchParams({ q: val })
      const headers: Record<string, string> = {}
      if (authStore.token) headers['Authorization'] = `Bearer ${authStore.token}`

      const res = await fetch(`/api/search/quick?${params.toString()}`, { headers })
      if (!res.ok) {
        console.warn('Search quick failed', res.status)
        suggestions.value = null
        isLoadingSuggestions.value = false
        return
      }
      const data = await res.json() as SearchQuickResponse
      suggestions.value = data.groups
      isLoadingSuggestions.value = false
      // keep silent UI-wise; results available in `suggestions` for future use
    } catch (err) {
      console.error('Search quick error', err)
      suggestions.value = null
      isLoadingSuggestions.value = false
    }
  }, 300)
})

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
})

const userInitials = computed(() => {
  if (!authStore.user?.name) return '?'
  return authStore.user.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

function goToSettings(tab?: string) {
  if (tab) {
    router.push({ path: '/settings', query: { tab } })
  } else {
    router.push('/settings')
  }
}

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <header class="flex items-center h-[64px] px-4 bg-white border-b border-gray-100 shrink-0">
    <!-- Search bar -->
    <div class="flex items-center flex-1">
      <div ref="searchContainerRef" class="relative w-[320px]">
        <div class="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
          <Search :size="16" class="text-gray-400" />
          <input
            v-model="searchQuery"
            @focus="handleSearchFocus"
            @keyup.enter="handleSearchSubmit"
            placeholder="Search any files..."
            aria-label="Search"
            class="ml-2 text-sm bg-transparent placeholder-gray-400 outline-none flex-1"
          />
          <div class="ml-auto flex items-center gap-1 text-xs text-gray-400 bg-white rounded-md px-1.5 py-0.5 border border-gray-200">
            <span class="text-[11px]">&#8984;</span>
            <span class="text-[11px] font-medium">S</span>
          </div>
        </div>

        <div
          v-if="showSuggestions"
          class="absolute top-[calc(100%+8px)] left-0 z-50 w-[156%] rounded-xl border border-gray-100 bg-white shadow-sm max-h-[360px] overflow-y-auto"
        >
          <div v-if="isLoadingSuggestions" class="px-3 py-2 text-xs text-gray-500">
            Searching...
          </div>

          <div v-else-if="!hasSuggestions" class="px-3 py-2 text-xs text-gray-500">
            No results found
          </div>

          <template v-else>
            <div v-for="section in suggestionSections" :key="section.label" class="py-1">
              <div class="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {{ section.label }}
              </div>
              <button
                v-for="item in section.items"
                :key="`${section.label}-${item.id}`"
                class="w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                @click="handleSuggestionClick(item)"
              >
                <div class="text-sm text-gray-800 truncate flex items-center gap-1.5">
                  <span :class="getEntityIconBadgeClass(item.entityType)">
                    <component :is="getEntityIcon(item.entityType)" :size="12" />
                  </span>
                  <!-- <span v-if="item.publicId" class="font-medium text-gray-500 mr-1">{{ item.publicId }}</span> -->
                  <span>{{ item.title }}</span>
                </div>
                <div class="text-[11px] text-gray-400 truncate">
                  {{ item.product }}
                  <span v-if="item.status"> • {{ formatStatusLabel(item.status) }}</span>
                  <span v-if="item.updatedAt"> • {{ formatUpdatedLabel(item.updatedAt) }}</span>
                </div>
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Right side actions -->
    <div class="flex items-center gap-2">
      <!-- Settings -->
      <button
        class="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        @click="goToSettings(authStore.user?.role === 'super_admin' ? 'roles' : undefined)"
      >
        <Settings :size="18" />
      </button>

      <!-- Dark mode toggle -->
      <div class="relative group">
        <button class="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
          <Moon :size="18" />
        </button>
        <span class="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          Coming soon
        </span>
      </div>

      <!-- Divider -->
      <div class="w-px h-6 bg-gray-200 mx-1"></div>

      <!-- Help -->
      <div class="relative group">
        <button class="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
          <HelpCircle :size="18" />
        </button>
        <span class="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          Coming soon
        </span>
      </div>

      <!-- Notifications -->
      <div class="relative group">
        <button class="relative flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
          <Bell :size="18" />
          <span class="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        <span class="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          Coming soon
        </span>
      </div>

      <!-- Divider -->
      <div class="w-px h-6 bg-gray-200 mx-1"></div>

      <!-- User profile dropdown -->
      <Popover>
        <PopoverTrigger as-child>
          <button class="flex items-center gap-2 pl-1 rounded-lg hover:bg-gray-50 px-2 py-1.5 transition-colors">
            <div class="w-8 h-8 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-xs font-medium overflow-hidden shrink-0">
              <UploadAssetImg
                v-if="authStore.user?.avatar"
                :src="authStore.user.avatar"
                class="w-8 h-8 rounded-full object-cover"
                alt="User avatar"
              />
              <span v-else>{{ userInitials }}</span>
            </div>
            <div class="flex flex-col text-left">
              <span class="text-sm font-medium text-gray-800 leading-tight">{{ authStore.user?.name || 'User' }}</span>
              <span class="text-[11px] text-gray-400 leading-tight">{{ authStore.user?.email || '' }}</span>
            </div>
            <ChevronDown :size="14" class="text-gray-400 ml-1" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" :side-offset="8" class="w-[220px] p-1.5">
          <!-- User info header -->
          <div class="flex items-center gap-2.5 px-2 py-2 mb-1">
            <div class="w-9 h-9 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-xs font-medium overflow-hidden shrink-0">
              <UploadAssetImg
                v-if="authStore.user?.avatar"
                :src="authStore.user.avatar"
                class="w-9 h-9 rounded-full object-cover"
                alt="User avatar"
              />
              <span v-else>{{ userInitials }}</span>
            </div>
            <div class="flex flex-col min-w-0">
              <span class="text-sm font-semibold text-gray-900 leading-tight truncate">{{ authStore.user?.name }}</span>
              <span class="text-[11px] text-gray-400 leading-tight truncate">{{ authStore.user?.email }}</span>
            </div>
          </div>

          <div class="border-t border-gray-100 my-1"></div>

          <!-- Settings -->
          <button
            class="flex items-center gap-2.5 w-full px-2 py-2 text-sm text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            @click="goToSettings()"
          >
            <Settings :size="15" class="text-gray-400" />
            Settings
          </button>

          <!-- Logout -->
          <button
            class="flex items-center gap-2.5 w-full px-2 py-2 text-sm text-red-600 rounded-md hover:bg-red-50 transition-colors"
            @click="handleLogout"
          >
            <LogOut :size="15" class="text-red-400" />
            Log out
          </button>
        </PopoverContent>
      </Popover>
    </div>
  </header>
</template>
