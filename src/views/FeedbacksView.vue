<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import {
  MessageSquareWarning, Plus, Loader2, Search, ArrowUp, ArrowDown,
  LayoutList, LayoutGrid, Bug, Lightbulb, Sparkles, X,
  Monitor, Globe, Smartphone, Clock, User, Paperclip, MessageSquare,
  ChevronRight, ChevronDown, ExternalLink, Tag,
} from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { useConsumerFeedbacksStore } from '@/stores/consumerFeedbacks'
import { usePagePermissions } from '@/lib/pagePermissions'
import { STORAGE_KEYS } from '@/constants/storageKeys'
import FavoriteStar from '@/components/shared/FavoriteStar.vue'
import type { ConsumerFeedbackType, ConsumerFeedbackStatus, ConsumerFeedbackPriority } from '@/types/consumerFeedback'

const productStore = useProductStore()
const authStore = useAuthStore()
const store = useConsumerFeedbacksStore()
const feedbackPermissions = usePagePermissions('feedbacks')
const canCreateFeedbacks = computed(() => feedbackPermissions.canCreate.value)
const CONSUMER_FEEDBACK_VIEW_MODE_KEY = STORAGE_KEYS.views.consumerFeedback.viewMode

const searchQuery = ref('')
const activeTab = ref<'all' | 'new' | 'investigating' | 'resolved' | 'wont_fix'>('all')
const viewMode = ref<'table' | 'card'>(localStorage.getItem(CONSUMER_FEEDBACK_VIEW_MODE_KEY) as any || 'table')
const sortField = ref<string>('createdAt')
const sortDir = ref<'asc' | 'desc'>('desc')
const typeFilter = ref<string>('')
const showCreateDialog = ref(false)
const expandedCardId = ref<string | null>(null)

// Create form
const newTitle = ref('')
const newDescription = ref('')
const newType = ref<ConsumerFeedbackType>('bug')
const newPriority = ref<ConsumerFeedbackPriority>('medium')
const newReporterName = ref('')
const newReporterEmail = ref('')
const newSteps = ref('')
const newExpected = ref('')
const newActual = ref('')
const newPageUrl = ref('')
const newTags = ref<string[]>([])
const newTagInput = ref('')
const submitting = ref(false)

watch(viewMode, (v) => localStorage.setItem(CONSUMER_FEEDBACK_VIEW_MODE_KEY, v))

function activeProductId() {
  return productStore.activeProduct.id
}

async function refreshFeedbacks() {
  await store.fetchAll(activeProductId(), {
    q: searchQuery.value.trim() || undefined,
    limit: 60,
  })
}

onMounted(() => {
  refreshFeedbacks()
})

watch(() => productStore.activeProduct.id, () => {
  refreshFeedbacks()
})

watch(searchQuery, () => {
  refreshFeedbacks()
})

const filteredItems = computed(() => {
  let list = store.items
  if (activeTab.value !== 'all') {
    if (activeTab.value === 'investigating') {
      list = list.filter(i => i.status === 'investigating' || i.status === 'acknowledged')
    } else {
      list = list.filter(i => i.status === activeTab.value)
    }
  }
  if (typeFilter.value) {
    list = list.filter(i => i.type === typeFilter.value)
  }
  const q = searchQuery.value.toLowerCase().trim()
  if (q) {
    list = list.filter(i =>
      i.title.toLowerCase().includes(q) ||
      (i.description && i.description.toLowerCase().includes(q)) ||
      (i.reporterName && i.reporterName.toLowerCase().includes(q)) ||
      (i.reporterEmail && i.reporterEmail.toLowerCase().includes(q)) ||
      (i.tags && i.tags.some(t => t.toLowerCase().includes(q)))
    )
  }
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...list].sort((a: any, b: any) => {
    const va = a[sortField.value] ?? ''
    const vb = b[sortField.value] ?? ''
    if (va < vb) return -1 * dir
    if (va > vb) return 1 * dir
    return 0
  })
})

function toggleSort(field: string) {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDir.value = field === 'createdAt' ? 'desc' : 'asc'
  }
}

const tabCounts = computed(() => ({
  all: store.items.length,
  new: store.items.filter(i => i.status === 'new').length,
  investigating: store.items.filter(i => i.status === 'investigating' || i.status === 'acknowledged').length,
  resolved: store.items.filter(i => i.status === 'resolved').length,
  wont_fix: store.items.filter(i => i.status === 'wont_fix' || i.status === 'duplicate').length,
}))

