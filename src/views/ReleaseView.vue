<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, Loader2, Pencil, Check, X, Plus,
  Rocket, Package, Calendar, User2, Tag, FileText,
  Trash2, Search, Sparkles,
} from 'lucide-vue-next'
import { useReleasesStore } from '@/stores/releases'
import { useDeliveriesStore } from '@/stores/deliveries'
import { usePagePermissions } from '@/lib/pagePermissions'
import type { Release, ReleaseDeployment, TargetStatus, Environment } from '@/types/release'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import { useDomainOptions } from '@/composables/useDomainOptions'
import { useDomainPresentation } from '@/composables/useDomainPresentation'
import { formatDateWithYear } from '@/lib/locale'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import DeploymentEnvironmentCard from '@/components/release/DeploymentEnvironmentCard.vue'
import AddServerDialog from '@/components/release/AddServerDialog.vue'
import RichTextEditor from '@/components/ui/RichTextEditor.vue'

const route = useRoute()
const router = useRouter()
const releasesStore = useReleasesStore()
const deliveriesStore = useDeliveriesStore()
const releasePermissions = usePagePermissions('releases')
const canEditReleases = computed(() => releasePermissions.canEdit.value)
const {
  releaseStatusValues: statusOptions,
  releaseTypeValues: releaseTypeOptions,
} = useDomainOptions()
const domainPresentation = useDomainPresentation()

const release = ref<Release | null>(null)
const loading = ref(true)
const activeTab = ref<'deliveries' | 'deployments' | 'notes'>('deliveries')

// Editing
const editingField = ref<string | null>(null)
const editTitle = ref('')
const editVersion = ref('')
const editNotes = ref('')
const sanitizedReleaseNotes = computed(() => sanitizeHtml(release.value?.releaseNotes || ''))

// Add server dialog
const showAddServerDialog = ref(false)
const addServerDeploymentId = ref('')
const addServerEnvironment = ref<Environment>('dev')
const addServerExistingIds = ref<string[]>([])

// Attach delivery popover
const showDeliveryPicker = ref(false)
const deliverySearch = ref('')

async function fetchRelease() {
  loading.value = true
  const id = route.params.id as string
  const data = await releasesStore.fetchRelease(id)
  release.value = data
  loading.value = false
}

onMounted(() => {
  fetchRelease()
  deliveriesStore.fetchDeliveries()
})

function statusStyle(status: string) { return domainPresentation.releaseStatusStyle(status) }
function statusDotColor(status: string) { return domainPresentation.releaseStatusDot(status) }
function typeStyle(type: string) { return domainPresentation.releaseTypeStyle(type) }
function statusLabel(value: string) { return domainPresentation.enumLabel(value) }
function typeLabel(value: string) { return domainPresentation.enumLabel(value) }
function formatDate(d: string | null) {
  if (!d) return '—'
  return formatDateWithYear(d)
}

async function updateStatus(newStatus: string) {
  if (!canEditReleases.value) return
  if (!release.value) return
  await releasesStore.updateRelease(release.value.id, { status: newStatus as any })
  await fetchRelease()
}

async function updateType(newType: string) {
  if (!canEditReleases.value) return
  if (!release.value) return
  await releasesStore.updateRelease(release.value.id, { releaseType: newType as any })
  await fetchRelease()
}

// Inline editing
function startEdit(field: string) {
  if (!canEditReleases.value) return
  editingField.value = field
  if (field === 'title') editTitle.value = release.value?.title || ''
  if (field === 'version') editVersion.value = release.value?.version || ''
  if (field === 'releaseNotes') editNotes.value = release.value?.releaseNotes || ''
}

async function saveEdit(field: string) {
  if (!canEditReleases.value) return
  if (!release.value) return
  const payload: any = {}
  if (field === 'title') payload.title = editTitle.value
  if (field === 'version') payload.version = editVersion.value
  if (field === 'releaseNotes') payload.releaseNotes = editNotes.value
  await releasesStore.updateRelease(release.value.id, payload)
  editingField.value = null
  await fetchRelease()
}

function cancelEdit() {
  editingField.value = null
}

// Deployments sorted
const deployments = computed(() => {
  if (!release.value?.releaseDeployments) return []
  return [...release.value.releaseDeployments].sort((a, b) => a.sequence - b.sequence)
})

// Deliveries
const attachedDeliveries = computed(() =>
  (release.value?.releaseDeliveries || []).map(rd => rd.delivery).filter(Boolean)
)

