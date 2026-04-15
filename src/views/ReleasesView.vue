<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Rocket, Search, Plus, Loader2,
  LayoutList, LayoutGrid, ArrowUp, ArrowDown,
  Calendar, Package, Tag,
} from 'lucide-vue-next'
import { useReleasesStore } from '@/stores/releases'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { useRolesStore } from '@/stores/roles'
import CreateReleaseDialog from '@/components/release/CreateReleaseDialog.vue'
import type { Release } from '@/types/release'
import FavoriteStar from '@/components/shared/FavoriteStar.vue'

const router = useRouter()
const releasesStore = useReleasesStore()
const productStore = useProductStore()
const authStore = useAuthStore()
const rolesStore = useRolesStore()

const searchQuery = ref('')
const activeTab = ref<'all' | 'draft' | 'planned' | 'in_progress' | 'completed' | 'failed'>('all')
const viewMode = ref<'table' | 'card'>(localStorage.getItem('releases-view-mode') as 'table' | 'card' || 'table')
const showCreateDialog = ref(false)
const sortField = ref<string>('createdAt')
const sortDir = ref<'asc' | 'desc'>('desc')

watch(viewMode, (v) => {
  localStorage.setItem('releases-view-mode', v)
})

onMounted(() => {
  releasesStore.fetchReleases()
})

watch(() => productStore.activeIndex, () => {
  releasesStore.fetchReleases()
})

// Group by status
const releasesByStatus = computed(() => {
  let all = releasesStore.releases
  // Self-view-only: show only releases where user is manager or creator
  if (rolesStore.isSelfViewOnly('releases') && authStore.user) {
    const uid = authStore.user.id
    all = all.filter(r => r.releaseManagerId === uid || r.createdByUserId === uid)
  }
  return {
    all,
    draft: all.filter(r => r.status === 'draft'),
    planned: all.filter(r => r.status === 'planned'),
    in_progress: all.filter(r => r.status === 'in_progress'),
    completed: all.filter(r => r.status === 'completed'),
    failed: all.filter(r => r.status === 'failed'),
  }
})

const filteredReleases = computed(() => {
  let list = activeTab.value === 'all' ? releasesStore.releases : releasesByStatus.value[activeTab.value]
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(r =>
      r.title.toLowerCase().includes(q) ||
      r.code?.toLowerCase().includes(q) ||
      r.version?.toLowerCase().includes(q)
    )
  }
  // Sort
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...list].sort((a: any, b: any) => {
    const va = a[sortField.value] || ''
    const vb = b[sortField.value] || ''
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
    sortDir.value = 'asc'
  }
}

function statusStyle(status: string) {
  switch (status) {
    case 'draft': return 'bg-gray-400 text-white'
    case 'planned': return 'bg-[#a25ddc] text-white'
    case 'in_progress': return 'bg-[#fdab3d] text-white'
    case 'completed': return 'bg-[#00c875] text-white'
    case 'failed': return 'bg-[#e2445c] text-white'
    default: return 'bg-gray-400 text-white'
  }
}

function statusDotColor(status: string) {
  switch (status) {
    case 'draft': return 'bg-gray-400'
    case 'planned': return 'bg-[#a25ddc]'
    case 'in_progress': return 'bg-[#fdab3d]'
    case 'completed': return 'bg-[#00c875]'
    case 'failed': return 'bg-[#e2445c]'
    default: return 'bg-gray-400'
  }
}

function tabColor(key: string) {
  switch (key) {
    case 'all': return { active: 'text-[#4857FE] border-[#4857FE]', badge: 'bg-[#4857FE]/15 text-[#4857FE]' }
    case 'draft': return { active: 'text-gray-600 border-gray-400', badge: 'bg-gray-200 text-gray-600' }
    case 'planned': return { active: 'text-[#a25ddc] border-[#a25ddc]', badge: 'bg-[#a25ddc]/15 text-[#a25ddc]' }
    case 'in_progress': return { active: 'text-[#fdab3d] border-[#fdab3d]', badge: 'bg-[#fdab3d]/15 text-[#d48806]' }
    case 'completed': return { active: 'text-[#00c875] border-[#00c875]', badge: 'bg-[#00c875]/15 text-[#00a65a]' }
    case 'failed': return { active: 'text-[#e2445c] border-[#e2445c]', badge: 'bg-[#e2445c]/15 text-[#e2445c]' }
    default: return { active: 'text-gray-600 border-gray-400', badge: 'bg-gray-200 text-gray-600' }
  }
}