// Create
function addTag() {
  const t = newTagInput.value.trim()
  if (t && !newTags.value.includes(t)) newTags.value.push(t)
  newTagInput.value = ''
}
function removeTag(tag: string) { newTags.value = newTags.value.filter(t => t !== tag) }

async function handleCreate() {
  if (!canCreateFeedbacks.value) return
  if (!newTitle.value.trim()) return
  const productId = activeProductId()
  if (!productId) return
  submitting.value = true
  await store.create({
    productId,
    title: newTitle.value.trim(),
    description: newDescription.value.trim() || null,
    type: newType.value,
    priority: newPriority.value,
    reporterName: newReporterName.value.trim() || null,
    reporterEmail: newReporterEmail.value.trim() || null,
    stepsToReproduce: newSteps.value.trim() || null,
    expectedBehavior: newExpected.value.trim() || null,
    actualBehavior: newActual.value.trim() || null,
    pageUrl: newPageUrl.value.trim() || null,
    tags: newTags.value.length > 0 ? newTags.value : null,
  })
  submitting.value = false
  showCreateDialog.value = false
  resetForm()
}

function resetForm() {
  newTitle.value = ''; newDescription.value = ''; newType.value = 'bug'; newPriority.value = 'medium'
  newReporterName.value = ''; newReporterEmail.value = ''; newSteps.value = ''
  newExpected.value = ''; newActual.value = ''; newPageUrl.value = ''
  newTags.value = []; newTagInput.value = ''
}

// Styling
function typeIcon(type: string) {
  switch (type) {
    case 'bug': return Bug
    case 'feature': return Sparkles
    case 'enhancement': return Lightbulb
    default: return MessageSquareWarning
  }
}