const availableDeliveries = computed(() => {
  const attachedIds = new Set((release.value?.releaseDeliveries || []).map(rd => rd.deliveryId))
  const q = deliverySearch.value.toLowerCase()
  return deliveriesStore.deliveries.filter(d =>
    !attachedIds.has(d.id) &&
    (!q || d.title.toLowerCase().includes(q))
  )
})

async function attachDelivery(deliveryId: string) {
  if (!canEditReleases.value) return
  if (!release.value) return
  const currentIds = (release.value.releaseDeliveries || []).map(rd => rd.deliveryId)
  await releasesStore.updateRelease(release.value.id, {
    deliveryIds: [...currentIds, deliveryId],
  })
  showDeliveryPicker.value = false
  await fetchRelease()
}

async function detachDelivery(deliveryId: string) {
  if (!canEditReleases.value) return
  if (!release.value) return
  const currentIds = (release.value.releaseDeliveries || []).map(rd => rd.deliveryId)
  await releasesStore.updateRelease(release.value.id, {
    deliveryIds: currentIds.filter(id => id !== deliveryId),
  })
  await fetchRelease()
}

// Generate release notes from deliveries and tasks
const generatingNotes = ref(false)

async function generateNotes() {
  if (!canEditReleases.value) return
  if (!release.value) return
  generatingNotes.value = true

  const deliveries = attachedDeliveries.value
  const version = release.value.version || release.value.code || 'Release'
  const title = release.value.title
  const type = release.value.releaseType

  // Build structured notes from deliveries and tasks
  let md = `<h2>Release ${version} — ${title}</h2>\n`

  if (type === 'hotfix') {
    md += `<p>This hotfix release addresses critical issues requiring immediate attention.</p>\n`
  } else if (type === 'patch') {
    md += `<p>This patch release includes bug fixes and minor improvements.</p>\n`
  } else {
    md += `<p>This feature release includes the following changes and improvements.</p>\n`
  }

  if (deliveries.length === 0) {
    md += `<p><em>No deliveries linked yet. Attach deliveries to auto-generate detailed notes.</em></p>\n`
  } else {
    md += `<h3>What's Included</h3>\n`

    for (const d of deliveries) {
      md += `<h4>📦 ${d!.title}</h4>\n`
      const tasks = d!.tasks || []
      if (tasks.length > 0) {
        // Group tasks by type
        const grouped: Record<string, typeof tasks> = {}
        for (const t of tasks) {
          const typeKey = t.type || 'other'
          if (!grouped[typeKey]) grouped[typeKey] = []
          grouped[typeKey].push(t)
        }

        const typeLabels: Record<string, string> = {
          development: '🔨 Development',
          fix: '🐛 Bug Fixes',
          design: '🎨 Design',
          testing: '🧪 Testing',
          review: '👀 Review',
          research: '🔬 Research',
          documentation: '📄 Documentation',
          deployment: '🚀 Deployment',
          other: '📋 Other',
        }

        for (const [typeKey, typeTasks] of Object.entries(grouped)) {
          md += `<p><strong>${typeLabels[typeKey] || typeKey}</strong></p>\n<ul>\n`
          for (const t of typeTasks) {
            const status = t.status === 'done' ? ' ✅' : ''
            md += `<li>${t.title}${status}</li>\n`
          }
          md += `</ul>\n`
        }
      } else {
        md += `<p><em>No tasks in this delivery</em></p>\n`
      }
    }

    // Summary stats
    const totalTasks = deliveries.reduce((sum, d) => sum + (d!.tasks?.length || 0), 0)
    const doneTasks = deliveries.reduce((sum, d) => sum + (d!.tasks?.filter(t => t.status === 'done').length || 0), 0)
    md += `<hr>\n<p><strong>Summary:</strong> ${deliveries.length} deliveries, ${totalTasks} tasks (${doneTasks} completed)</p>\n`
  }

  // Save generated notes
  await releasesStore.updateRelease(release.value.id, { releaseNotes: md })
  await fetchRelease()
  generatingNotes.value = false
}

// Server management
function openAddServer(deploymentId: string, environment: string) {
  if (!canEditReleases.value) return
  addServerDeploymentId.value = deploymentId
  addServerEnvironment.value = environment as Environment
  const dep = deployments.value.find(d => d.id === deploymentId)
  addServerExistingIds.value = (dep?.deploymentTargets || []).map(t => t.serverId)
  showAddServerDialog.value = true
}

async function onServersSelected(serverIds: string[]) {
  if (!canEditReleases.value) return
  if (!release.value) return
  await releasesStore.addDeploymentTargets(release.value.id, addServerDeploymentId.value, serverIds)
  await fetchRelease()
}

