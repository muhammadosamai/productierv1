<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useInitiativesStore } from '@/stores/initiatives'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import RichTextEditor from '@/components/ui/RichTextEditor.vue'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Loader2, X } from 'lucide-vue-next'
import type { InitiativeStatus, InitiativePriority } from '@/types/initiative'

interface UserResult {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
}

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  created: [id: string]
}>()

const initiativesStore = useInitiativesStore()
const productStore = useProductStore()
const authStore = useAuthStore()

const title = ref('')
const description = ref('')
const status = ref<InitiativeStatus>('planning')
const dateRange = ref<{ start: string | null; end: string | null }>({ start: null, end: null })
const leader = ref('')
const leaderAvatar = ref<string | null>(null)
const priority = ref<InitiativePriority>('medium')
const submitting = ref(false)

// Leader search
const leaderSearchQuery = ref('')
const leaderSearchResults = ref<UserResult[]>([])
const leaderSearchLoading = ref(false)
const selectedLeaderIndex = ref(-1)
const leaderInputRef = ref<HTMLInputElement | null>(null)
let leaderSearchTimeout: ReturnType<typeof setTimeout> | null = null

async function searchUsers(query: string) {
  leaderSearchLoading.value = true
  try {
    const res = await fetch(`/api/auth/users?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      leaderSearchResults.value = await res.json()
    }
  } catch {
    leaderSearchResults.value = []
  } finally {
    leaderSearchLoading.value = false
  }
}

function onLeaderInput() {
  selectedLeaderIndex.value = -1
  if (leaderSearchTimeout) clearTimeout(leaderSearchTimeout)
  leaderSearchTimeout = setTimeout(() => {
    searchUsers(leaderSearchQuery.value)
  }, 200)
}

function selectLeader(user: UserResult) {
  leader.value = user.name
  leaderAvatar.value = user.avatar
  leaderSearchQuery.value = ''
  leaderSearchResults.value = []
}

function clearLeader() {
  leader.value = ''
  leaderAvatar.value = null
  leaderSearchQuery.value = ''
  leaderSearchResults.value = []
  nextTick(() => leaderInputRef.value?.focus())
}

function onLeaderKeydown(e: KeyboardEvent) {
  const results = leaderSearchResults.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedLeaderIndex.value = Math.min(selectedLeaderIndex.value + 1, results.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedLeaderIndex.value = Math.max(selectedLeaderIndex.value - 1, -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (selectedLeaderIndex.value >= 0 && results[selectedLeaderIndex.value]) {
      selectLeader(results[selectedLeaderIndex.value]!)
    }
  } else if (e.key === 'Escape') {
    leaderSearchResults.value = []
  }
}

function onLeaderFocus() {
  if (!leader.value) {
    searchUsers(leaderSearchQuery.value)
  }
}

const submitted = ref(false)

function resetForm() {
  title.value = ''
  description.value = ''
  status.value = 'planning'
  dateRange.value = { start: null, end: null }
  leader.value = ''
  leaderAvatar.value = null
  leaderSearchQuery.value = ''
  leaderSearchResults.value = []
  priority.value = 'medium'
}

// Only reset form after successful submission
watch(open, (val) => {
  if (!val && submitted.value) {
    resetForm()
    submitted.value = false
  }
})

async function handleSubmit() {
  if (!title.value.trim()) return
  const activeProduct = productStore.activeProduct
  if (!activeProduct) return
  submitting.value = true
  const created = await initiativesStore.createInitiative({
    title: title.value.trim(),
    description: description.value.trim() || undefined,
    status: status.value,
    periodStart: dateRange.value.start || undefined,
    periodEnd: dateRange.value.end || undefined,
    leader: leader.value.trim() || undefined,
    leaderAvatar: leaderAvatar.value || undefined,
    priority: priority.value,
    product: activeProduct.name,
  })
  submitting.value = false
  submitted.value = true
  if (created) {
    emit('created', created.id)
  }
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[520px] !overflow-visible">
      <DialogHeader>
        <DialogTitle>Create Initiative</DialogTitle>
        <DialogDescription>Define a new initiative for your product.</DialogDescription>
      </DialogHeader>

      <button type="button" @click="resetForm" title="Clear form" class="absolute top-4 right-12 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden text-muted-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
      </button>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <!-- Title -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Title *</label>
          <Input
            v-model="title"
            placeholder="e.g. Q2 User Onboarding Revamp"
            autofocus
          />
        </div>

        <!-- Description -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <RichTextEditor
            v-model="description"
            placeholder="Describe the initiative goals and scope..."
          />
        </div>

        <!-- Status & Priority row -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Status</label>
            <Select v-model="status">
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planning">
                  <span class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#fdab3d]"></span>
                    Planning
                  </span>
                </SelectItem>
                <SelectItem value="active">
                  <span class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#00c875]"></span>
                    Active
                  </span>
                </SelectItem>
                <SelectItem value="paused">
                  <span class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#e2445c]"></span>
                    Paused
                  </span>
                </SelectItem>
                <SelectItem value="completed">
                  <span class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#c4c4c4]"></span>
                    Completed
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Priority</label>
            <Select v-model="priority">
              <SelectTrigger>
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <!-- Period (date range) -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Period</label>
          <DateRangePicker v-model="dateRange" />
        </div>

        <!-- Leader -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Leader</label>

          <!-- Selected leader display -->
          <div v-if="leader" class="flex items-center gap-2.5 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
            <div class="w-7 h-7 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-medium overflow-hidden shrink-0">
              <UploadAssetImg
                v-if="leaderAvatar"
                :src="leaderAvatar"
                class="w-7 h-7 rounded-full object-cover"
                :alt="leader"
              />
              <span v-else>{{ leader.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) }}</span>
            </div>
            <span class="text-sm font-medium text-gray-900 flex-1 truncate">{{ leader }}</span>
            <button type="button" class="text-gray-400 hover:text-gray-600 shrink-0" @click="clearLeader">
              <X :size="14" />
            </button>
          </div>

          <!-- Leader search input -->
          <div v-else class="relative">
            <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 bg-white">
              <Search :size="14" class="text-gray-400 shrink-0" />
              <input
                ref="leaderInputRef"
                v-model="leaderSearchQuery"
                class="text-sm text-gray-900 bg-transparent outline-none w-full placeholder-gray-400"
                placeholder="Search users..."
                @input="onLeaderInput"
                @keydown="onLeaderKeydown"
                @focus="onLeaderFocus"
              />
              <Loader2 v-if="leaderSearchLoading" :size="14" class="text-gray-400 animate-spin shrink-0" />
            </div>

            <!-- Autocomplete dropdown -->
            <div
              v-if="leaderSearchResults.length > 0"
              class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-auto z-[100]"
              @mousedown.prevent
            >
              <button
                v-for="(user, idx) in leaderSearchResults"
                :key="user.id"
                type="button"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                :class="idx === selectedLeaderIndex ? 'bg-[#4857FE]/10' : 'hover:bg-gray-50'"
                @click="selectLeader(user)"
              >
                <div class="w-7 h-7 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[10px] font-medium overflow-hidden shrink-0">
                  <UploadAssetImg
                    v-if="user.avatar"
                    :src="user.avatar"
                    class="w-7 h-7 rounded-full object-cover"
                    :alt="user.name"
                  />
                  <span v-else>{{ user.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) }}</span>
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="text-sm font-medium text-gray-900 truncate">{{ user.name }}</span>
                  <span class="text-[10px] text-gray-400 truncate">{{ user.email }}</span>
                </div>
              </button>
            </div>

            <!-- No results -->
            <div
              v-else-if="leaderSearchQuery && !leaderSearchLoading && leaderSearchResults.length === 0"
              class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-[100]"
            >
              <p class="text-xs text-gray-400 text-center">No users found</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button
            type="submit"
            :disabled="!title.trim() || submitting"
            class="bg-[#4857FE] hover:bg-[#3E4BDE]"
          >
            {{ submitting ? 'Creating...' : 'Create Initiative' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
