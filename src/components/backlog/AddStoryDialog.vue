<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useBacklogStore } from '@/stores/backlog'
import { useProductStore } from '@/stores/products'
import { useInitiativesStore } from '@/stores/initiatives'
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
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import {
  CalendarCell,
  CalendarCellTrigger,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHead,
  CalendarGridRow,
  CalendarHeadCell,
  CalendarHeader,
  CalendarHeading,
  CalendarNext,
  CalendarPrev,
  CalendarRoot,
} from 'reka-ui'
import {
  Search,
  Loader2,
  X,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Bug,
  Lightbulb,
  FlaskConical,
  Sparkles,
  Wrench,
  Server,
  TestTube2,
  FileText,
  ListTodo,
  Plus,
  Trash2,
} from 'lucide-vue-next'
import type { StoryType, StoryPriority } from '@/types/backlog'
import { type DateValue, CalendarDate } from '@internationalized/date'

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

const backlogStore = useBacklogStore()
const productStore = useProductStore()
const initiativesStore = useInitiativesStore()
const authStore = useAuthStore()

const title = ref('')
const description = ref('')
const acceptanceCriteria = ref('')
const type = ref<StoryType>('feature')
const priority = ref<StoryPriority>('medium')
const initiative = ref('')
const initiativeId = ref('')
const requiredBy = ref<string | null>(null)
const owner = ref('')
const ownerAvatar = ref<string | null>(null)
const submitting = ref(false)
const submittingWithBreakdown = ref(false)

// Sub-tasks for breakdown
const showBreakdown = ref(false)
const subtasks = ref<{ title: string }[]>([])
const newSubtaskTitle = ref('')

// Owner search
const ownerSearchQuery = ref('')
const ownerSearchResults = ref<UserResult[]>([])
const ownerSearchLoading = ref(false)
const selectedOwnerIndex = ref(-1)
const ownerInputRef = ref<HTMLInputElement | null>(null)
const showOwnerDropdown = ref(false)
let ownerSearchTimeout: ReturnType<typeof setTimeout> | null = null

// Initiative search
const initiativeSearchQuery = ref('')
const initiativeSearchResults = computed(() => {
  const query = initiativeSearchQuery.value.toLowerCase()
  if (!query) return initiativesStore.initiatives
  return initiativesStore.initiatives.filter(i =>
    i.title.toLowerCase().includes(query)
  )
})
const selectedInitiativeIndex = ref(-1)
const initiativeInputRef = ref<HTMLInputElement | null>(null)
const showInitiativeDropdown = ref(false)

// Calendar
const calendarOpen = ref(false)
const calendarValue = ref<DateValue | undefined>()

// Priority colors
const priorityColors: Record<string, string> = {
  low: 'bg-[#00c875]',
  medium: 'bg-[#fdab3d]',
  high: 'bg-[#e2445c]',
  critical: 'bg-[#333333]',
}

// Type icons
const typeIcons = {
  feature: Sparkles,
  bug: Bug,
  improvement: Lightbulb,
  technical_debt: Wrench,
  research: FlaskConical,
  infrastructure: Server,
  testing: TestTube2,
  documentation: FileText,
}

const typeColors: Record<string, string> = {
  feature: 'text-[#4857FE]',
  bug: 'text-[#e2445c]',
  improvement: 'text-[#7C5CFC]',
  technical_debt: 'text-[#fdab3d]',
  research: 'text-[#eab308]',
  infrastructure: 'text-[#555555]',
  testing: 'text-[#00c875]',
  documentation: 'text-[#a1a1aa]',
}

const activeProduct = computed(() => productStore.activeProduct)

// ---- Owner search methods ----
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
  selectedOwnerIndex.value = -1
  showOwnerDropdown.value = true
  if (ownerSearchTimeout) clearTimeout(ownerSearchTimeout)
  ownerSearchTimeout = setTimeout(() => {
    searchOwners(ownerSearchQuery.value)
  }, 200)
}

function selectOwner(user: UserResult) {
  owner.value = user.name
  ownerAvatar.value = user.avatar
  ownerSearchQuery.value = ''
  ownerSearchResults.value = []
  showOwnerDropdown.value = false
}

function clearOwner() {
  owner.value = ''
  ownerAvatar.value = null
  ownerSearchQuery.value = ''
  ownerSearchResults.value = []
  nextTick(() => ownerInputRef.value?.focus())
}

