<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  BookOpen, Search, Plus, ChevronRight, ChevronDown,
  FileText, Clock, User2, Edit3, X, Tag, Eye,
  Link2, Trash2, Globe, Lock, Shield, Loader2,
} from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { useWikiStore } from '@/stores/wiki'
import { usePagePermissions } from '@/lib/pagePermissions'
import { STORAGE_KEYS } from '@/constants/storageKeys'
import { storageGetJson, storageSetJson } from '@/lib/browserStorage'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import CreateAssetDialog from '@/components/wiki/CreateAssetDialog.vue'
import type { Asset, AssetType } from '@/types/wiki'

const productStore = useProductStore()
const authStore = useAuthStore()
const wikiStore = useWikiStore()
const router = useRouter()
const route = useRoute()
const wikiPermissions = usePagePermissions('wiki')
const canCreateWikiAssets = computed(() => wikiPermissions.canCreate.value)
const canEditWikiAssets = computed(() => wikiPermissions.canEdit.value)
const canDeleteWikiAssets = computed(() => wikiPermissions.canDelete.value)
const activeProductRef = computed(() => productStore.activeProduct.id)

const searchQuery = ref('')
const isEditing = ref(false)
const editContent = ref('')
const editTitle = ref('')
const editDescription = ref('')
const showCreateDialog = ref(false)
const showDiffModal = ref(false)
const selectedRevisionId = ref<string | null>(null)
const diffLoading = ref(false)

// Category collapse state — persisted to localStorage
const STORAGE_KEY_CAT = STORAGE_KEYS.wiki.expandedCategories
const STORAGE_KEY_TYPE = STORAGE_KEYS.wiki.expandedTypes

function loadJson(key: string, fallback: Record<string, boolean>): Record<string, boolean> {
  return storageGetJson<Record<string, boolean>>(key, fallback)
}

function routeAssetId(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

async function syncAssetQuery(assetId: string | null) {
  const current = routeAssetId(route.query.asset)
  const normalized = assetId || ''
  if (current === normalized) return

  const nextQuery: Record<string, any> = { ...route.query }
  if (normalized) {
    nextQuery.asset = normalized
  } else {
    delete nextQuery.asset
  }
  await router.replace({ path: '/wiki', query: nextQuery })
}

const expandedCategories = ref<Record<string, boolean>>(loadJson(STORAGE_KEY_CAT, { engineering: true, product: true, business: true, external: true }))
const expandedTypes = ref<Record<string, boolean>>(loadJson(STORAGE_KEY_TYPE, {}))

onMounted(async () => {
  const product = activeProductRef.value
  await Promise.all([
    wikiStore.fetchAssetTypes(product),
    wikiStore.fetchAssets(product),
  ])
  const requestedAssetId = routeAssetId(route.query.asset)
  if (requestedAssetId) {
    const requestedAsset = wikiStore.assets.find((asset) => asset.id === requestedAssetId)
    if (requestedAsset) {
      await selectAsset(requestedAsset, { syncQuery: false })
      return
    }
  }

  // Auto-select first asset when no deep-link target is present.
  if (wikiStore.assets.length > 0 && !wikiStore.selectedAsset) {
    const firstAsset = wikiStore.assets[0]
    if (firstAsset) {
      await selectAsset(firstAsset)
    }
  }
})

watch(() => activeProductRef.value, async (product) => {
  await Promise.all([
    wikiStore.fetchAssetTypes(product),
    wikiStore.fetchAssets(product),
  ])
  wikiStore.selectedAsset = null
  selectedRevisionId.value = null
  showDiffModal.value = false
  await syncAssetQuery(null)
})

// Group types by category
const categoryGroups = computed(() => {
  const groups: Record<string, { label: string; types: (AssetType & { assets: Asset[] })[] }> = {
    engineering: { label: 'Engineering / Infra', types: [] },
    product: { label: 'Product / UX', types: [] },
    business: { label: 'Business / Knowledge', types: [] },
    external: { label: 'External / Integration', types: [] },
  }

  for (const at of wikiStore.assetTypes) {
    const cat = groups[at.category] || groups['business']
    const typeAssets = wikiStore.assets.filter(a => a.assetTypeId === at.id)

    // Apply search filter
    let filtered = typeAssets
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase()
      filtered = typeAssets.filter(a =>
        a.title.toLowerCase().includes(q) ||
        (a.description && a.description.toLowerCase().includes(q)) ||
        (a.tags && a.tags.some(t => t.toLowerCase().includes(q)))
      )
    }

    if (cat && filtered.length > 0) {
      cat.types.push({ ...at, assets: filtered })
    }
  }

  // Filter out empty categories
  return Object.entries(groups)
    .filter(([_, g]) => g.types.length > 0)
    .map(([key, g]) => ({ key, ...g }))
})

