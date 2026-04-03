<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useBacklogStore } from '@/stores/backlog'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Loader2,
  X,
  Palette,
  Code2,
  TestTube2,
  Eye,
  FlaskConical,
  Wrench,
  FileText,
  Rocket,
  Calendar,
} from 'lucide-vue-next'
import type { TaskType, TaskPriority } from '@/types/backlog'

interface UserResult {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
}

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  created: []
}>()

const backlogStore = useBacklogStore()
const productStore = useProductStore()
const authStore = useAuthStore()

const title = ref('')
const description = ref('')
const type = ref<TaskType>('development')
const priority = ref<TaskPriority>('medium')
const selectedStoryId = ref('')
const dueAt = ref('')
const submitting = ref(false)

// Story search
const storySearchQuery = ref('')
const showStoryDropdown = ref(false)

const filteredStories = computed(() => {
  const q = storySearchQuery.value.toLowerCase().trim()
  if (!q) return backlogStore.stories
  return backlogStore.stories.filter(s =>
    s.title.toLowerCase().includes(q)
  )
})

const activeProduct = computed(() => productStore.activeProduct)

const selectedStory = computed(() => {
  if (!selectedStoryId.value) return null
  return backlogStore.stories.find(s => s.id === selectedStoryId.value) || null
})

function selectStory(story: { id: string; title: string }) {
  selectedStoryId.value = story.id
  storySearchQuery.value = ''
  showStoryDropdown.value = false
}

function clearStory() {
  selectedStoryId.value = ''
  storySearchQuery.value = ''
}

// Owner search
const ownerUserId = ref<string | null>(null)
const ownerSearchQuery = ref('')
const ownerSearchResults = ref<UserResult[]>([])
const ownerSearchLoading = ref(false)
const showOwnerDropdown = ref(false)
let ownerSearchTimeout: ReturnType<typeof setTimeout> | null = null

const selectedOwner = computed(() => {
  if (!ownerUserId.value) return null
  return ownerSearchResults.value.find(u => u.id === ownerUserId.value) || cachedOwner.value
})

const cachedOwner = ref<UserResult | null>(null)

async function searchOwners(query: string) {
  ownerSearchLoading.value = true
  try {
    const res = await fetch(`/api/auth/users?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      ownerSearchResults.value = await res.json()
    }
  } catch {
    ownerSearchResults.value = []
  } finally {
    ownerSearchLoading.value = false
  }
}

function onOwnerInput() {
  showOwnerDropdown.value = true
  if (ownerSearchTimeout) clearTimeout(ownerSearchTimeout)
  ownerSearchTimeout = setTimeout(() => {
    searchOwners(ownerSearchQuery.value)
  }, 200)
}

function selectOwner(user: UserResult) {
  ownerUserId.value = user.id
  cachedOwner.value = user
  ownerSearchQuery.value = ''
  showOwnerDropdown.value = false
}

function clearOwner() {
  ownerUserId.value = null
  cachedOwner.value = null
  ownerSearchQuery.value = ''
}

function onOwnerFocus() {
  showOwnerDropdown.value = true
  if (!ownerUserId.value) searchOwners(ownerSearchQuery.value)
}

function hideStoryDropdownWithDelay() {
  window.setTimeout(() => {
    showStoryDropdown.value = false
  }, 150)
}

function hideOwnerDropdownWithDelay() {
  window.setTimeout(() => {
    showOwnerDropdown.value = false
  }, 150)
}

// Assignee search (multi-select)
const assigneeUserIds = ref<string[]>([])
const assigneeSearchQuery = ref('')
const assigneeSearchResults = ref<UserResult[]>([])
const assigneeSearchLoading = ref(false)
const showAssigneeDropdown = ref(false)
const cachedAssignees = ref<UserResult[]>([])
let assigneeSearchTimeout: ReturnType<typeof setTimeout> | null = null

async function searchAssignees(query: string) {
  assigneeSearchLoading.value = true
  try {
    const res = await fetch(`/api/auth/users?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      assigneeSearchResults.value = await res.json()
    }
  } catch {
    assigneeSearchResults.value = []
  } finally {
    assigneeSearchLoading.value = false
  }
}

function onAssigneeInput() {
  showAssigneeDropdown.value = true
  if (assigneeSearchTimeout) clearTimeout(assigneeSearchTimeout)
  assigneeSearchTimeout = setTimeout(() => {
    searchAssignees(assigneeSearchQuery.value)
  }, 200)
}

function onAssigneeFocus() {
  showAssigneeDropdown.value = true
  searchAssignees(assigneeSearchQuery.value)
}