function onOwnerKeydown(e: KeyboardEvent) {
  const results = ownerSearchResults.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedOwnerIndex.value = Math.min(selectedOwnerIndex.value + 1, results.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedOwnerIndex.value = Math.max(selectedOwnerIndex.value - 1, -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (selectedOwnerIndex.value >= 0 && results[selectedOwnerIndex.value]) {
      selectOwner(results[selectedOwnerIndex.value]!)
    }
  } else if (e.key === 'Escape') {
    showOwnerDropdown.value = false
  }
}

function onOwnerFocus() {
  showOwnerDropdown.value = true
  if (!owner.value) searchOwners(ownerSearchQuery.value)
}

function onOwnerBlur() {
  // Don't close if user is clicking on the dropdown
  // if (ownerMouseDownOnDropdown.value) {
  //   ownerMouseDownOnDropdown.value = false
  //   return
  // }
  setTimeout(() => { showOwnerDropdown.value = false }, 100)
}

// ---- Initiative search methods ----
function onInitiativeInput() {
  selectedInitiativeIndex.value = -1
  showInitiativeDropdown.value = true
}

function selectInitiative(init: { id: string; title: string }) {
  initiative.value = init.title
  initiativeId.value = init.id
  initiativeSearchQuery.value = ''
  showInitiativeDropdown.value = false
}

function clearInitiative() {
  initiative.value = ''
  initiativeId.value = ''
  initiativeSearchQuery.value = ''
  showInitiativeDropdown.value = false
  nextTick(() => initiativeInputRef.value?.focus())
}

function onInitiativeKeydown(e: KeyboardEvent) {
  const results = initiativeSearchResults.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedInitiativeIndex.value = Math.min(selectedInitiativeIndex.value + 1, results.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedInitiativeIndex.value = Math.max(selectedInitiativeIndex.value - 1, -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (selectedInitiativeIndex.value >= 0 && results[selectedInitiativeIndex.value]) {
      selectInitiative(results[selectedInitiativeIndex.value]!)
    }
  } else if (e.key === 'Escape') {
    showInitiativeDropdown.value = false
  }
}

function onInitiativeFocus() {
  showInitiativeDropdown.value = true
}

function onInitiativeBlur() {
  // Delay to allow mousedown on dropdown item
  setTimeout(() => { showInitiativeDropdown.value = false }, 150)
}

// ---- Calendar methods ----
function isoToCalendarDate(iso: string | null): DateValue | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

function calendarDateToIso(date: DateValue): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

function onCalendarSelect(val: DateValue | undefined) {
  calendarValue.value = val
  if (val) {
    requiredBy.value = calendarDateToIso(val)
    calendarOpen.value = false
  }
}

function clearDate() {
  requiredBy.value = null
  calendarValue.value = undefined
}

function formatDisplayDate(iso: string): string {
  const d = new Date(iso)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

// ---- Subtask methods ----
function addSubtask() {
  if (!newSubtaskTitle.value.trim()) return
  subtasks.value.push({ title: newSubtaskTitle.value.trim() })
  newSubtaskTitle.value = ''
}

function removeSubtask(index: number) {
  subtasks.value.splice(index, 1)
}

function onSubtaskKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addSubtask()
  }
}

// Reset form when dialog closes
const submitted = ref(false)

function resetForm() {
  title.value = ''
  description.value = ''
  acceptanceCriteria.value = ''
  type.value = 'feature'
  priority.value = 'medium'
  initiative.value = ''
  initiativeId.value = ''
  requiredBy.value = null
  calendarValue.value = undefined
  owner.value = ''
  ownerAvatar.value = null
  ownerSearchQuery.value = ''
  ownerSearchResults.value = []
  showOwnerDropdown.value = false
  initiativeSearchQuery.value = ''
  showInitiativeDropdown.value = false
  showBreakdown.value = false
  subtasks.value = []
  newSubtaskTitle.value = ''
}

watch(open, (val) => {
  if (!val && submitted.value) {
    resetForm()
    submitted.value = false
  }
})

async function handleSubmit(withBreakdown = false) {
  if (!title.value.trim()) return

  const activeProduct = productStore.activeProduct
  if (!activeProduct) return

  if (withBreakdown) {
    submittingWithBreakdown.value = true
  } else {
    submitting.value = true
  }

  const created = await backlogStore.createStory({
    title: title.value.trim(),
    description: description.value.trim() || undefined,
    acceptanceCriteria: acceptanceCriteria.value.trim() || undefined,
    type: type.value,
    priority: priority.value,
    product: activeProduct.name,
    initiative: initiative.value.trim() || undefined,
    delivery: requiredBy.value || undefined,
    owner: owner.value.trim() || undefined,
    ownerAvatar: ownerAvatar.value || undefined,
  })

  // Create subtasks if any
  if (created && subtasks.value.length > 0) {
    for (const st of subtasks.value) {
      await backlogStore.createTask(created.id, { title: st.title })
    }
  }

  submitting.value = false
  submittingWithBreakdown.value = false

  if (created) {
    emit('created', created.id)
  }

  submitted.value = true
  if (withBreakdown && created) {
    // Stay open, clear story fields but keep breakdown open for adding tasks
    title.value = ''
    description.value = ''
    acceptanceCriteria.value = ''
    showBreakdown.value = true
    subtasks.value = []
    newSubtaskTitle.value = ''
    // We could navigate to the story, but for now just close
    open.value = false
  } else {
    open.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[620px] !overflow-x-hidden flex flex-col max-h-[90dvh]">
      <DialogHeader>
        <DialogTitle>Add Story</DialogTitle>
        <DialogDescription>Create a new story.</DialogDescription>
      </DialogHeader>

      <button type="button" @click="resetForm" title="Clear form" class="absolute top-4 right-12 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden text-muted-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
      </button>

      <form @submit.prevent="handleSubmit(false)" class="space-y-4 overflow-y-auto overflow-x-hidden min-h-0 pr-1">
        <!-- Title (larger) -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Title *</label>
          <input
            v-model="title"
            placeholder="e.g. Add user authentication"
            autofocus
            class="w-full text-lg font-medium bg-transparent border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 placeholder-gray-400 transition-colors"
          />
        </div>

        <!-- Description -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <Textarea
            v-model="description"
            placeholder="Describe the requirement or feature..."
            :rows="3"
          />
        </div>

        <!-- Acceptance Criteria -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Acceptance Criteria</label>
          <Textarea
            v-model="acceptanceCriteria"
            placeholder="Define the conditions that must be met..."
            :rows="3"
          />
        </div>

        <!-- Type & Priority row (2 cols, no status) -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Type</label>
            <Select v-model="type">
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="feature">
                  <span class="flex items-center gap-2">
                    <Sparkles :size="14" class="text-[#4857FE]" />
                    Feature
                  </span>
                </SelectItem>
                <SelectItem value="bug">
                  <span class="flex items-center gap-2">
                    <Bug :size="14" class="text-[#e2445c]" />
                    Bug
                  </span>
                </SelectItem>
                <SelectItem value="improvement">
                  <span class="flex items-center gap-2">
                    <Lightbulb :size="14" class="text-[#7C5CFC]" />
                    Improvement
                  </span>
                </SelectItem>
                <SelectItem value="technical_debt">
                  <span class="flex items-center gap-2">
                    <Wrench :size="14" class="text-[#fdab3d]" />
                    Technical Debt
                  </span>
                </SelectItem>
                <SelectItem value="research">
                  <span class="flex items-center gap-2">
                    <FlaskConical :size="14" class="text-[#eab308]" />
                    Research
                  </span>
                </SelectItem>
                <SelectItem value="infrastructure">
                  <span class="flex items-center gap-2">
                    <Server :size="14" class="text-[#555555]" />
                    Infrastructure
                  </span>
                </SelectItem>
                <SelectItem value="testing">
                  <span class="flex items-center gap-2">
                    <TestTube2 :size="14" class="text-[#00c875]" />
                    Testing
                  </span>
                </SelectItem>
                <SelectItem value="documentation">
                  <span class="flex items-center gap-2">
                    <FileText :size="14" class="text-[#a1a1aa]" />
                    Documentation
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

        <!-- Product (disabled) & Owner (search) row -->
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
            <div v-if="owner" class="flex items-center gap-2.5 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
              <div class="w-6 h-6 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-[9px] font-medium overflow-hidden shrink-0">
                <img v-if="ownerAvatar" :src="ownerAvatar" class="w-6 h-6 rounded-full object-cover" :alt="owner" />
                <span v-else>{{ owner.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) }}</span>
              </div>
              <span class="text-sm font-medium text-gray-900 flex-1 truncate">{{ owner }}</span>
              <button type="button" class="text-gray-400 hover:text-gray-600 shrink-0" @click="clearOwner">
                <X :size="14" />
              </button>
            </div>
            <!-- Owner search input -->
            <div v-else class="relative">
              <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 bg-white">
                <Search :size="14" class="text-gray-400 shrink-0" />
                <input
                  ref="ownerInputRef"
                  v-model="ownerSearchQuery"
                  class="text-sm text-gray-900 bg-transparent outline-none w-full placeholder-gray-400"
                  placeholder="Search users..."
                  @input="onOwnerInput"
                  @keydown="onOwnerKeydown"
                  @focus="onOwnerFocus"
                  @blur="onOwnerBlur"
                />
                <Loader2 v-if="ownerSearchLoading" :size="14" class="text-gray-400 animate-spin shrink-0" />
              </div>
              <div
                v-if="showOwnerDropdown && ownerSearchResults.length > 0"
                class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-auto z-[100]"
                @mousedown.prevent
              >
                <button
                  v-for="(user, idx) in ownerSearchResults"
                  :key="user.id"
                  type="button"
                  class="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                  :class="idx === selectedOwnerIndex ? 'bg-[#4857FE]/10' : 'hover:bg-gray-50'"
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

        <!-- Initiative & Required By row -->
        <div class="grid grid-cols-2 gap-3">
          <!-- Initiative search -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Initiative</label>
            <!-- Selected initiative display -->
            <div v-if="initiative" class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
              <span class="text-sm font-medium text-gray-900 flex-1 truncate">{{ initiative }}</span>
              <button type="button" class="text-gray-400 hover:text-gray-600 shrink-0" @click="clearInitiative">
                <X :size="14" />
              </button>
            </div>
            <!-- Initiative search input -->
            <div v-else class="relative">
              <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 bg-white">
                <Search :size="14" class="text-gray-400 shrink-0" />
                <input
                  ref="initiativeInputRef"
                  v-model="initiativeSearchQuery"
                  class="text-sm text-gray-900 bg-transparent outline-none w-full placeholder-gray-400"
                  placeholder="Search initiatives..."
                  @input="onInitiativeInput"
                  @keydown="onInitiativeKeydown"
                  @focus="onInitiativeFocus"
                  @blur="onInitiativeBlur"
                />
              </div>
              <div
                v-if="showInitiativeDropdown && initiativeSearchResults.length > 0"
                class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-auto z-[100]"
                @mousedown.prevent
              >
                <button
                  v-for="(init, idx) in initiativeSearchResults"
                  :key="init.id"
                  type="button"
                  class="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                  :class="idx === selectedInitiativeIndex ? 'bg-[#4857FE]/10' : 'hover:bg-gray-50'"
                  @click="selectInitiative(init)"
                >
                  <div class="w-2 h-2 rounded-full shrink-0" :class="{
                    'bg-[#fdab3d]': init.status === 'planning',
                    'bg-[#00c875]': init.status === 'active',
                    'bg-[#e2445c]': init.status === 'paused',
                    'bg-[#c4c4c4]': init.status === 'completed',
                  }"></div>
                  <span class="text-sm text-gray-900 truncate">{{ init.title }}</span>
                </button>
              </div>
              <div
                v-else-if="showInitiativeDropdown && initiativeSearchQuery && initiativeSearchResults.length === 0"
                class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-[100]"
              >
                <p class="text-xs text-gray-400 text-center">No initiatives found</p>
              </div>
            </div>
          </div>

          <!-- Required By (single date calendar) -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-gray-700">Required By</label>
            <Popover v-model:open="calendarOpen">
              <PopoverTrigger as-child>
                <button
                  type="button"
                  class="inline-flex items-center gap-2 w-full px-3 py-[7px] text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors text-left"
                  :class="requiredBy ? 'text-gray-900' : 'text-gray-400'"
                >
                  <CalendarDays :size="16" class="text-gray-400 shrink-0" />
                  <span class="flex-1 truncate">{{ requiredBy ? formatDisplayDate(requiredBy) : 'Pick a date' }}</span>
                  <button v-if="requiredBy" type="button" class="text-gray-400 hover:text-gray-600 shrink-0" @click.stop="clearDate">
                    <X :size="14" />
                  </button>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" :side-offset="8" class="w-auto p-0">
                <CalendarRoot
                  v-slot="{ weekDays, grid }"
                  :model-value="calendarValue"
                  weekday-format="short"
                  class="p-3"
                  @update:model-value="onCalendarSelect"
                >
                  <CalendarHeader class="flex items-center justify-between mb-4">
                    <CalendarPrev class="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
                      <ChevronLeft :size="16" />
                    </CalendarPrev>
                    <CalendarHeading class="text-sm font-semibold text-gray-900" />
                    <CalendarNext class="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
                      <ChevronRight :size="16" />
                    </CalendarNext>
                  </CalendarHeader>

                  <CalendarGrid
                    v-for="month in grid"
                    :key="month.value.toString()"
                    class="w-full border-collapse"
                  >
                    <CalendarGridHead>
                      <CalendarGridRow class="flex">
                        <CalendarHeadCell
                          v-for="day in weekDays"
                          :key="day"
                          class="w-9 h-9 flex items-center justify-center text-xs font-medium text-gray-400"
                        >
                          {{ day }}
                        </CalendarHeadCell>
                      </CalendarGridRow>
                    </CalendarGridHead>
                    <CalendarGridBody>
                      <CalendarGridRow
                        v-for="(weekDates, index) in month.rows"
                        :key="`weekDate-${index}`"
                        class="flex"
                      >
                        <CalendarCell
                          v-for="weekDate in weekDates"
                          :key="weekDate.toString()"
                          :date="weekDate"
                          class="relative w-9 h-9 flex items-center justify-center text-sm p-0"
                        >
                          <CalendarCellTrigger
                            :day="weekDate"
                            :month="month.value"
                            class="inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-normal transition-colors
                              hover:bg-gray-100
                              data-[today]:font-bold data-[today]:text-[#4857FE]
                              data-[selected]:bg-[#4857FE] data-[selected]:text-white data-[selected]:hover:bg-[#3E4BDE] data-[selected]:font-semibold
                              data-[disabled]:text-gray-300 data-[disabled]:pointer-events-none
                              data-[outside-month]:text-gray-300 data-[outside-month]:pointer-events-none
                              data-[unavailable]:text-gray-300 data-[unavailable]:line-through"
                          />
                        </CalendarCell>
                      </CalendarGridRow>
                    </CalendarGridBody>
                  </CalendarGrid>
                </CalendarRoot>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <!-- Breakdown into tasks section -->
        <div v-if="showBreakdown" class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <ListTodo :size="14" class="text-gray-400" />
              Sub-tasks
            </label>
            <button type="button" class="text-xs text-gray-400 hover:text-gray-600" @click="showBreakdown = false; subtasks = []">
              Cancel
            </button>
          </div>

          <!-- Existing subtasks -->
          <div v-if="subtasks.length > 0" class="space-y-1">
            <div
              v-for="(st, idx) in subtasks"
              :key="idx"
              class="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg group"
            >
              <div class="w-4 h-4 rounded border border-gray-300 shrink-0"></div>
              <span class="text-sm text-gray-700 flex-1">{{ st.title }}</span>
              <button type="button" class="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0" @click="removeSubtask(idx)">
                <Trash2 :size="12" />
              </button>
            </div>
          </div>

          <!-- Add subtask input -->
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-2 flex-1 border border-dashed border-gray-200 rounded-lg px-3 py-1.5">
              <Plus :size="14" class="text-gray-400 shrink-0" />
              <input
                v-model="newSubtaskTitle"
                type="text"
                placeholder="Add a sub-task..."
                class="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400"
                @keydown="onSubtaskKeydown"
              />
            </div>
            <button
              v-if="newSubtaskTitle.trim()"
              type="button"
              class="text-xs font-medium text-[#4857FE] hover:text-[#3E4BDE] px-2 py-1.5 rounded transition-colors"
              @click="addSubtask"
            >
              Add
            </button>
          </div>
        </div>

      </form>

      <DialogFooter class="gap-2 shrink-0">
        <Button type="button" variant="outline" @click="open = false">Cancel</Button>
        <Button
          v-if="!showBreakdown"
          type="button"
          variant="outline"
          :disabled="!title.trim() || submittingWithBreakdown"
          class="border-[#4857FE] text-[#4857FE] hover:bg-[#4857FE]/5"
          @click="showBreakdown = true"
        >
          <ListTodo :size="14" class="mr-1.5" />
          Breakdown into Tasks
        </Button>
        <Button
          type="button"
          :disabled="!title.trim() || submitting || submittingWithBreakdown"
          class="bg-[#4857FE] hover:bg-[#3E4BDE]"
          @click="handleSubmit(false)"
        >
          {{ submitting ? 'Creating...' : 'Create Story' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
