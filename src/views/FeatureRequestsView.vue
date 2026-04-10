<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import {
  Lightbulb, Plus, Loader2, Search, ArrowUp, ArrowDown,
  LayoutList, LayoutGrid, ChevronUp, MessageSquare, Clock,
  Tag, X, ThumbsUp,
} from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { useRoute, useRouter } from 'vue-router'
import { useFeatureRequestsStore } from '@/stores/featureRequests'
import FavoriteStar from '@/components/shared/FavoriteStar.vue'
import type { FeatureRequestStatus, FeatureRequestCategory } from '@/types/featureRequest'

const productStore = useProductStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const store = useFeatureRequestsStore()

const searchQuery = ref('')
const activeTab = ref<'all' | 'open' | 'planned' | 'completed' | 'declined'>('all')
const viewMode = ref<'table' | 'card'>(localStorage.getItem('fr-view-mode') as any || 'card')
const sortField = ref<string>('upvoteCount')
const sortDir = ref<'asc' | 'desc'>('desc')
const showCreateDialog = ref(false)

// Create form
const newTitle = ref('')
const newDescription = ref('')
const newCategory = ref<FeatureRequestCategory>('enhancement')
const newTags = ref<string[]>([])
const newTagInput = ref('')
const submitting = ref(false)

watch(viewMode, (v) => localStorage.setItem('fr-view-mode', v))

onMounted(() => {
  store.fetchAll(productStore.activeProductName, 'votes')
  syncCreateDialogWithRoute()
})

watch(() => productStore.activeProductName, (p) => {
  store.fetchAll(p, 'votes')
})

watch(() => route.query.create, () => {
  syncCreateDialogWithRoute()
})

function syncCreateDialogWithRoute() {
  showCreateDialog.value = route.query.create === '1'
}

function openCreateDialog() {
  showCreateDialog.value = true
  router.replace({ path: route.path, query: { ...route.query, create: '1' } })
}

function closeCreateDialog() {
  showCreateDialog.value = false
  const { create, ...restQuery } = route.query
  void create
  router.replace({ path: route.path, query: restQuery })
}