async function onUpdateTarget(deploymentId: string, targetId: string, status: TargetStatus) {
  if (!canEditReleases.value) return
  if (!release.value) return
  await releasesStore.updateTargetStatus(release.value.id, deploymentId, targetId, status)
  await fetchRelease()
}

async function onRemoveTarget(deploymentId: string, targetId: string) {
  if (!canEditReleases.value) return
  if (!release.value) return
  await releasesStore.removeDeploymentTarget(release.value.id, deploymentId, targetId)
  await fetchRelease()
}

async function onUpdateDeployment(deploymentId: string, payload: { status?: string; notes?: string | null }) {
  if (!canEditReleases.value) return
  if (!release.value) return
  await releasesStore.updateDeployment(release.value.id, deploymentId, payload)
  await fetchRelease()
}

function deliveryStatusStyle(status: string) {
  switch (status) {
    case 'completed': return 'bg-green-50 text-green-600'
    case 'in_progress': return 'bg-orange-50 text-orange-600'
    case 'initialized': return 'bg-gray-50 text-gray-500'
    case 'blocked': return 'bg-purple-50 text-purple-600'
    case 'overdue': return 'bg-red-50 text-red-600'
    default: return 'bg-gray-50 text-gray-500'
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <!-- Loading -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <Loader2 :size="24" class="animate-spin text-[#4857FE]" />
    </div>

    <template v-else-if="release">
      <!-- Header -->
      <div class="bg-white px-8 py-5 border-b border-gray-100">
        <div class="flex items-center gap-4 mb-3">
          <button @click="router.push('/releases')" class="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft :size="18" />
          </button>
          <span v-if="release.code" class="text-sm font-mono text-gray-400">{{ release.code }}</span>
        </div>

        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="w-9 h-9 rounded-lg bg-[#4857FE]/10 flex items-center justify-center flex-shrink-0">
              <Rocket :size="18" class="text-[#4857FE]" />
            </div>

            <!-- Title (editable) -->
            <div v-if="editingField === 'title'" class="flex items-center gap-2 flex-1">
              <input
                v-model="editTitle"
                @keyup.enter="saveEdit('title')"
                @keyup.escape="cancelEdit"
                class="text-xl font-semibold text-gray-900 border border-[#4857FE] rounded-lg px-3 py-1 outline-none flex-1"
                autofocus
              />
              <button @click="saveEdit('title')" class="text-green-600 hover:text-green-700"><Check :size="18" /></button>
              <button @click="cancelEdit" class="text-gray-400 hover:text-gray-600"><X :size="18" /></button>
            </div>
            <h1
              v-else
              @click="startEdit('title')"
              class="text-xl font-semibold transition-colors truncate"
              :class="canEditReleases
                ? 'text-gray-900 cursor-pointer hover:text-[#4857FE]'
                : 'text-gray-900 cursor-not-allowed'"
              :title="releasePermissions.deniedReason('edit', 'releases') || 'Edit title'"
            >
              {{ release.title }}
            </h1>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0">
            <!-- Status Dropdown -->
            <Popover v-if="canEditReleases">
              <PopoverTrigger>
                <span class="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full cursor-pointer" :class="statusStyle(release.status)">
                  <span class="w-1.5 h-1.5 rounded-full" :class="statusDotColor(release.status)"></span>
                  {{ statusLabel(release.status) }}
                </span>
              </PopoverTrigger>
              <PopoverContent class="w-40 p-1" align="end">
                <button
                  v-for="s in statusOptions"
                  :key="s"
                  @click="updateStatus(s)"
                  class="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-50 flex items-center gap-2"
                >
                  <span class="w-2 h-2 rounded-full" :class="statusDotColor(s)"></span>
                  {{ statusLabel(s) }}
                </button>
              </PopoverContent>
            </Popover>
            <span
              v-else
              class="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full cursor-not-allowed"
              :class="statusStyle(release.status)"
              :title="releasePermissions.deniedReason('edit', 'releases') || 'Status'"
            >
              <span class="w-1.5 h-1.5 rounded-full" :class="statusDotColor(release.status)"></span>
              {{ statusLabel(release.status) }}
            </span>

            <!-- Type Dropdown -->
            <Popover v-if="canEditReleases">
              <PopoverTrigger>
                <span class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md cursor-pointer" :class="typeStyle(release.releaseType)">
                  {{ typeLabel(release.releaseType) }}
                </span>
              </PopoverTrigger>
              <PopoverContent class="w-32 p-1" align="end">
                <button
                  v-for="t in releaseTypeOptions"
                  :key="t"
                  @click="updateType(t)"
                  class="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-50"
                >
                  {{ typeLabel(t) }}
                </button>
              </PopoverContent>
            </Popover>
            <span
              v-else
              class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md cursor-not-allowed"
              :class="typeStyle(release.releaseType)"
              :title="releasePermissions.deniedReason('edit', 'releases') || 'Type'"
            >
              {{ typeLabel(release.releaseType) }}
            </span>
          </div>
        </div>

        <!-- Metadata row -->
        <div class="flex items-center gap-6 mt-3 text-sm text-gray-500">
          <!-- Version -->
          <div class="flex items-center gap-1.5">
            <Tag :size="14" class="text-gray-400" />
            <span
              v-if="editingField !== 'version'"
              @click="startEdit('version')"
              class="transition-colors"
              :class="canEditReleases ? 'cursor-pointer hover:text-[#4857FE]' : 'cursor-not-allowed text-gray-400'"
              :title="releasePermissions.deniedReason('edit', 'releases') || 'Edit version'"
            >
              {{ release.version || 'No version' }}
            </span>
            <div v-else class="flex items-center gap-1">
              <input v-model="editVersion" @keyup.enter="saveEdit('version')" @keyup.escape="cancelEdit" class="text-sm border rounded px-2 py-0.5 w-24" autofocus />
              <button @click="saveEdit('version')" class="text-green-600"><Check :size="14" /></button>
              <button @click="cancelEdit" class="text-gray-400"><X :size="14" /></button>
            </div>
          </div>

          <!-- Planned date -->
          <div class="flex items-center gap-1.5">
            <Calendar :size="14" class="text-gray-400" />
            <span>{{ formatDate(release.plannedAt) }}</span>
          </div>

          <!-- Manager -->
          <div v-if="release.releaseManager" class="flex items-center gap-1.5">
            <User2 :size="14" class="text-gray-400" />
            <span>{{ release.releaseManager.name }}</span>
          </div>

          <!-- Created by -->
          <div v-if="release.createdByUser" class="flex items-center gap-1.5">
            <span class="text-gray-400">by</span>
            <span>{{ release.createdByUser.name }}</span>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="bg-white px-8 border-b border-gray-100">
        <div class="flex items-center gap-1">
          <button
            v-for="tab in [{ key: 'deliveries', label: 'Deliveries' }, { key: 'notes', label: 'Release Notes' }, { key: 'deployments', label: 'Deployments' }]"
            :key="tab.key"
            @click="activeTab = tab.key as any"
            class="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
            :class="activeTab === tab.key
              ? 'border-[#4857FE] text-[#4857FE]'
              : 'border-transparent text-gray-500 hover:text-gray-700'"
          >
            {{ tab.label }}
            <span v-if="tab.key === 'deliveries'" class="ml-1 text-xs text-gray-400">({{ attachedDeliveries.length }})</span>
            <span v-if="tab.key === 'deployments'" class="ml-1 text-xs text-gray-400">({{ deployments.length }})</span>
          </button>
        </div>
      </div>

      <!-- Tab Content -->
      <div class="flex-1 overflow-auto px-8 py-6">
        <!-- Deployments Tab -->
        <div v-if="activeTab === 'deployments'" class="space-y-4 max-w-4xl">
          <DeploymentEnvironmentCard
            v-for="dep in deployments"
            :key="dep.id"
            :deployment="dep"
            :release-id="release.id"
            :readonly="!canEditReleases"
            @add-server="openAddServer"
            @update-target="onUpdateTarget"
            @remove-target="onRemoveTarget"
            @update-deployment="onUpdateDeployment"
          />
        </div>

        <!-- Deliveries Tab -->
        <div v-if="activeTab === 'deliveries'" class="max-w-4xl">
          <!-- Attach Delivery -->
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold text-gray-700">Linked Deliveries</h3>
            <Popover v-model:open="showDeliveryPicker">
              <PopoverTrigger>
                <button
                  class="flex items-center gap-1.5 text-sm font-medium transition-colors"
                  :class="canEditReleases ? 'text-[#4857FE] hover:text-[#3a47e0] cursor-pointer' : 'text-gray-300 cursor-not-allowed'"
                  :disabled="!canEditReleases"
                  :title="releasePermissions.deniedReason('edit', 'releases') || 'Attach delivery'"
                >
                  <Plus :size="14" />
                  Attach Delivery
                </button>
              </PopoverTrigger>
              <PopoverContent class="w-80 p-0" align="end">
                <div class="p-2 border-b border-gray-100">
                  <div class="relative">
                    <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      v-model="deliverySearch"
                      placeholder="Search deliveries..."
                      class="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:border-[#4857FE]"
                    />
                  </div>
                </div>
                <div class="max-h-48 overflow-y-auto">
                  <div v-if="availableDeliveries.length === 0" class="px-3 py-4 text-sm text-gray-400 text-center">
                    No deliveries available
                  </div>
                  <button
                    v-for="d in availableDeliveries"
                    :key="d.id"
                    @click="attachDelivery(d.id)"
                    class="w-full text-left px-3 py-2 flex items-center gap-2 border-b border-gray-50 last:border-b-0"
                    :class="canEditReleases ? 'hover:bg-gray-50 cursor-pointer' : 'text-gray-300 cursor-not-allowed'"
                    :disabled="!canEditReleases"
                  >
                    <Package :size="13" class="text-gray-400" />
                    <span class="text-sm text-gray-700 truncate flex-1">{{ d.title }}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded" :class="deliveryStatusStyle(d.status)">
                      {{ d.status?.replace(/_/g, ' ') }}
                    </span>
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <!-- Delivery List -->
          <div v-if="attachedDeliveries.length === 0" class="bg-white rounded-xl border border-gray-200/80 p-8 text-center">
            <Package :size="24" class="text-gray-300 mx-auto mb-2" />
            <p class="text-sm text-gray-400">No deliveries attached</p>
          </div>
          <div v-else class="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-100">
                  <th class="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th class="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th class="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="d in attachedDeliveries"
                  :key="d!.id"
                  class="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50"
                >
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                      <Package :size="14" class="text-gray-400" />
                      <span class="text-sm font-medium text-gray-700">{{ d!.title }}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <span class="text-xs font-medium px-2 py-0.5 rounded" :class="deliveryStatusStyle(d!.status)">
                      {{ d!.status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }}
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    <button
                      @click="detachDelivery(d!.id)"
                      class="transition-colors"
                      :class="canEditReleases ? 'text-gray-300 hover:text-red-500 cursor-pointer' : 'text-gray-200 cursor-not-allowed'"
                      :disabled="!canEditReleases"
                      :title="releasePermissions.deniedReason('edit', 'releases') || 'Detach delivery'"
                    >
                      <Trash2 :size="14" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Release Notes Tab -->
        <div v-if="activeTab === 'notes'" class="max-w-4xl">
          <div class="bg-white rounded-xl border border-gray-200/80 p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold text-gray-700">Release Notes</h3>
              <div class="flex items-center gap-2">
                <button
                  v-if="editingField !== 'releaseNotes'"
                  @click="generateNotes"
                  :disabled="generatingNotes || !canEditReleases"
                  class="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  :class="generatingNotes || !canEditReleases ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#4857FE]/10 text-[#4857FE] hover:bg-[#4857FE]/20'"
                >
                  <Loader2 v-if="generatingNotes" :size="12" class="animate-spin" />
                  <Sparkles v-else :size="12" />
                  {{ generatingNotes ? 'Generating...' : 'Generate Notes' }}
                </button>
                <button
                  v-if="editingField !== 'releaseNotes'"
                  @click="startEdit('releaseNotes')"
                  class="flex items-center gap-1 text-xs font-medium transition-colors"
                  :class="canEditReleases ? 'text-[#4857FE] hover:text-[#3a47e0] cursor-pointer' : 'text-gray-300 cursor-not-allowed'"
                  :disabled="!canEditReleases"
                  :title="releasePermissions.deniedReason('edit', 'releases') || 'Edit release notes'"
                >
                  <Pencil :size="12" />
                  Edit
                </button>
                <template v-else>
                  <button @click="saveEdit('releaseNotes')" class="text-xs text-green-600 font-medium">Save</button>
                  <button @click="cancelEdit" class="text-xs text-gray-400 font-medium">Cancel</button>
                </template>
              </div>
            </div>
            <div v-if="editingField === 'releaseNotes'">
              <RichTextEditor v-model="editNotes" placeholder="Write release notes..." />
            </div>
            <div v-else-if="release.releaseNotes" class="prose prose-sm max-w-none text-gray-700" v-html="sanitizedReleaseNotes"></div>
            <p v-else class="text-sm text-gray-400 italic">No release notes yet</p>
          </div>
        </div>
      </div>
    </template>

    <!-- Not Found -->
    <div v-else class="flex-1 flex flex-col items-center justify-center">
      <p class="text-gray-500">Release not found</p>
      <button @click="router.push('/releases')" class="mt-2 text-sm text-[#4857FE] hover:underline">Back to releases</button>
    </div>

    <!-- Add Server Dialog -->
    <AddServerDialog
      v-model:open="showAddServerDialog"
      :environment="addServerEnvironment"
      :existing-server-ids="addServerExistingIds"
      @selected="onServersSelected"
    />
  </div>
</template>