function toggleAssignee(user: UserResult) {
  const idx = assigneeUserIds.value.indexOf(user.id)
  if (idx === -1) {
    assigneeUserIds.value.push(user.id)
    if (!cachedAssignees.value.find(u => u.id === user.id)) {
      cachedAssignees.value.push(user)
    }
  } else {
    assigneeUserIds.value.splice(idx, 1)
    cachedAssignees.value = cachedAssignees.value.filter(u => u.id !== user.id)
  }
}

function removeAssignee(userId: string) {
  assigneeUserIds.value = assigneeUserIds.value.filter(id => id !== userId)
  cachedAssignees.value = cachedAssignees.value.filter(u => u.id !== userId)
}

function hideAssigneeDropdownWithDelay() {
  window.setTimeout(() => {
    showAssigneeDropdown.value = false
  }, 150)
}

// Status colors for story dots
function storyStatusDot(status: string) {
  switch (status) {
    case 'backlog': return 'bg-[#c4c4c4]'
    case 'drafted': return 'bg-[#a25ddc]'
    case 'initialized': return 'bg-[#579bfc]'
    case 'in_progress': return 'bg-[#fdab3d]'
    case 'completed': return 'bg-[#00c875]'
    case 'archived': return 'bg-gray-300'
    default: return 'bg-gray-400'
  }
}

const submitted = ref(false)

function resetForm() {
  title.value = ''
  description.value = ''
  type.value = 'development'
  priority.value = 'medium'
  selectedStoryId.value = ''
  storySearchQuery.value = ''
  showStoryDropdown.value = false
  dueAt.value = ''
  ownerUserId.value = null
  cachedOwner.value = null
  ownerSearchQuery.value = ''
  ownerSearchResults.value = []
  showOwnerDropdown.value = false
  assigneeUserIds.value = []
  cachedAssignees.value = []
  assigneeSearchQuery.value = ''
  assigneeSearchResults.value = []
  showAssigneeDropdown.value = false
}

// Only reset form after successful submission
watch(open, (val) => {
  if (!val && submitted.value) {
    resetForm()
    submitted.value = false
  }
})