const filteredItems = computed(() => {
  let list = store.items
  if (activeTab.value !== 'all') {
    list = list.filter(i => i.status === activeTab.value)
  }
  const q = searchQuery.value.toLowerCase().trim()
  if (q) {
    list = list.filter(i =>
      i.title.toLowerCase().includes(q) ||
      (i.description && i.description.toLowerCase().includes(q)) ||
      (i.tags && i.tags.some(t => t.toLowerCase().includes(q))) ||
      (i.createdByUser?.name && i.createdByUser.name.toLowerCase().includes(q))
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
    sortDir.value = field === 'upvoteCount' ? 'desc' : 'asc'
  }
}

const tabCounts = computed(() => ({
  all: store.items.length,
  open: store.items.filter(i => i.status === 'open').length,
  planned: store.items.filter(i => i.status === 'planned' || i.status === 'under_review').length,
  completed: store.items.filter(i => i.status === 'completed' || i.status === 'in_progress').length,
  declined: store.items.filter(i => i.status === 'declined').length,
}))

// Upvote
async function handleUpvote(id: string, e: Event) {
  e.stopPropagation()
  await store.toggleUpvote(id)
  await store.fetchAll(productStore.activeProductName, 'votes')
}

function isUpvotedByMe(item: any): boolean {
  return item.upvoterIds?.includes(authStore.user?.id) || false
}

// Create
function addTag() {
  const tag = newTagInput.value.trim()
  if (tag && !newTags.value.includes(tag)) {
    newTags.value.push(tag)
  }
  newTagInput.value = ''
}

function removeTag(tag: string) {
  newTags.value = newTags.value.filter(t => t !== tag)
}

async function handleCreate() {
  if (!newTitle.value.trim()) return
  submitting.value = true
  await store.create({
    productId: productStore.activeProductName,
    title: newTitle.value.trim(),
    description: newDescription.value.trim() || null,
    category: newCategory.value,
    tags: newTags.value.length > 0 ? newTags.value : null,
  })
  submitting.value = false
  closeCreateDialog()
  newTitle.value = ''
  newDescription.value = ''
  newCategory.value = 'enhancement'
  newTags.value = []
}

// Styling
function statusStyle(status: string) {
  switch (status) {
    case 'open': return 'bg-blue-100 text-blue-700'
    case 'under_review': return 'bg-yellow-100 text-yellow-700'
    case 'planned': return 'bg-purple-100 text-purple-700'
    case 'in_progress': return 'bg-orange-100 text-orange-700'
    case 'completed': return 'bg-green-100 text-green-700'
    case 'declined': return 'bg-red-100 text-red-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function categoryStyle(cat: string) {
  switch (cat) {
    case 'enhancement': return 'bg-blue-50 text-blue-600'
    case 'new_feature': return 'bg-purple-50 text-purple-600'
    case 'integration': return 'bg-cyan-50 text-cyan-600'
    case 'ux_improvement': return 'bg-pink-50 text-pink-600'
    case 'performance': return 'bg-orange-50 text-orange-600'
    default: return 'bg-gray-50 text-gray-500'
  }
}

function statusLabel(s: string) { return s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }
function categoryLabel(s: string) { return s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }

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
            <Lightbulb :size="18" class="text-[#4857FE]" />
          </div>
          <h1 class="text-lg font-semibold text-gray-900">Feature Requests <span class="text-gray-400 font-normal">({{ store.items.length }})</span></h1>
        </div>
        <button
          class="flex items-center gap-1.5 bg-[#4857FE] hover:bg-[#3E4BDE] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
          @click="openCreateDialog"
        >
          <Plus :size="15" />
          New Request
        </button>
      </div>
    </div>

    <!-- Tabs + Search + View Toggle -->
    <div class="bg-white px-8 pt-4 pb-3 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1">
          <button
            v-for="tab in (['all', 'open', 'planned', 'completed', 'declined'] as const)"
            :key="tab"
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === tab
              ? 'text-[#4857FE] border-[#4857FE]'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = tab"
          >
            {{ tab === 'all' ? 'All' : statusLabel(tab) }}
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center"
              :class="activeTab === tab ? 'bg-[#4857FE]/15 text-[#4857FE]' : 'bg-gray-200 text-gray-500'"
            >{{ tabCounts[tab] }}</span>
          </button>
        </div>

        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20">
            <Search :size="14" class="text-gray-400 shrink-0" />
            <input v-model="searchQuery" class="text-sm text-gray-700 bg-transparent outline-none w-44 placeholder-gray-400" placeholder="Search requests..." />
          </div>
          <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button class="p-1.5 rounded-md transition-colors cursor-pointer" :class="viewMode === 'table' ? 'bg-white shadow-sm text-[#4857FE]' : 'text-gray-400 hover:text-gray-600'" @click="viewMode = 'table'" title="Table view">
              <LayoutList :size="16" />
            </button>
            <button class="p-1.5 rounded-md transition-colors cursor-pointer" :class="viewMode === 'card' ? 'bg-white shadow-sm text-[#4857FE]' : 'text-gray-400 hover:text-gray-600'" @click="viewMode = 'card'" title="Card view">
              <LayoutGrid :size="16" />
            </button>
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
          <Lightbulb :size="24" class="text-gray-400" />
        </div>
        <p class="text-gray-500 text-sm font-medium mb-1">No feature requests yet</p>
        <p class="text-gray-400 text-xs mb-4">Submit a request to get started</p>
        <button class="flex items-center gap-1.5 px-4 py-2 bg-[#4857FE] text-white text-sm font-medium rounded-lg hover:bg-[#3E4BDE] transition-colors cursor-pointer" @click="openCreateDialog">
          <Plus :size="15" />
          New Request
        </button>
      </div>

      <!-- Card View (Leaderboard style) -->
      <div v-else-if="viewMode === 'card'" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <div
          v-for="(item, idx) in filteredItems"
          :key="item.id"
          class="bg-white rounded-xl border border-gray-200/80 hover:shadow-md hover:border-gray-300 transition-all group flex overflow-hidden"
        >
          <!-- Upvote strip (full height left side) -->
          <button
            class="flex flex-col items-center justify-center gap-0.5 px-3 min-w-[52px] border-r transition-all cursor-pointer shrink-0"
            :class="isUpvotedByMe(item)
              ? 'bg-[#4857FE]/10 border-[#4857FE]/20 text-[#4857FE]'
              : 'bg-gray-100 border-gray-200 text-gray-400 hover:bg-[#4857FE]/10 hover:text-[#4857FE]'"
            @click="handleUpvote(item.id, $event)"
          >
            <ThumbsUp v-if="isUpvotedByMe(item)" :size="18" class="text-[#4857FE]" />
            <ChevronUp v-else :size="18" />
            <span class="text-sm font-bold" :class="isUpvotedByMe(item) ? 'text-[#4857FE]' : 'text-gray-700'">{{ item.upvoteCount }}</span>
            <span class="text-[9px] uppercase tracking-wide" :class="isUpvotedByMe(item) ? 'text-[#4857FE]/60' : 'text-gray-400'">{{ isUpvotedByMe(item) ? 'voted' : 'votes' }}</span>
          </button>

          <!-- Content -->
          <div class="flex-1 p-4 flex flex-col min-w-0">
            <!-- Top: status + category -->
            <div class="flex items-center justify-between mb-2">
              <span class="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md" :class="categoryStyle(item.category)">
                <Tag :size="9" />
                {{ categoryLabel(item.category) }}
              </span>
              <span class="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full" :class="statusStyle(item.status)">
                {{ statusLabel(item.status) }}
              </span>
            </div>

            <!-- Title -->
            <div class="flex items-start gap-2 mb-1.5">
              <FavoriteStar entity-type="feature_request" :entity-id="item.id" :product-id="productStore.activeProductName" />
              <h3 class="text-sm font-semibold text-gray-900 group-hover:text-[#4857FE] transition-colors line-clamp-2">{{ item.title }}</h3>
            </div>

            <!-- Description -->
            <p v-if="item.description" class="text-xs text-gray-500 line-clamp-2 mb-3">{{ item.description }}</p>
            <div v-else class="mb-3"></div>

            <!-- Tags -->
            <div v-if="item.tags && item.tags.length > 0" class="flex items-center gap-1 flex-wrap mb-3">
              <span v-for="tag in item.tags.slice(0, 3)" :key="tag" class="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{{ tag }}</span>
              <span v-if="item.tags.length > 3" class="text-[10px] text-gray-400">+{{ item.tags.length - 3 }}</span>
            </div>

            <!-- Footer: comments, author -->
            <div class="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
              <div class="flex items-center gap-1 text-xs text-gray-400">
                <MessageSquare :size="11" />
                {{ item.commentCount || 0 }} comments
              </div>
              <div class="flex items-center gap-1.5">
                <template v-if="item.createdByUser">
                  <UploadAssetImg v-if="item.createdByUser.avatar" :src="item.createdByUser.avatar" class="w-5 h-5 rounded-full object-cover" />
                  <div v-else class="w-5 h-5 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[8px] font-semibold text-[#4857FE]">{{ item.createdByUser.name[0] }}</div>
                </template>
                <span class="text-[10px] text-gray-400">{{ timeAgo(item.createdAt) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Table View -->
      <div v-else class="bg-white rounded-xl border border-gray-200/80 overflow-hidden max-w-full">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-100">
              <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase w-16">Votes</th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" @click="toggleSort('title')">
                <div class="flex items-center gap-1">Title
                  <template v-if="sortField === 'title'"><ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" /><ArrowDown v-else :size="12" class="text-[#4857FE]" /></template>
                </div>
              </th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" @click="toggleSort('status')">
                <div class="flex items-center gap-1">Status
                  <template v-if="sortField === 'status'"><ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" /><ArrowDown v-else :size="12" class="text-[#4857FE]" /></template>
                </div>
              </th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Author</th>
              <th class="text-center px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                <MessageSquare :size="13" class="inline" />
              </th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" @click="toggleSort('createdAt')">
                <div class="flex items-center gap-1">Date
                  <template v-if="sortField === 'createdAt'"><ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" /><ArrowDown v-else :size="12" class="text-[#4857FE]" /></template>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in filteredItems"
              :key="item.id"
              class="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group"
            >
              <!-- Votes -->
              <td class="px-3 py-3.5 text-center">
                <button
                  class="inline-flex flex-col items-center gap-0 px-2 py-1 rounded-lg border transition-all cursor-pointer"
                  :class="isUpvotedByMe(item)
                    ? 'border-[#4857FE] bg-[#4857FE]/5 text-[#4857FE]'
                    : 'border-gray-200 hover:border-[#4857FE] text-gray-400 hover:text-[#4857FE]'"
                  @click="handleUpvote(item.id, $event)"
                >
                  <ChevronUp :size="14" />
                  <span class="text-xs font-bold" :class="isUpvotedByMe(item) ? 'text-[#4857FE]' : 'text-gray-700'">{{ item.upvoteCount }}</span>
                </button>
              </td>
              <!-- Title -->
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-2 min-w-0">
                  <FavoriteStar entity-type="feature_request" :entity-id="item.id" :product-id="productStore.activeProductName" />
                  <span class="text-sm font-medium text-gray-900 truncate">{{ item.title }}</span>
                </div>
              </td>
              <!-- Category -->
              <td class="px-5 py-3.5">
                <span class="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md" :class="categoryStyle(item.category)">
                  {{ categoryLabel(item.category) }}
                </span>
              </td>
              <!-- Status -->
              <td class="px-5 py-3.5">
                <span class="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full" :class="statusStyle(item.status)">
                  {{ statusLabel(item.status) }}
                </span>
              </td>
              <!-- Author -->
              <td class="px-5 py-3.5">
                <div v-if="item.createdByUser" class="flex items-center gap-2">
                  <UploadAssetImg v-if="item.createdByUser.avatar" :src="item.createdByUser.avatar" class="w-5 h-5 rounded-full object-cover" />
                  <div v-else class="w-5 h-5 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[9px] font-semibold text-[#4857FE]">{{ item.createdByUser.name[0] }}</div>
                  <span class="text-sm text-gray-600">{{ item.createdByUser.name }}</span>
                </div>
              </td>
              <!-- Comments -->
              <td class="px-5 py-3.5 text-center">
                <span class="text-sm text-gray-500">{{ item.commentCount || 0 }}</span>
              </td>
              <!-- Date -->
              <td class="px-5 py-3.5">
                <span class="text-sm text-gray-500">{{ timeAgo(item.createdAt) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create Dialog -->
    <Teleport to="body">
      <div v-if="showCreateDialog" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" @click="closeCreateDialog"></div>
        <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6" @click.stop>
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold text-gray-900">New Feature Request</h2>
            <button class="text-gray-400 hover:text-gray-600 cursor-pointer" @click="closeCreateDialog"><X :size="20" /></button>
          </div>

          <form @submit.prevent="handleCreate" class="space-y-4">
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-gray-700">Title *</label>
              <input v-model="newTitle" placeholder="What feature would you like?" autofocus class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 placeholder-gray-400" />
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-medium text-gray-700">Description</label>
              <textarea v-model="newDescription" placeholder="Describe the feature and why it would be useful..." rows="4" class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 placeholder-gray-400 resize-y"></textarea>
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-medium text-gray-700">Category</label>
              <select v-model="newCategory" class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#4857FE] bg-white">
                <option value="enhancement">Enhancement</option>
                <option value="new_feature">New Feature</option>
                <option value="integration">Integration</option>
                <option value="ux_improvement">UX Improvement</option>
                <option value="performance">Performance</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-medium text-gray-700">Tags</label>
              <div class="flex items-center gap-2 flex-wrap">
                <span v-for="tag in newTags" :key="tag" class="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-md">
                  {{ tag }}
                  <button type="button" class="text-gray-400 hover:text-gray-600" @click="removeTag(tag)"><X :size="10" /></button>
                </span>
                <input v-model="newTagInput" placeholder="Add tag..." class="text-sm bg-transparent outline-none w-24 placeholder-gray-400" @keydown.enter.prevent="addTag" />
              </div>
            </div>

            <div class="flex justify-end gap-2 pt-2">
              <button type="button" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer" @click="closeCreateDialog">Cancel</button>
              <button type="submit" :disabled="!newTitle.trim() || submitting" class="px-4 py-2 text-sm font-medium bg-[#4857FE] hover:bg-[#3E4BDE] text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50">
                {{ submitting ? 'Submitting...' : 'Submit Request' }}
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