function typeStyle(type: string) {
  switch (type) {
    case 'bug': return 'bg-red-100 text-red-700'
    case 'feature': return 'bg-purple-100 text-purple-700'
    case 'enhancement': return 'bg-blue-100 text-blue-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function typeColor(type: string) {
  switch (type) { case 'bug': return 'text-red-500'; case 'feature': return 'text-purple-500'; case 'enhancement': return 'text-blue-500'; default: return 'text-gray-500' }
}

function statusStyle(status: string) {
  switch (status) {
    case 'new': return 'bg-blue-500 text-white'
    case 'acknowledged': return 'bg-yellow-500 text-white'
    case 'investigating': return 'bg-orange-500 text-white'
    case 'resolved': return 'bg-green-500 text-white'
    case 'wont_fix': return 'bg-gray-400 text-white'
    case 'duplicate': return 'bg-gray-400 text-white'
    default: return 'bg-gray-400 text-white'
  }
}

function priorityStyle(p: string) {
  switch (p) {
    case 'critical': return 'bg-red-100 text-red-700 border border-red-200'
    case 'high': return 'bg-orange-100 text-orange-700 border border-orange-200'
    case 'medium': return 'bg-green-100 text-green-700 border border-green-200'
    case 'low': return 'bg-blue-100 text-blue-700 border border-blue-200'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function label(s: string) { return s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }

function timeAgo(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <!-- Page Header -->
    <div class="bg-white px-8 pt-7 pb-5 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
            <MessageSquareWarning :size="18" class="text-[#4857FE]" />
          </div>
          <h1 class="text-lg font-semibold text-gray-900">Consumer Feedback <span class="text-gray-400 font-normal">({{ store.items.length }})</span></h1>
        </div>
        <button
          class="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          :class="canCreateFeedbacks
            ? 'bg-[#4857FE] hover:bg-[#3E4BDE] text-white cursor-pointer'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'"
          :disabled="!canCreateFeedbacks"
          :title="feedbackPermissions.deniedReason('create', 'consumer feedback') || 'Submit feedback'"
          @click="showCreateDialog = true"
        >
          <Plus :size="15" />
          Submit Feedback
        </button>
      </div>
    </div>

    <!-- Tabs + Search + Filters -->
    <div class="bg-white px-8 pt-4 pb-3 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1">
          <button
            v-for="tab in (['all', 'new', 'investigating', 'resolved', 'wont_fix'] as const)"
            :key="tab"
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === tab ? 'text-[#4857FE] border-[#4857FE]' : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = tab"
          >
            {{ tab === 'all' ? 'All' : tab === 'wont_fix' ? 'Closed' : label(tab) }}
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center" :class="activeTab === tab ? 'bg-[#4857FE]/15 text-[#4857FE]' : 'bg-gray-200 text-gray-500'">{{ tabCounts[tab] }}</span>
          </button>
        </div>
        <div class="flex items-center gap-3">
          <!-- Type filter pills -->
          <div class="flex items-center gap-1">
            <button
              v-for="t in ['', 'bug', 'feature', 'enhancement']"
              :key="t"
              class="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              :class="typeFilter === t
                ? (t === 'bug' ? 'bg-red-100 text-red-700' : t === 'feature' ? 'bg-purple-100 text-purple-700' : t === 'enhancement' ? 'bg-blue-100 text-blue-700' : 'bg-[#4857FE]/10 text-[#4857FE]')
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
              @click="typeFilter = t"
            >
              {{ t ? label(t) : 'All Types' }}
            </button>
          </div>
          <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20">
            <Search :size="14" class="text-gray-400 shrink-0" />
            <input v-model="searchQuery" class="text-sm text-gray-700 bg-transparent outline-none w-44 placeholder-gray-400" placeholder="Search feedback..." />
          </div>
          <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button class="p-1.5 rounded-md transition-colors cursor-pointer" :class="viewMode === 'table' ? 'bg-white shadow-sm text-[#4857FE]' : 'text-gray-400 hover:text-gray-600'" @click="viewMode = 'table'"><LayoutList :size="16" /></button>
            <button class="p-1.5 rounded-md transition-colors cursor-pointer" :class="viewMode === 'card' ? 'bg-white shadow-sm text-[#4857FE]' : 'text-gray-400 hover:text-gray-600'" @click="viewMode = 'card'"><LayoutGrid :size="16" /></button>
          </div>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto px-8 py-6">
      <div v-if="store.loading" class="flex items-center justify-center py-16">
        <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
      </div>

      <!-- Empty -->
      <div v-else-if="filteredItems.length === 0" class="flex flex-col items-center justify-center py-20">
        <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <MessageSquareWarning :size="24" class="text-gray-400" />
        </div>
        <p class="text-gray-500 text-sm font-medium mb-1">No feedback yet</p>
        <p class="text-gray-400 text-xs mb-4">Consumer feedback will appear here</p>
        <button
          class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
          :class="canCreateFeedbacks
            ? 'bg-[#4857FE] text-white hover:bg-[#3E4BDE] cursor-pointer'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'"
          :disabled="!canCreateFeedbacks"
          :title="feedbackPermissions.deniedReason('create', 'consumer feedback') || 'Submit feedback'"
          @click="showCreateDialog = true"
        >
          <Plus :size="15" /> Submit Feedback
        </button>
      </div>

      <!-- Table View -->
      <div v-else-if="viewMode === 'table'" class="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-100">
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-8"></th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" @click="toggleSort('title')">
                <div class="flex items-center gap-1">Title <template v-if="sortField === 'title'"><ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" /><ArrowDown v-else :size="12" class="text-[#4857FE]" /></template></div>
              </th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" @click="toggleSort('status')">
                <div class="flex items-center gap-1">Status <template v-if="sortField === 'status'"><ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" /><ArrowDown v-else :size="12" class="text-[#4857FE]" /></template></div>
              </th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" @click="toggleSort('priority')">
                <div class="flex items-center gap-1">Priority <template v-if="sortField === 'priority'"><ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" /><ArrowDown v-else :size="12" class="text-[#4857FE]" /></template></div>
              </th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Reporter</th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned</th>
              <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider"><Paperclip :size="13" class="inline" /></th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" @click="toggleSort('createdAt')">
                <div class="flex items-center gap-1">Date <template v-if="sortField === 'createdAt'"><ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" /><ArrowDown v-else :size="12" class="text-[#4857FE]" /></template></div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredItems" :key="item.id" class="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group">
              <td class="px-5 py-3.5">
                <FavoriteStar entity-type="consumer_feedback" :entity-id="item.id" :product-id="productStore.activeProduct.id || ''" />
              </td>
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-2 min-w-0">
                  <component :is="typeIcon(item.type)" :size="14" :class="typeColor(item.type)" />
                  <span class="text-sm font-medium text-gray-900 truncate max-w-[300px]">{{ item.title }}</span>
                </div>
              </td>
              <td class="px-5 py-3.5">
                <span class="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md" :class="typeStyle(item.type)">
                  {{ label(item.type) }}
                </span>
              </td>
              <td class="px-5 py-3.5">
                <span class="inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-full" :class="statusStyle(item.status)">
                  {{ label(item.status) }}
                </span>
              </td>
              <td class="px-5 py-3.5">
                <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold" :class="priorityStyle(item.priority)">
                  {{ label(item.priority) }}
                </span>
              </td>
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-1.5">
                  <User :size="12" class="text-gray-400" />
                  <span class="text-sm text-gray-600 truncate max-w-[120px]">{{ item.reporterName || item.reporterEmail || 'Anonymous' }}</span>
                </div>
              </td>
              <td class="px-5 py-3.5">
                <div v-if="item.assignedToUser" class="flex items-center gap-1.5">
                  <img v-if="item.assignedToUser.avatar" :src="item.assignedToUser.avatar" class="w-5 h-5 rounded-full object-cover" />
                  <div v-else class="w-5 h-5 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[9px] font-semibold text-[#4857FE]">{{ item.assignedToUser.name[0] }}</div>
                  <span class="text-sm text-gray-600 truncate">{{ item.assignedToUser.name }}</span>
                </div>
                <span v-else class="text-sm text-gray-400">—</span>
              </td>
              <td class="px-3 py-3.5 text-center">
                <span class="text-sm text-gray-500">{{ item.attachmentCount || 0 }}</span>
              </td>
              <td class="px-5 py-3.5">
                <span class="text-sm text-gray-500">{{ timeAgo(item.createdAt) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Card View -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div
          v-for="item in filteredItems"
          :key="item.id"
          class="bg-white rounded-xl border border-gray-200/80 p-5 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group"
          @click="expandedCardId = expandedCardId === item.id ? null : item.id"
        >
          <!-- Header: type icon + title + status -->
          <div class="flex items-start justify-between gap-2 mb-2">
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="item.type === 'bug' ? 'bg-red-100' : item.type === 'feature' ? 'bg-purple-100' : 'bg-blue-100'">
                <component :is="typeIcon(item.type)" :size="14" :class="typeColor(item.type)" />
              </div>
              <h3 class="text-sm font-semibold text-gray-900 truncate group-hover:text-[#4857FE] transition-colors">{{ item.title }}</h3>
            </div>
            <span class="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0" :class="statusStyle(item.status)">
              {{ label(item.status) }}
            </span>
          </div>

          <!-- Description -->
          <p v-if="item.description" class="text-xs text-gray-500 line-clamp-2 mb-3">{{ item.description }}</p>

          <!-- Priority + Tags -->
          <div class="flex items-center gap-2 flex-wrap mb-3">
            <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold" :class="priorityStyle(item.priority)">{{ label(item.priority) }}</span>
            <span v-for="tag in (item.tags || []).slice(0, 2)" :key="tag" class="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{{ tag }}</span>
          </div>

          <!-- Expanded: steps, device info -->
          <div v-if="expandedCardId === item.id" class="border-t border-gray-100 pt-3 mb-3 space-y-2">
            <div v-if="item.stepsToReproduce" class="text-xs">
              <span class="font-medium text-gray-700">Steps to Reproduce:</span>
              <p class="text-gray-500 mt-0.5 whitespace-pre-line">{{ item.stepsToReproduce }}</p>
            </div>
            <div v-if="item.expectedBehavior" class="text-xs">
              <span class="font-medium text-gray-700">Expected:</span>
              <span class="text-gray-500 ml-1">{{ item.expectedBehavior }}</span>
            </div>
            <div v-if="item.actualBehavior" class="text-xs">
              <span class="font-medium text-gray-700">Actual:</span>
              <span class="text-gray-500 ml-1">{{ item.actualBehavior }}</span>
            </div>
            <div v-if="item.reporterBrowser || item.reporterOs || item.reporterDevice" class="flex items-center gap-3 text-[10px] text-gray-400">
              <span v-if="item.reporterBrowser" class="flex items-center gap-1"><Globe :size="10" /> {{ item.reporterBrowser }}</span>
              <span v-if="item.reporterOs" class="flex items-center gap-1"><Monitor :size="10" /> {{ item.reporterOs }}</span>
              <span v-if="item.reporterDevice" class="flex items-center gap-1"><Smartphone :size="10" /> {{ item.reporterDevice }}</span>
            </div>
            <div v-if="item.pageUrl" class="text-[10px] text-gray-400 flex items-center gap-1 truncate">
              <ExternalLink :size="10" /> {{ item.pageUrl }}
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between pt-3 border-t border-gray-100">
            <div class="flex items-center gap-1.5">
              <User :size="11" class="text-gray-400" />
              <span class="text-xs text-gray-500">{{ item.reporterName || item.reporterEmail || 'Anonymous' }}</span>
            </div>
            <div class="flex items-center gap-3">
              <div v-if="item.attachmentCount" class="flex items-center gap-1 text-xs text-gray-400">
                <Paperclip :size="11" /> {{ item.attachmentCount }}
              </div>
              <div v-if="item.commentCount" class="flex items-center gap-1 text-xs text-gray-400">
                <MessageSquare :size="11" /> {{ item.commentCount }}
              </div>
              <span class="text-[10px] text-gray-400">{{ timeAgo(item.createdAt) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Dialog -->
    <Teleport to="body">
      <div v-if="showCreateDialog" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" @click="showCreateDialog = false"></div>
        <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-auto p-6" @click.stop>
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold text-gray-900">Submit Feedback</h2>
            <button class="text-gray-400 hover:text-gray-600 cursor-pointer" @click="showCreateDialog = false"><X :size="20" /></button>
          </div>

          <form @submit.prevent="handleCreate" class="space-y-4">
            <!-- Type + Priority -->
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">Type</label>
                <select v-model="newType" class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#4857FE] bg-white">
                  <option value="bug">Bug Report</option>
                  <option value="feature">Feature Request</option>
                  <option value="enhancement">Enhancement</option>
                </select>
              </div>
              <div class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">Priority</label>
                <select v-model="newPriority" class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#4857FE] bg-white">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <!-- Title -->
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-gray-700">Title *</label>
              <input v-model="newTitle" placeholder="Brief summary of the issue or request" autofocus class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 placeholder-gray-400" />
            </div>

            <!-- Description -->
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-gray-700">Description</label>
              <textarea v-model="newDescription" placeholder="Provide more details..." rows="3" class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 placeholder-gray-400 resize-y"></textarea>
            </div>

            <!-- Steps / Expected / Actual (bug-specific) -->
            <div v-if="newType === 'bug'" class="space-y-3 bg-red-50/50 border border-red-100 rounded-xl p-4">
              <p class="text-xs font-semibold text-red-700 uppercase tracking-wider flex items-center gap-1"><Bug :size="12" /> Bug Details</p>
              <div class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">Steps to Reproduce</label>
                <textarea v-model="newSteps" placeholder="1. Go to...&#10;2. Click on...&#10;3. Observe..." rows="3" class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#4857FE] placeholder-gray-400 resize-y bg-white"></textarea>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1.5">
                  <label class="text-sm font-medium text-gray-700">Expected Behavior</label>
                  <textarea v-model="newExpected" placeholder="What should happen?" rows="2" class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] placeholder-gray-400 resize-y bg-white"></textarea>
                </div>
                <div class="space-y-1.5">
                  <label class="text-sm font-medium text-gray-700">Actual Behavior</label>
                  <textarea v-model="newActual" placeholder="What actually happens?" rows="2" class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] placeholder-gray-400 resize-y bg-white"></textarea>
                </div>
              </div>
              <div class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">Page URL</label>
                <input v-model="newPageUrl" placeholder="https://..." class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#4857FE] placeholder-gray-400 bg-white" />
              </div>
            </div>

            <!-- Reporter info -->
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">Reporter Name</label>
                <input v-model="newReporterName" placeholder="John Doe" class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#4857FE] placeholder-gray-400" />
              </div>
              <div class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">Reporter Email</label>
                <input v-model="newReporterEmail" placeholder="john@example.com" type="email" class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#4857FE] placeholder-gray-400" />
              </div>
            </div>

            <!-- Tags -->
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-gray-700">Tags</label>
              <div class="flex items-center gap-2 flex-wrap">
                <span v-for="tag in newTags" :key="tag" class="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-md">
                  {{ tag }} <button type="button" class="text-gray-400 hover:text-gray-600" @click="removeTag(tag)"><X :size="10" /></button>
                </span>
                <input v-model="newTagInput" placeholder="Add tag..." class="text-sm bg-transparent outline-none w-24 placeholder-gray-400" @keydown.enter.prevent="addTag" />
              </div>
            </div>

            <div class="flex justify-end gap-2 pt-2">
              <button type="button" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer" @click="showCreateDialog = false">Cancel</button>
              <button
                type="submit"
                :disabled="!newTitle.trim() || submitting || !canCreateFeedbacks"
                class="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                :class="canCreateFeedbacks
                  ? 'bg-[#4857FE] hover:bg-[#3E4BDE] text-white cursor-pointer'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'"
              >
                {{ submitting ? 'Submitting...' : 'Submit Feedback' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
