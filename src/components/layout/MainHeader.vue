<script setup lang="ts">
import { Search, Settings, Moon, HelpCircle, Bell, ChevronDown, LogOut } from 'lucide-vue-next'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { computed } from 'vue'

const authStore = useAuthStore()
const router = useRouter()

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
      <div class="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 w-[320px] border border-gray-100">
        <Search :size="16" class="text-gray-400" />
        <span class="text-sm text-gray-400">Search any files...</span>
        <div class="ml-auto flex items-center gap-1 text-xs text-gray-400 bg-white rounded-md px-1.5 py-0.5 border border-gray-200">
          <span class="text-[11px]">&#8984;</span>
          <span class="text-[11px] font-medium">S</span>
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
      <button class="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
        <Moon :size="18" />
      </button>

      <!-- Divider -->
      <div class="w-px h-6 bg-gray-200 mx-1"></div>

      <!-- Help -->
      <button class="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
        <HelpCircle :size="18" />
      </button>

      <!-- Notifications -->
      <button class="relative flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
        <Bell :size="18" />
        <span class="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
      </button>

      <!-- Divider -->
      <div class="w-px h-6 bg-gray-200 mx-1"></div>

      <!-- User profile dropdown -->
      <Popover>
        <PopoverTrigger as-child>
          <button class="flex items-center gap-2 pl-1 rounded-lg hover:bg-gray-50 px-2 py-1.5 transition-colors">
            <div class="w-8 h-8 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-xs font-medium overflow-hidden shrink-0">
              <img
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
              <img
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