async function handleSubmit() {
  if (!title.value.trim() || !selectedStoryId.value) return
  submitting.value = true

  await backlogStore.createTask(selectedStoryId.value, {
    title: title.value.trim(),
    description: description.value.trim() || null,
    type: type.value,
    priority: priority.value,
    ownerUserId: ownerUserId.value,
    assigneeUserIds: assigneeUserIds.value.length > 0 ? assigneeUserIds.value : null,
    dueAt: dueAt.value || null,
  })

  submitting.value = false
  submitted.value = true
  emit('created')
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[520px] !overflow-x-hidden !overflow-y-visible">
      <DialogHeader>
        <DialogTitle>Create Task</DialogTitle>
        <DialogDescription>Create a new task under a story.</DialogDescription>
      </DialogHeader>

      <button type="button" @click="resetForm" title="Clear form" class="absolute top-4 right-12 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden text-muted-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
      </button>

      <form @submit.prevent="handleSubmit" class="w-full min-w-0 space-y-4 overflow-x-hidden">
        <!-- Title -->
        <div class="space-y-1.5 min-w-0">
          <label class="text-sm font-medium text-gray-700">Title *</label>
          <input
            v-model="title"
            placeholder="e.g. Implement login API"
            autofocus
            class="w-full text-lg font-medium bg-transparent border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 placeholder-gray-400 transition-colors"
          />
        </div>

        <!-- Description -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <Textarea
            v-model="description"
            placeholder="Describe the task..."
            :rows="2"
          />
        </div>

        <!-- Story (required) -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Story *</label>
          <!-- Selected story display -->
          <div v-if="selectedStory" class="flex w-full max-w-full items-center gap-2 overflow-hidden border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
            <span class="w-2 h-2 rounded-full shrink-0" :class="storyStatusDot(selectedStory.status)"></span>
            <span class="block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-gray-900">{{ selectedStory.title }}</span>
            <button type="button" class="text-gray-400 hover:text-gray-600 shrink-0" @click="clearStory">
              <X :size="14" />
            </button>
          </div>
          <!-- Story search input -->
          <div v-else class="relative">
            <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 bg-white">
              <Search :size="14" class="text-gray-400 shrink-0" />
              <input
                v-model="storySearchQuery"
                class="text-sm text-gray-900 bg-transparent outline-none w-full placeholder-gray-400"
                placeholder="Search stories..."
                @focus="showStoryDropdown = true"
                @blur="hideStoryDropdownWithDelay"
              />
            </div>
            <div
              v-if="showStoryDropdown && filteredStories.length > 0"
              class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-auto z-[100]"
              @mousedown.prevent
            >
              <button
                v-for="story in filteredStories.slice(0, 10)"
                :key="story.id"
                type="button"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                @click="selectStory(story)"
              >
                <span class="w-2 h-2 rounded-full shrink-0" :class="storyStatusDot(story.status)"></span>
                <span class="text-sm text-gray-900 truncate">{{ story.title }}</span>
              </button>
            </div>
            <div
              v-else-if="showStoryDropdown && storySearchQuery && filteredStories.length === 0"
              class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-[100]"
            >
              <p class="text-xs text-gray-400 text-center">No stories found</p>
            </div>
          </div>
        </div>

        <!-- Type & Priority row -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Type</label>
            <Select v-model="type">
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="design">
                  <span class="flex items-center gap-2">
                    <Palette :size="14" class="text-[#7C5CFC]" />
                    Design
                  </span>
                </SelectItem>
                <SelectItem value="development">
                  <span class="flex items-center gap-2">
                    <Code2 :size="14" class="text-[#4857FE]" />
                    Development
                  </span>
                </SelectItem>
                <SelectItem value="testing">
                  <span class="flex items-center gap-2">
                    <TestTube2 :size="14" class="text-[#00c875]" />
                    Testing
                  </span>
                </SelectItem>
                <SelectItem value="review">
                  <span class="flex items-center gap-2">
                    <Eye :size="14" class="text-[#06b6d4]" />
                    Review
                  </span>
                </SelectItem>
                <SelectItem value="research">
                  <span class="flex items-center gap-2">
                    <FlaskConical :size="14" class="text-[#eab308]" />
                    Research
                  </span>
                </SelectItem>
                <SelectItem value="fix">
                  <span class="flex items-center gap-2">
                    <Wrench :size="14" class="text-[#e2445c]" />
                    Fix
                  </span>
                </SelectItem>
                <SelectItem value="documentation">
                  <span class="flex items-center gap-2">
                    <FileText :size="14" class="text-[#a1a1aa]" />
                    Documentation
                  </span>
                </SelectItem>
                <SelectItem value="deployment">
                  <span class="flex items-center gap-2">
                    <Rocket :size="14" class="text-[#fdab3d]" />
                    Deployment
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
                <SelectItem value="low">
                  <span class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#00c875]"></span>
                    Low
                  </span>
                </SelectItem>
                <SelectItem value="medium">
                  <span class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#fdab3d]"></span>
                    Medium
                  </span>
                </SelectItem>
                <SelectItem value="high">
                  <span class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#e2445c]"></span>
                    High
                  </span>
                </SelectItem>
                <SelectItem value="critical">
                  <span class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#333333]"></span>
                    Critical
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <!-- Product & Owner row -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Product</label>
            <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-sm text-gray-500 cursor-not-allowed">
              <div v-if="activeProduct?.logo" class="w-5 h-5 rounded overflow-hidden shrink-0">
                <img :src="activeProduct.logo" class="w-full h-full object-cover" :alt="activeProduct.name" />
              </div>
              <span class="truncate">{{ activeProduct?.name || 'Product' }}</span>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Owner</label>
            <!-- Selected owner display -->
            <div v-if="selectedOwner" class="flex items-center gap-2.5 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
              <div class="w-6 h-6 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[9px] font-medium overflow-hidden shrink-0">
                <img v-if="selectedOwner.avatar" :src="selectedOwner.avatar" class="w-6 h-6 rounded-full object-cover" :alt="selectedOwner.name" />
                <span v-else>{{ selectedOwner.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) }}</span>
              </div>
              <span class="text-sm font-medium text-gray-900 flex-1 truncate">{{ selectedOwner.name }}</span>
              <button type="button" class="text-gray-400 hover:text-gray-600 shrink-0" @click="clearOwner">
                <X :size="14" />
              </button>
            </div>
            <!-- Owner search input -->
            <div v-else class="relative">
              <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 bg-white">
                <Search :size="14" class="text-gray-400 shrink-0" />
                <input
                  v-model="ownerSearchQuery"
                  class="text-sm text-gray-900 bg-transparent outline-none w-full placeholder-gray-400"
                  placeholder="Search users..."
                  @input="onOwnerInput"
                  @focus="onOwnerFocus"
                  @blur="hideOwnerDropdownWithDelay"
                />
                <Loader2 v-if="ownerSearchLoading" :size="14" class="text-gray-400 animate-spin shrink-0" />
              </div>
              <div
                v-if="showOwnerDropdown && ownerSearchResults.length > 0"
                class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-auto z-[100]"
                @mousedown.prevent
              >
                <button
                  v-for="user in ownerSearchResults"
                  :key="user.id"
                  type="button"
                  class="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                  @click="selectOwner(user)"
                >
                  <div class="w-6 h-6 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[9px] font-medium overflow-hidden shrink-0">
                    <img v-if="user.avatar" :src="user.avatar" class="w-6 h-6 rounded-full object-cover" :alt="user.name" />
                    <span v-else>{{ user.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) }}</span>
                  </div>
                  <div class="flex flex-col min-w-0">
                    <span class="text-sm font-medium text-gray-900 truncate">{{ user.name }}</span>
                    <span class="text-[10px] text-gray-400 truncate">{{ user.email }}</span>
                  </div>
                </button>
              </div>
              <div
                v-else-if="showOwnerDropdown && ownerSearchQuery && !ownerSearchLoading && ownerSearchResults.length === 0"
                class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-[100]"
              >
                <p class="text-xs text-gray-400 text-center">No users found</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Assignees & Due Date row -->
        <div class="grid grid-cols-2 gap-3">
          <!-- Assignees (multi-select) -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Assignees</label>
            <!-- Selected assignees chips -->
            <div v-if="cachedAssignees.length > 0" class="flex flex-wrap gap-1.5 mb-1.5">
              <div
                v-for="u in cachedAssignees"
                :key="u.id"
                class="flex items-center gap-1.5 bg-[#4857FE]/8 border border-[#4857FE]/20 text-[#4857FE] rounded-full pl-1 pr-2 py-0.5"
              >
                <div class="w-4 h-4 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[7px] font-medium overflow-hidden shrink-0">
                  <img v-if="u.avatar" :src="u.avatar" class="w-4 h-4 rounded-full object-cover" :alt="u.name" />
                  <span v-else>{{ u.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) }}</span>
                </div>
                <span class="text-xs font-medium truncate max-w-[80px]">{{ u.name.split(' ')[0] }}</span>
                <button type="button" class="text-[#4857FE]/60 hover:text-[#4857FE] shrink-0" @click="removeAssignee(u.id)">
                  <X :size="11" />
                </button>
              </div>
            </div>
            <!-- Assignee search input -->
            <div class="relative">
              <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 bg-white">
                <Search :size="14" class="text-gray-400 shrink-0" />
                <input
                  v-model="assigneeSearchQuery"
                  class="text-sm text-gray-900 bg-transparent outline-none w-full placeholder-gray-400"
                  placeholder="Add assignees..."
                  @input="onAssigneeInput"
                  @focus="onAssigneeFocus"
                  @blur="hideAssigneeDropdownWithDelay"
                />
                <Loader2 v-if="assigneeSearchLoading" :size="14" class="text-gray-400 animate-spin shrink-0" />
              </div>
              <div
                v-if="showAssigneeDropdown && assigneeSearchResults.length > 0"
                class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[180px] overflow-auto z-[100]"
                @mousedown.prevent
              >
                <button
                  v-for="user in assigneeSearchResults"
                  :key="user.id"
                  type="button"
                  class="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                  :class="assigneeUserIds.includes(user.id) ? 'bg-[#4857FE]/5' : ''"
                  @click="toggleAssignee(user)"
                >
                  <div class="w-5 h-5 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[8px] font-medium overflow-hidden shrink-0">
                    <img v-if="user.avatar" :src="user.avatar" class="w-5 h-5 rounded-full object-cover" :alt="user.name" />
                    <span v-else>{{ user.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) }}</span>
                  </div>
                  <div class="flex flex-col min-w-0 flex-1">
                    <span class="text-sm font-medium text-gray-900 truncate">{{ user.name }}</span>
                    <span class="text-[10px] text-gray-400 truncate">{{ user.email }}</span>
                  </div>
                  <svg v-if="assigneeUserIds.includes(user.id)" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-[#4857FE] shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                </button>
              </div>
              <div
                v-else-if="showAssigneeDropdown && assigneeSearchQuery && !assigneeSearchLoading && assigneeSearchResults.length === 0"
                class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-[100]"
              >
                <p class="text-xs text-gray-400 text-center">No users found</p>
              </div>
            </div>
          </div>

          <!-- Due Date -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Due Date</label>
            <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 bg-white">
              <Calendar :size="14" class="text-gray-400 shrink-0" />
              <input
                v-model="dueAt"
                type="date"
                class="text-sm text-gray-900 bg-transparent outline-none w-full placeholder-gray-400"
              />
            </div>
          </div>
        </div>

        <DialogFooter class="gap-2">
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button
            type="submit"
            :disabled="!title.trim() || !selectedStoryId || submitting"
            class="bg-[#4857FE] hover:bg-[#3E4BDE]"
          >
            {{ submitting ? 'Creating...' : 'Create Task' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