const totalAssets = computed(() => wikiStore.assets.length)
const selected = computed(() => wikiStore.selectedAsset)
const assetRevisions = computed(() => {
  if (!selected.value) return []
  return wikiStore.revisionsByAsset[selected.value.id] || []
})

const selectedRevision = computed(() =>
  assetRevisions.value.find((revision) => revision.id === selectedRevisionId.value) || null,
)

const revisionDiff = computed(() => {
  if (!selected.value) return null
  return wikiStore.revisionDiffByAsset[selected.value.id] || null
})

function toggleCategory(key: string) {
  expandedCategories.value[key] = !expandedCategories.value[key]
  storageSetJson(STORAGE_KEY_CAT, expandedCategories.value)
}

function toggleType(typeId: string) {
  expandedTypes.value[typeId] = !expandedTypes.value[typeId]
  storageSetJson(STORAGE_KEY_TYPE, expandedTypes.value)
}

function isTypeExpanded(typeId: string) {
  return expandedTypes.value[typeId] !== false // default expanded
}

async function selectAsset(asset: Asset, options: { syncQuery?: boolean } = {}) {
  await wikiStore.fetchAsset(asset.id)
  await wikiStore.fetchRevisions(asset.id)
  selectedRevisionId.value = (wikiStore.revisionsByAsset[asset.id] || [])[0]?.id || null
  isEditing.value = false
  showDiffModal.value = false
  if (options.syncQuery !== false) {
    await syncAssetQuery(asset.id)
  }
}

function startEditing() {
  if (!canEditWikiAssets.value) return
  if (wikiStore.selectedAsset) {
    editTitle.value = wikiStore.selectedAsset.title
    editDescription.value = wikiStore.selectedAsset.description || ''
    editContent.value = wikiStore.selectedAsset.content || ''
    isEditing.value = true
  }
}

async function saveEditing() {
  if (!canEditWikiAssets.value) return
  if (wikiStore.selectedAsset) {
    await wikiStore.updateAsset(wikiStore.selectedAsset.id, {
      title: editTitle.value,
      description: editDescription.value || null,
      content: editContent.value || null,
      changeSummary: 'Updated from wiki editor',
    })
    await wikiStore.fetchAssets(activeProductRef.value)
    await wikiStore.fetchAsset(wikiStore.selectedAsset.id)
    await wikiStore.fetchRevisions(wikiStore.selectedAsset.id)
    selectedRevisionId.value = (wikiStore.revisionsByAsset[wikiStore.selectedAsset.id] || [])[0]?.id || null
    isEditing.value = false
  }
}

function cancelEditing() {
  isEditing.value = false
}

async function deleteAsset() {
  if (!canDeleteWikiAssets.value) return
  if (wikiStore.selectedAsset && confirm('Delete this asset? This cannot be undone.')) {
    await wikiStore.deleteAsset(wikiStore.selectedAsset.id)
    await wikiStore.fetchAssets(activeProductRef.value)
    if (wikiStore.assets.length > 0) {
      const firstAsset = wikiStore.assets[0]
      if (firstAsset) {
        await selectAsset(firstAsset)
      }
    } else {
      selectedRevisionId.value = null
      showDiffModal.value = false
      await syncAssetQuery(null)
    }
  }
}

