<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useBacklogStore } from '@/stores/backlog'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/lib/api'
import { organizationTeamsApi } from '@/lib/apiClient'
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
} from 'lucide-vue-next'
import type { TaskType, TaskPriority } from '@/types/backlog'

interface UserResult {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
}

interface TeamResult {
  id: string
  name: string
  key: string
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
const submitting = ref(false)
const activeProductLogoFailed = ref(false)
const showActiveProductLogo = computed(
  () => Boolean(productStore.activeProduct.logo) && !activeProductLogoFailed.value,
)

const taskTypeIcons: Record<TaskType, any> = {
  design: Palette,
  development: Code2,
  testing: TestTube2,
  review: Eye,
  research: FlaskConical,
  fix: Wrench,
  documentation: FileText,
  deployment: Rocket,
}

const taskTypeColors: Record<TaskType, string> = {
  design: 'text-[#7C5CFC]',
  development: 'text-[#4857FE]',
  testing: 'text-[#00c875]',
  review: 'text-[#06b6d4]',
  research: 'text-[#eab308]',
  fix: 'text-[#e2445c]',
  documentation: 'text-[#a1a1aa]',
  deployment: 'text-[#fdab3d]',
}

function taskTypeLabel(value: TaskType) {
  switch (value) {
    case 'design': return 'Design'
    case 'development': return 'Development'
    case 'testing': return 'Testing'
    case 'review': return 'Review'
    case 'research': return 'Research'
    case 'fix': return 'Fix'
    case 'documentation': return 'Documentation'
    case 'deployment': return 'Deployment'
    default: return value
  }
}

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

function onStoryFocus() {
  showStoryDropdown.value = true
}

function onStoryBlur() {
  globalThis.setTimeout(() => {
    showStoryDropdown.value = false
  }, 150)
}

// Owner is always the task creator; assignee can be a member or a team.
const creatorOwner = computed(() => authStore.user)
const assigneeUserId = ref<string | null>(null)
const assigneeTeamId = ref<string | null>(null)
const assigneeSearchQuery = ref('')
const assigneeSearchResults = ref<UserResult[]>([])
const assigneeTeams = ref<TeamResult[]>([])
const assigneeSearchLoading = ref(false)
const showAssigneeDropdown = ref(false)
let assigneeSearchTimeout: ReturnType<typeof setTimeout> | null = null

const selectedAssignee = computed(() => {
  if (!assigneeUserId.value) return null
  return assigneeSearchResults.value.find((u) => u.id === assigneeUserId.value) || cachedAssignee.value
})

const cachedAssignee = ref<UserResult | null>(null)

function onActiveProductLogoError(): void {
  activeProductLogoFailed.value = true
}

async function searchAssignees(query: string) {
  assigneeSearchLoading.value = true
  try {
    const payload = await usersApi.list({ q: query }, authStore.token)
    assigneeSearchResults.value = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.items) ? payload.items : [])
  } catch {
    assigneeSearchResults.value = []
  } finally {
    assigneeSearchLoading.value = false
  }
}

async function loadAssigneeTeams() {
  const organizationId = productStore.activeProduct.organizationId
  if (!organizationId) {
    assigneeTeams.value = []
    return
  }
  try {
    const payload = await organizationTeamsApi.list(organizationId, {}, authStore.token)
    assigneeTeams.value = Array.isArray(payload)
      ? payload.map((team) => ({ id: team.id, name: team.name, key: team.key }))
      : []
  } catch {
    assigneeTeams.value = []
  }
}

function onAssigneeInput() {
  showAssigneeDropdown.value = true
  if (assigneeSearchTimeout) clearTimeout(assigneeSearchTimeout)
  assigneeSearchTimeout = setTimeout(() => {
    searchAssignees(assigneeSearchQuery.value)
  }, 200)
}

function selectAssignee(user: UserResult) {
  assigneeUserId.value = user.id
  assigneeTeamId.value = null
  cachedAssignee.value = user
  assigneeSearchQuery.value = ''
  showAssigneeDropdown.value = false
}

function clearAssignee() {
  assigneeUserId.value = null
  cachedAssignee.value = null
  assigneeSearchQuery.value = ''
}

function onAssigneeFocus() {
  showAssigneeDropdown.value = true
  if (!assigneeUserId.value) searchAssignees(assigneeSearchQuery.value)
}

function onAssigneeBlur() {
  globalThis.setTimeout(() => {
    showAssigneeDropdown.value = false
  }, 150)
}

watch(assigneeTeamId, (teamId) => {
  if (teamId && assigneeUserId.value) {
    clearAssignee()
  }
})

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
  assigneeUserId.value = null
  assigneeTeamId.value = null
  cachedAssignee.value = null
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
  if (val) {
    activeProductLogoFailed.value = false
    loadAssigneeTeams()
  }
})

watch(() => productStore.activeProduct.id, () => {
  activeProductLogoFailed.value = false
  if (open.value) loadAssigneeTeams()
})

watch(() => productStore.activeProduct.logo, () => {
  activeProductLogoFailed.value = false
})