function typeStyle(type: string) {
  switch (type) {
    case 'feature': return 'bg-blue-50 text-blue-600'
    case 'hotfix': return 'bg-red-50 text-red-600'
    case 'patch': return 'bg-yellow-50 text-yellow-600'
    default: return 'bg-gray-50 text-gray-500'
  }
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function typeLabel(type: string) {
  return type.replace(/\b\w/g, l => l.toUpperCase())
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function goToRelease(id: string) {
  router.push(`/releases/${id}`)
}

function onReleaseCreated(id: string) {
  showCreateDialog.value = false
  router.push(`/releases/${id}`)
}

const columns = [
  { field: 'title', label: 'Title' },
  { field: 'code', label: 'Code' },
  { field: 'status', label: 'Status' },
  { field: 'releaseType', label: 'Type' },
  { field: 'version', label: 'Version' },
  { field: 'manager', label: 'Manager' },
  { field: 'plannedAt', label: 'Planned' },
  { field: 'deployments', label: 'Deployments' },
  { field: 'deliveries', label: 'Deliveries' },
]
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <!-- Page Header -->
    <div class="bg-white px-8 pt-7 pb-5 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
            <Rocket :size="18" class="text-[#4857FE]" />
          </div>
          <h1 class="text-lg font-semibold text-gray-900">Releases <span class="text-gray-400 font-normal">({{ releasesStore.releases.length }})</span></h1>
        </div>
        <div class="flex items-center gap-3">
          <button
            @click="showCreateDialog = true"
            class="flex items-center gap-1.5 bg-[#4857FE] hover:bg-[#3E4BDE] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <Plus :size="15" />
            New Release
          </button>
        </div>
      </div>
    </div>

    <!-- Status Tabs + View Toggle -->
    <div class="bg-white px-8 pt-4 pb-3 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1">
          <!-- All -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'all' ? tabColor('all').active : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'all'"
          >
            All
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center" :class="tabColor('all').badge">{{ releasesByStatus.all.length }}</span>
          </button>
          <!-- Draft -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'draft' ? tabColor('draft').active : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'draft'"
          >
            Draft
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center" :class="tabColor('draft').badge">{{ releasesByStatus.draft.length }}</span>
          </button>
          <!-- Planned -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'planned' ? tabColor('planned').active : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'planned'"
          >
            Planned
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center" :class="tabColor('planned').badge">{{ releasesByStatus.planned.length }}</span>
          </button>
          <!-- In Progress -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'in_progress' ? tabColor('in_progress').active : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'in_progress'"
          >
            In Progress
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center" :class="tabColor('in_progress').badge">{{ releasesByStatus.in_progress.length }}</span>
          </button>
          <!-- Completed -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'completed' ? tabColor('completed').active : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'completed'"
          >
            Completed
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center" :class="tabColor('completed').badge">{{ releasesByStatus.completed.length }}</span>
          </button>
          <!-- Failed -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer"
            :class="activeTab === 'failed' ? tabColor('failed').active : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = 'failed'"
          >
            Failed
            <span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center" :class="tabColor('failed').badge">{{ releasesByStatus.failed.length }}</span>
          </button>
        </div>

        <!-- Search + View Toggle -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20">
            <Search :size="14" class="text-gray-400 shrink-0" />
            <input
              v-model="searchQuery"
              class="text-sm text-gray-700 bg-transparent outline-none w-44 placeholder-gray-400"
              placeholder="Search releases..."
            />
          </div>
          <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              class="p-1.5 rounded-md transition-colors cursor-pointer"
              :class="viewMode === 'table' ? 'bg-white shadow-sm text-[#4857FE]' : 'text-gray-400 hover:text-gray-600'"
              @click="viewMode = 'table'"
              title="Table view"
            >
              <LayoutList :size="16" />
            </button>
            <button
              class="p-1.5 rounded-md transition-colors cursor-pointer"
              :class="viewMode === 'card' ? 'bg-white shadow-sm text-[#4857FE]' : 'text-gray-400 hover:text-gray-600'"
              @click="viewMode = 'card'"
              title="Card view"
            >
              <LayoutGrid :size="16" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto px-8 py-6">
      <!-- Loading -->
      <div v-if="releasesStore.loading" class="flex items-center justify-center py-20">
        <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredReleases.length === 0" class="flex flex-col items-center justify-center py-20">
        <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <Rocket :size="24" class="text-gray-400" />
        </div>
        <p class="text-gray-500 text-sm font-medium mb-1">No releases found</p>
        <p class="text-gray-400 text-xs">Create your first release to get started</p>
      </div>

      <!-- Table View -->
      <div v-else-if="viewMode === 'table'" class="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-100">
              <th
                v-for="col in columns"
                :key="col.field"
                class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider select-none"
                :class="['title', 'code', 'status', 'releaseType', 'version', 'plannedAt'].includes(col.field) ? 'cursor-pointer hover:text-gray-700' : ''"
                @click="['title', 'code', 'status', 'releaseType', 'version', 'plannedAt'].includes(col.field) && toggleSort(col.field)"
              >
                <div class="flex items-center gap-1">
                  {{ col.label }}
                  <template v-if="sortField === col.field">
                    <ArrowUp v-if="sortDir === 'asc'" :size="12" class="text-[#4857FE]" />
                    <ArrowDown v-else :size="12" class="text-[#4857FE]" />
                  </template>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="release in filteredReleases"
              :key="release.id"
              @click="goToRelease(release.id)"
              class="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
            >
              <!-- Title with status dot -->
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-2">
                  <FavoriteStar entity-type="release" :entity-id="release.id" :product-id="productStore.activeProductScopeForApi" />
                  <span class="w-2 h-2 rounded-full flex-shrink-0" :class="statusDotColor(release.status)"></span>
                  <span class="text-sm font-medium text-gray-900">{{ release.title }}</span>
                </div>
              </td>

              <!-- Code -->
              <td class="px-5 py-3.5">
                <span class="text-sm font-mono text-gray-500">{{ release.code || '—' }}</span>
              </td>

              <!-- Status -->
              <td class="px-5 py-3.5">
                <span class="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full" :class="statusStyle(release.status)">
                  {{ statusLabel(release.status) }}
                </span>
              </td>

              <!-- Type -->
              <td class="px-5 py-3.5">
                <span class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md" :class="typeStyle(release.releaseType)">
                  {{ typeLabel(release.releaseType) }}
                </span>
              </td>

              <!-- Version -->
              <td class="px-5 py-3.5">
                <span class="text-sm text-gray-600">{{ release.version || '—' }}</span>
              </td>

              <!-- Manager -->
              <td class="px-5 py-3.5">
                <div v-if="release.releaseManager" class="flex items-center gap-2">
                  <UploadAssetImg v-if="release.releaseManager.avatar" :src="release.releaseManager.avatar" :alt="release.releaseManager.name" class="w-6 h-6 rounded-full object-cover" />
                  <div v-else class="w-6 h-6 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[10px] font-semibold text-[#4857FE]">
                    {{ release.releaseManager.name.charAt(0).toUpperCase() }}
                  </div>
                  <span class="text-sm text-gray-600">{{ release.releaseManager.name }}</span>
                </div>
                <span v-else class="text-sm text-gray-400">—</span>
              </td>

              <!-- Planned Date -->
              <td class="px-5 py-3.5">
                <span class="text-sm text-gray-600">{{ formatDate(release.plannedAt) }}</span>
              </td>

              <!-- Deployments -->
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-1.5">
                  <template v-for="dep in (release.releaseDeployments || []).sort((a: any, b: any) => a.sequence - b.sequence)" :key="dep.id">
                    <span
                      class="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
                      :class="{
                        'bg-green-50 text-green-600': dep.status === 'deployed',
                        'bg-orange-50 text-orange-600': dep.status === 'deploying',
                        'bg-red-50 text-red-600': dep.status === 'failed',
                        'bg-purple-50 text-purple-600': dep.status === 'rolled_back',
                        'bg-gray-50 text-gray-500': dep.status === 'pending',
                      }"
                    >
                      {{ dep.environment }}
                    </span>
                  </template>
                </div>
              </td>

              <!-- Deliveries count -->
              <td class="px-5 py-3.5">
                <span class="text-sm text-gray-600">{{ (release.releaseDeliveries || []).length }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Card View -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="release in filteredReleases"
          :key="release.id"
          @click="goToRelease(release.id)"
          class="bg-white rounded-xl border border-gray-200/80 p-5 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all group"
        >
          <!-- Header: title + status badge -->
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="flex items-center gap-2 min-w-0">
              <FavoriteStar entity-type="release" :entity-id="release.id" :product-id="productStore.activeProductScopeForApi" />
              <span class="w-2 h-2 rounded-full flex-shrink-0" :class="statusDotColor(release.status)"></span>
              <h3 class="text-sm font-semibold text-gray-900 truncate group-hover:text-[#4857FE] transition-colors">{{ release.title }}</h3>
            </div>
            <span class="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap" :class="statusStyle(release.status)">
              {{ statusLabel(release.status) }}
            </span>
          </div>

          <!-- Code + Version + Type row -->
          <div class="flex items-center gap-2 mb-3">
            <span v-if="release.code" class="text-xs font-mono text-gray-400">{{ release.code }}</span>
            <span v-if="release.code && release.version" class="text-gray-300">·</span>
            <span v-if="release.version" class="text-xs text-gray-500">v{{ release.version }}</span>
            <span class="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded" :class="typeStyle(release.releaseType)">
              {{ typeLabel(release.releaseType) }}
            </span>
          </div>

          <!-- Deployments -->
          <div class="flex items-center gap-1.5 mb-3">
            <template v-for="dep in (release.releaseDeployments || []).sort((a: any, b: any) => a.sequence - b.sequence)" :key="dep.id">
              <span
                class="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
                :class="{
                  'bg-green-50 text-green-600': dep.status === 'deployed',
                  'bg-orange-50 text-orange-600': dep.status === 'deploying',
                  'bg-red-50 text-red-600': dep.status === 'failed',
                  'bg-purple-50 text-purple-600': dep.status === 'rolled_back',
                  'bg-gray-50 text-gray-500': dep.status === 'pending',
                }"
              >
                {{ dep.environment }}
              </span>
            </template>
          </div>

          <!-- Footer: manager + date + deliveries -->
          <div class="flex items-center justify-between pt-3 border-t border-gray-100">
            <div class="flex items-center gap-2">
              <template v-if="release.releaseManager">
                <UploadAssetImg v-if="release.releaseManager.avatar" :src="release.releaseManager.avatar" :alt="release.releaseManager.name" class="w-5 h-5 rounded-full object-cover" />
                <div v-else class="w-5 h-5 rounded-full bg-[#4857FE]/10 flex items-center justify-center text-[9px] font-semibold text-[#4857FE]">
                  {{ release.releaseManager.name.charAt(0).toUpperCase() }}
                </div>
                <span class="text-xs text-gray-500">{{ release.releaseManager.name }}</span>
              </template>
              <span v-else class="text-xs text-gray-400">No manager</span>
            </div>
            <div class="flex items-center gap-3">
              <div v-if="(release.releaseDeliveries || []).length > 0" class="flex items-center gap-1 text-xs text-gray-400">
                <Package :size="12" />
                {{ (release.releaseDeliveries || []).length }}
              </div>
              <span class="text-xs text-gray-400">{{ formatDate(release.plannedAt) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <CreateReleaseDialog v-model:open="showCreateDialog" @created="onReleaseCreated" />
  </div>
</template>