async function onAssetCreated() {
  showCreateDialog.value = false
  await wikiStore.fetchAssets(activeProductRef.value)
  // Select the newly created asset
  if (wikiStore.assets.length > 0) {
    const firstAsset = wikiStore.assets[0]
    if (firstAsset) {
      await selectAsset(firstAsset)
    }
  }
}

watch(() => route.query.asset, async (queryAssetValue) => {
  const assetId = routeAssetId(queryAssetValue)
  if (!assetId) return
  if (wikiStore.selectedAsset?.id === assetId) return

  const existing = wikiStore.assets.find((asset) => asset.id === assetId)
  if (existing) {
    await selectAsset(existing, { syncQuery: false })
    return
  }

  const fetched = await wikiStore.fetchAsset(assetId)
  if (!fetched) return
  await wikiStore.fetchRevisions(assetId)
  selectedRevisionId.value = (wikiStore.revisionsByAsset[assetId] || [])[0]?.id || null
  isEditing.value = false
  showDiffModal.value = false
})

function statusStyle(status: string) {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-700'
    case 'draft': return 'bg-gray-100 text-gray-600'
    case 'deprecated': return 'bg-red-100 text-red-700'
    case 'archived': return 'bg-gray-100 text-gray-400'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function statusDot(status: string) {
  switch (status) {
    case 'active': return 'bg-green-500'
    case 'draft': return 'bg-gray-400'
    case 'deprecated': return 'bg-red-500'
    case 'archived': return 'bg-gray-300'
    default: return 'bg-gray-400'
  }
}

function visibilityIcon(v: string) {
  switch (v) {
    case 'public': return Globe
    case 'internal': return Eye
    case 'private': return Lock
    default: return Eye
  }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRelative(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(dateStr)
}

function renderContent(content: string): string {
  return sanitizeHtml(content)
}

function diffLineClass(type: 'context' | 'add' | 'remove') {
  if (type === 'add') return 'bg-green-50 text-green-800'
  if (type === 'remove') return 'bg-red-50 text-red-800'
  return 'text-gray-600'
}

async function openRevisionDiff(revisionId: string) {
  if (!selected.value) return
  selectedRevisionId.value = revisionId
  showDiffModal.value = true
  diffLoading.value = true

  const targetRevision = assetRevisions.value.find((revision) => revision.id === revisionId)
  const baseRevision = targetRevision
    ? assetRevisions.value
      .filter((revision) => revision.revisionNumber < targetRevision.revisionNumber)
      .sort((a, b) => b.revisionNumber - a.revisionNumber)[0]
    : undefined

  await wikiStore.fetchRevisionDiff(selected.value.id, revisionId, baseRevision?.id)
  diffLoading.value = false
}

async function restoreFromRevision(revisionId: string) {
  if (!selected.value) return
  const revision = assetRevisions.value.find((item) => item.id === revisionId)
  if (!revision) return

  const summaryInput = prompt(
    'Restore summary (optional)',
    `Restored from revision #${revision.revisionNumber}`,
  )
  if (summaryInput === null) return

  const restored = await wikiStore.restoreRevision(
    selected.value.id,
    revisionId,
    summaryInput.trim() || undefined,
  )
  if (!restored) return

  await Promise.all([
    wikiStore.fetchAsset(selected.value.id),
    wikiStore.fetchAssets(activeProductRef.value),
    wikiStore.fetchRevisions(selected.value.id),
  ])
  selectedRevisionId.value = (wikiStore.revisionsByAsset[selected.value.id] || [])[0]?.id || null
  showDiffModal.value = false
  isEditing.value = false
}

</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <!-- Page Header -->
    <div class="bg-white px-8 py-5 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
            <BookOpen :size="18" class="text-[#4857FE]" />
          </div>
          <div>
            <h1 class="text-xl font-semibold text-gray-900">Wiki <span class="text-gray-400 font-normal text-base ml-1">({{ totalAssets }})</span></h1>
            <p class="text-sm text-gray-400 mt-0.5">{{ productStore.activeProduct.name }}</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 w-64">
            <Search :size="14" class="text-gray-400 shrink-0" />
            <input
              v-model="searchQuery"
              class="text-sm text-gray-700 bg-transparent outline-none w-full placeholder-gray-400"
              placeholder="Search assets..."
            />
          </div>
          <button
            class="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            :class="canCreateWikiAssets
              ? 'bg-[#4857FE] hover:bg-[#3E4BDE] text-white cursor-pointer'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'"
            :disabled="!canCreateWikiAssets"
            :title="wikiPermissions.deniedReason('create', 'wiki assets') || 'New asset'"
            @click="showCreateDialog = true"
          >
            <Plus :size="15" />
            New Asset
          </button>
        </div>
      </div>
    </div>

    <!-- Two-column layout -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Left: Asset Tree -->
      <aside class="w-[280px] bg-white border-r border-gray-100 overflow-y-auto flex-shrink-0">
        <div class="p-4">
          <!-- Loading -->
          <div v-if="wikiStore.loading" class="flex items-center justify-center py-8">
            <Loader2 :size="20" class="animate-spin text-[#4857FE]" />
          </div>

          <template v-else>
            <div v-for="group in categoryGroups" :key="group.key" class="mb-4">
              <!-- Category header -->
              <button
                class="w-full flex items-center gap-1.5 px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 cursor-pointer"
                @click="toggleCategory(group.key)"
              >
                <component :is="expandedCategories[group.key] ? ChevronDown : ChevronRight" :size="12" />
                {{ group.label }}
              </button>

              <div v-if="expandedCategories[group.key]">
                <div v-for="at in group.types" :key="at.id" class="mb-0.5">
                  <!-- Type header -->
                  <button
                    class="w-full flex items-center gap-2 px-2 py-2 rounded-md text-[13px] hover:bg-gray-50 cursor-pointer transition-colors"
                    :class="isTypeExpanded(at.id) ? 'text-gray-800' : 'text-gray-500'"
                    @click="toggleType(at.id)"
                  >
                    <span class="text-[13px]">{{ at.icon }}</span>
                    <span class="flex-1 text-left truncate font-medium">{{ at.name }}</span>
                    <span class="text-[11px] text-gray-400 tabular-nums">{{ at.assets.length }}</span>
                    <component :is="isTypeExpanded(at.id) ? ChevronDown : ChevronRight" :size="12" class="text-gray-400" />
                  </button>

                  <!-- Assets -->
                  <ul v-if="isTypeExpanded(at.id) && at.assets.length > 0" class="ml-5 pl-2 border-l border-gray-100 space-y-0.5 mb-1">
                    <li
                      v-for="asset in at.assets"
                      :key="asset.id"
                      class="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] cursor-pointer transition-colors"
                      :class="selected?.id === asset.id
                        ? 'bg-[#4857FE]/8 text-[#4857FE] font-medium'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
                      @click="selectAsset(asset)"
                    >
                      <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" :class="statusDot(asset.status)"></span>
                      <span class="truncate">{{ asset.title }}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- Empty -->
            <div v-if="categoryGroups.length === 0" class="text-center py-8">
              <p class="text-sm text-gray-400">No assets found</p>
            </div>
          </template>
        </div>
      </aside>

      <!-- Right: Content Area -->
      <main class="flex-1 overflow-y-auto">
        <div v-if="selected" class="max-w-[860px] mx-auto px-10 py-8">
          <!-- Breadcrumb -->
          <div class="flex items-center gap-1.5 text-xs text-gray-400 mb-5">
            <BookOpen :size="12" />
            <span>Wiki</span>
            <ChevronRight :size="12" />
            <span v-if="selected.assetType">{{ selected.assetType.icon }} {{ selected.assetType.name }}</span>
            <ChevronRight :size="12" />
            <span class="text-gray-600 font-medium">{{ selected.title }}</span>
          </div>

          <!-- Title + Meta -->
          <div class="flex items-start justify-between gap-4 mb-6">
            <div class="flex-1">
              <!-- Editing title -->
              <template v-if="isEditing">
                <input
                  v-model="editTitle"
                  class="text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-[#4857FE] outline-none w-full pb-1 mb-2"
                />
                <input
                  v-model="editDescription"
                  class="text-sm text-gray-500 bg-transparent border-b border-gray-200 outline-none w-full pb-1"
                  placeholder="Short description..."
                />
              </template>
              <template v-else>
                <h1 class="text-2xl font-bold text-gray-900 flex items-center gap-3">
                  <span v-if="selected.assetType?.icon" class="text-2xl">{{ selected.assetType.icon }}</span>
                  {{ selected.title }}
                </h1>
                <p v-if="selected.description" class="text-sm text-gray-500 mt-1">{{ selected.description }}</p>
              </template>

              <!-- Meta row -->
              <div class="flex items-center gap-3 mt-3 flex-wrap">
                <span class="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full" :class="statusStyle(selected.status)">
                  {{ selected.status.charAt(0).toUpperCase() + selected.status.slice(1) }}
                </span>
                <span class="inline-flex items-center gap-1 text-[11px] text-gray-400">
                  <component :is="visibilityIcon(selected.visibility)" :size="11" />
                  {{ selected.visibility }}
                </span>
                <span v-if="selected.ownerUser" class="inline-flex items-center gap-1.5 text-xs text-gray-500">
                  <img v-if="selected.ownerUser.avatar" :src="selected.ownerUser.avatar" class="w-4 h-4 rounded-full object-cover" />
                  <User2 v-else :size="12" class="text-gray-400" />
                  {{ selected.ownerUser.name }}
                </span>
                <span class="inline-flex items-center gap-1 text-xs text-gray-400">
                  <Clock :size="11" />
                  {{ formatRelative(selected.updatedAt) }}
                </span>
              </div>

              <!-- Tags -->
              <div v-if="selected.tags && selected.tags.length > 0" class="flex items-center gap-1.5 mt-3 flex-wrap">
                <span
                  v-for="tag in selected.tags"
                  :key="tag"
                  class="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"
                >
                  <Tag :size="10" />
                  {{ tag }}
                </span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-1.5 shrink-0">
              <template v-if="isEditing">
                <button
                  class="px-3 py-1.5 bg-[#4857FE] hover:bg-[#3E4BDE] text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                  @click="saveEditing"
                >Save</button>
                <button
                  class="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                  @click="cancelEditing"
                >Cancel</button>
              </template>
              <template v-else>
                <button
                  class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors"
                  :class="canEditWikiAssets
                    ? 'text-gray-500 hover:text-[#4857FE] hover:bg-[#4857FE]/5 cursor-pointer'
                    : 'text-gray-300 cursor-not-allowed'"
                  :disabled="!canEditWikiAssets"
                  :title="wikiPermissions.deniedReason('edit', 'wiki assets') || 'Edit asset'"
                  @click="startEditing"
                >
                  <Edit3 :size="14" />
                  Edit
                </button>
                <button
                  class="p-1.5 rounded-lg transition-colors"
                  :class="canDeleteWikiAssets
                    ? 'text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer'
                    : 'text-gray-300 cursor-not-allowed'"
                  :disabled="!canDeleteWikiAssets"
                  :title="wikiPermissions.deniedReason('delete', 'wiki assets') || 'Delete asset'"
                  @click="deleteAsset"
                >
                  <Trash2 :size="14" />
                </button>
              </template>
            </div>
          </div>

          <!-- Content -->
          <div v-if="isEditing" class="mt-6">
            <textarea
              v-model="editContent"
              class="w-full min-h-[500px] text-sm text-gray-700 leading-relaxed bg-white border border-gray-200 rounded-xl p-5 outline-none focus:border-[#4857FE] focus:ring-1 focus:ring-[#4857FE]/20 resize-y font-mono"
              placeholder="Write content using markdown..."
            ></textarea>
          </div>
          <div v-else-if="selected.content" class="mt-6 border-t border-gray-100 pt-6">
            <div class="text-sm text-gray-600 leading-relaxed wiki-content" v-html="renderContent(selected.content)"></div>
          </div>
          <div v-else class="mt-6 border-t border-gray-100 pt-6 text-center py-12">
            <p class="text-sm text-gray-400">No content yet.</p>
            <button
              class="mt-2 text-sm transition-colors"
              :class="canEditWikiAssets ? 'text-[#4857FE] hover:underline cursor-pointer' : 'text-gray-300 cursor-not-allowed'"
              :disabled="!canEditWikiAssets"
              :title="wikiPermissions.deniedReason('edit', 'wiki assets') || 'Add content'"
              @click="startEditing"
            >Add content</button>
          </div>

          <!-- Revision History -->
          <div class="mt-8 border-t border-gray-100 pt-6">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-gray-700">Revision History</h3>
              <span class="text-xs text-gray-400">{{ assetRevisions.length }} revisions</span>
            </div>

            <div v-if="assetRevisions.length === 0" class="text-sm text-gray-400 py-2">
              No revisions available.
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="revision in assetRevisions"
                :key="revision.id"
                class="border border-gray-200 rounded-lg px-3 py-2.5"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-gray-800 truncate">
                      Revision #{{ revision.revisionNumber }}
                    </p>
                    <p class="text-xs text-gray-500 mt-0.5">
                      {{ revision.changeSummary || 'No summary provided' }}
                    </p>
                    <p class="text-[11px] text-gray-400 mt-1">
                      {{ revision.changedByUser?.name || 'Unknown user' }} • {{ formatRelative(revision.createdAt) }}
                    </p>
                  </div>
                  <div class="flex items-center gap-1 shrink-0">
                    <button
                      class="px-2.5 py-1 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
                      @click="openRevisionDiff(revision.id)"
                    >
                      Diff
                    </button>
                    <button
                      class="px-2.5 py-1 text-xs rounded-md border border-[#4857FE]/30 text-[#4857FE] hover:bg-[#4857FE]/5 disabled:opacity-40"
                      :disabled="!canEditWikiAssets"
                      :title="wikiPermissions.deniedReason('edit', 'wiki assets') || 'Restore this revision'"
                      @click="restoreFromRevision(revision.id)"
                    >
                      Restore
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Relations -->
          <div v-if="selected.sourceRelations?.length || selected.targetRelations?.length" class="mt-8 border-t border-gray-100 pt-6">
            <h3 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <Link2 :size="14" class="text-gray-400" />
              Related Assets
            </h3>
            <div class="grid grid-cols-2 gap-2">
              <div
                v-for="rel in [...(selected.sourceRelations || []), ...(selected.targetRelations || [])]"
                :key="rel.id"
                class="flex items-center gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                @click="selectAsset(rel.targetAsset || rel.sourceAsset as any)"
              >
                <span class="text-sm">{{ (rel.targetAsset || rel.sourceAsset)?.assetType?.icon || '📄' }}</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 truncate">{{ (rel.targetAsset || rel.sourceAsset)?.title }}</p>
                  <p class="text-[10px] text-gray-400">{{ rel.relationType.replace(/_/g, ' ') }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Children -->
          <div v-if="selected.children?.length" class="mt-8 border-t border-gray-100 pt-6">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">Child Assets</h3>
            <div class="space-y-1">
              <div
                v-for="child in selected.children"
                :key="child.id"
                class="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                @click="selectAsset(child)"
              >
                <span class="text-sm">{{ child.assetType?.icon || '📄' }}</span>
                <span class="text-sm font-medium text-gray-800">{{ child.title }}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full" :class="statusStyle(child.status)">{{ child.status }}</span>
              </div>
            </div>
          </div>

          <!-- Footer metadata -->
          <div class="mt-8 border-t border-gray-100 pt-4 flex items-center gap-4 text-xs text-gray-400">
            <span v-if="selected.createdByUser">Created by {{ selected.createdByUser.name }}</span>
            <span>Created {{ formatDate(selected.createdAt) }}</span>
            <span>Updated {{ formatDate(selected.updatedAt) }}</span>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="flex flex-col items-center justify-center h-full">
          <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <BookOpen :size="28" class="text-gray-400" />
          </div>
          <p class="text-gray-500 text-sm font-medium mb-1">Select an asset</p>
          <p class="text-gray-400 text-xs mb-4">Choose an asset from the sidebar to view its details</p>
          <button
            class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            :class="canCreateWikiAssets
              ? 'bg-[#4857FE] text-white hover:bg-[#3E4BDE] cursor-pointer'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'"
            :disabled="!canCreateWikiAssets"
            :title="wikiPermissions.deniedReason('create', 'wiki assets') || 'Create first asset'"
            @click="showCreateDialog = true"
          >
            <Plus :size="15" />
            Create First Asset
          </button>
        </div>
      </main>
    </div>

    <!-- Revision Diff Modal -->
    <div
      v-if="showDiffModal"
      class="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
      @click.self="showDiffModal = false"
    >
      <div class="w-full max-w-[900px] max-h-[85vh] bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden flex flex-col">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 class="text-sm font-semibold text-gray-900">
              Revision Diff
              <span v-if="selectedRevision" class="text-gray-500 font-normal ml-1">#{{ selectedRevision.revisionNumber }}</span>
            </h3>
            <p class="text-xs text-gray-400 mt-1">
              Compare revision metadata and content changes.
            </p>
          </div>
          <button class="p-1.5 rounded hover:bg-gray-100 text-gray-500" @click="showDiffModal = false">
            <X :size="14" />
          </button>
        </div>

        <div v-if="diffLoading" class="flex-1 flex items-center justify-center">
          <Loader2 :size="20" class="animate-spin text-[#4857FE]" />
        </div>
        <div v-else-if="!revisionDiff" class="flex-1 flex items-center justify-center text-sm text-gray-400">
          No diff data available.
        </div>
        <div v-else class="flex-1 overflow-auto p-5 space-y-4">
          <div>
            <h4 class="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Field Changes</h4>
            <div v-if="revisionDiff.fields.length === 0" class="text-sm text-gray-400">No metadata field changes.</div>
            <div v-else class="space-y-2">
              <div
                v-for="field in revisionDiff.fields"
                :key="field.field"
                class="border border-gray-200 rounded-md px-3 py-2"
              >
                <p class="text-xs font-medium text-gray-700">{{ field.field }}</p>
                <p class="text-[11px] text-gray-500 mt-1">
                  <span class="text-red-600">From:</span> {{ field.from || 'Empty' }}
                </p>
                <p class="text-[11px] text-gray-500 mt-0.5">
                  <span class="text-green-600">To:</span> {{ field.to || 'Empty' }}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h4 class="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Content Diff</h4>
            <div v-if="revisionDiff.contentDiff.length === 0" class="text-sm text-gray-400">No content differences.</div>
            <div v-else class="border border-gray-200 rounded-md overflow-hidden">
              <div
                v-for="(line, index) in revisionDiff.contentDiff"
                :key="`${index}-${line.type}-${line.line}`"
                class="px-3 py-1.5 font-mono text-[12px]"
                :class="diffLineClass(line.type)"
              >
                {{ line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ' }} {{ line.line }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Asset Dialog -->
    <CreateAssetDialog
      v-model:open="showCreateDialog"
      @created="onAssetCreated"
    />
  </div>
</template>

<style scoped>
.wiki-content :deep(h1),
.wiki-content :deep(h2),
.wiki-content :deep(h3) {
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}
.wiki-content :deep(li) {
  margin-bottom: 0.25rem;
}
.wiki-content :deep(code) {
  font-size: 0.8125rem;
}
</style>