async function handleSubmit() {
  if (!title.value.trim() || !selectedStoryId.value) return
  submitting.value = true

  await backlogStore.createTask(selectedStoryId.value, {
    title: title.value.trim(),
    description: description.value.trim() || null,
    type: type.value,
    priority: priority.value,
    ownerUserId: authStore.user?.id || null,
    assigneeUserIds: assigneeUserId.value ? [assigneeUserId.value] : null,
    assigneeTeamIds: assigneeTeamId.value ? [assigneeTeamId.value] : null,
  })

  submitting.value = false
  submitted.value = true
  emit('created')
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[520px] overflow-visible!">
      <DialogHeader>
        <DialogTitle>Create Task</DialogTitle>
        <DialogDescription>Create a new task under a story.</DialogDescription>
      </DialogHeader>

      <button type="button" @click="resetForm" title="Clear form" class="absolute top-4 right-12 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden text-muted-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
      </button>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <!-- Title -->
        <div class="space-y-1.5">
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
          <div v-if="selectedStory" class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
            <span class="w-2 h-2 rounded-full shrink-0" :class="storyStatusDot(selectedStory.status)"></span>
            <span class="text-sm font-medium text-gray-900 flex-1 truncate">{{ selectedStory.title }}</span>
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
                @focus="onStoryFocus"
                @blur="onStoryBlur"
              />
            </div>
            <div
              v-if="showStoryDropdown && filteredStories.length > 0"
              class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-auto z-100"
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
              class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-100"
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
                <span class="inline-flex items-center gap-2">
                  <component :is="taskTypeIcons[type]" :size="14" :class="taskTypeColors[type]" />
                  {{ taskTypeLabel(type) }}
                </span>
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
              <div v-if="showActiveProductLogo" class="w-5 h-5 rounded overflow-hidden shrink-0">
                <img
                  :src="productStore.activeProduct.logo"
                  class="w-full h-full object-cover"
                  :alt="productStore.activeProduct.name"
                  @error="onActiveProductLogoError"
                />
              </div>
              <div
                v-else
                class="w-5 h-5 rounded bg-[#4857FE]/10 flex items-center justify-center text-[9px] font-bold text-[#4857FE] shrink-0"
              >
                {{ productStore.activeProduct.name.slice(0, 2).toUpperCase() }}
              </div>
              <span class="truncate">{{ productStore.activeProduct.name }}</span>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Owner</label>
            <div class="flex items-center gap-2.5 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50">
              <div class="w-6 h-6 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[9px] font-medium overflow-hidden shrink-0">
                <img
                  v-if="creatorOwner?.avatar"
                  :src="creatorOwner.avatar"
                  class="w-6 h-6 rounded-full object-cover"
                  :alt="creatorOwner.name"
                />
                <span v-else>{{ (creatorOwner?.name || 'U').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) }}</span>
              </div>
              <span class="text-sm font-medium text-gray-900 flex-1 truncate">{{ creatorOwner?.name || 'Current user' }}</span>
            </div>
            <p class="text-[11px] text-gray-500">
              Owner is automatically set to the task creator.
            </p>
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Assignee</label>
          <!-- Selected assignee display -->
          <div v-if="selectedAssignee" class="flex items-center gap-2.5 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
            <div class="w-6 h-6 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[9px] font-medium overflow-hidden shrink-0">
              <img v-if="selectedAssignee.avatar" :src="selectedAssignee.avatar" class="w-6 h-6 rounded-full object-cover" :alt="selectedAssignee.name" />
              <span v-else>{{ selectedAssignee.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) }}</span>
            </div>
            <span class="text-sm font-medium text-gray-900 flex-1 truncate">{{ selectedAssignee.name }}</span>
            <button type="button" class="text-gray-400 hover:text-gray-600 shrink-0" @click="clearAssignee">
              <X :size="14" />
            </button>
          </div>
          <!-- Assignee search input -->
          <div v-else class="relative">
            <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 bg-white">
              <Search :size="14" class="text-gray-400 shrink-0" />
              <input
                v-model="assigneeSearchQuery"
                class="text-sm text-gray-900 bg-transparent outline-none w-full placeholder-gray-400"
                placeholder="Search users..."
                @input="onAssigneeInput"
                @focus="onAssigneeFocus"
                @blur="onAssigneeBlur"
              />
              <Loader2 v-if="assigneeSearchLoading" :size="14" class="text-gray-400 animate-spin shrink-0" />
            </div>
            <div
              v-if="showAssigneeDropdown && assigneeSearchResults.length > 0"
              class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-auto z-100"
              @mousedown.prevent
            >
              <button
                v-for="user in assigneeSearchResults"
                :key="user.id"
                type="button"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                @click="selectAssignee(user)"
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
              v-else-if="showAssigneeDropdown && assigneeSearchQuery && !assigneeSearchLoading && assigneeSearchResults.length === 0"
              class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-100"
            >
              <p class="text-xs text-gray-400 text-center">No users found</p>
            </div>
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Assignee Team</label>
          <select
            v-model="assigneeTeamId"
            class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20"
          >
            <option :value="null">No assignee team</option>
            <option v-for="team in assigneeTeams" :key="team.id" :value="team.id">
              {{ team.name }} ({{ team.key }})
            </option>
          </select>
          <p class="text-[11px] text-gray-500">
            Assign to a team instead of an individual member. Choosing a team clears individual assignee.
          </p>
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
