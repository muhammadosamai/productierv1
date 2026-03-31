<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Bug, Loader2, Plus, Search, Trash2 } from 'lucide-vue-next'
import { useIssuesStore, type IssueSeverity, type IssueSource, type IssueStatus } from '@/stores/issues'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { usePagePermissions } from '@/lib/pagePermissions'
import { usersApi } from '@/lib/api'
import { organizationTeamsApi } from '@/lib/apiClient'
import { useRoute, useRouter } from 'vue-router'

interface TeamUser {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
}

interface OrganizationTeam {
  id: string
  name: string
  key: string
}

const productStore = useProductStore()
const authStore = useAuthStore()
const issuesStore = useIssuesStore()
const route = useRoute()
const router = useRouter()
const issuesPermissions = usePagePermissions('issues')

const searchQuery = ref('')
const statusFilter = ref<IssueStatus | ''>('')
const severityFilter = ref<IssueSeverity | ''>('')
const sourceFilter = ref<IssueSource | ''>('standalone')
const assigneeFilter = ref('')
const assigneeTeamFilter = ref('')

const showCreateForm = ref(false)
const createTitle = ref('')
const createDescription = ref('')
const createSeverity = ref<IssueSeverity>('minor')
const createSource = ref<IssueSource>('standalone')
const createAssigneeUserId = ref('')
const createAssigneeTeamId = ref('')

const editTitle = ref('')
const editDescription = ref('')
const editSeverity = ref<IssueSeverity>('minor')
const editStatus = ref<IssueStatus>('open')
const editSource = ref<IssueSource>('standalone')
const editAssigneeUserId = ref('')
const editAssigneeTeamId = ref('')
const editResolutionSummary = ref('')

const teamUsers = ref<TeamUser[]>([])
const teams = ref<OrganizationTeam[]>([])
let searchTimer: ReturnType<typeof setTimeout> | null = null

const canCreateIssues = computed(() => issuesPermissions.canCreate.value)
const canEditIssues = computed(() => issuesPermissions.canEdit.value)
const canDeleteIssues = computed(() => issuesPermissions.canDelete.value)
const selectedIssue = computed(() => issuesStore.selectedIssue)

function severityBadgeStyle(severity: IssueSeverity): string {
  if (severity === 'critical') return 'bg-red-100 text-red-700 border-red-200'
  if (severity === 'major') return 'bg-orange-100 text-orange-700 border-orange-200'
  if (severity === 'minor') return 'bg-blue-100 text-blue-700 border-blue-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

function statusBadgeStyle(status: IssueStatus): string {
  if (status === 'open') return 'bg-red-100 text-red-700 border-red-200'
  if (status === 'in_progress') return 'bg-amber-100 text-amber-700 border-amber-200'
  if (status === 'resolved') return 'bg-green-100 text-green-700 border-green-200'
  if (status === 'closed') return 'bg-gray-100 text-gray-600 border-gray-200'
  return 'bg-purple-100 text-purple-700 border-purple-200'
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

async function fetchTeamUsers() {
  try {
    const payload = await usersApi.list({ q: '' }, authStore.token)
    teamUsers.value = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.items) ? payload.items : [])
  } catch {
    teamUsers.value = []
  }
}

async function fetchOrganizationTeams() {
  const organizationId = productStore.activeProduct.organizationId
  if (!organizationId) {
    teams.value = []
    return
  }
  try {
    const payload = await organizationTeamsApi.list(organizationId, {}, authStore.token)
    teams.value = Array.isArray(payload)
      ? payload.map((team) => ({ id: team.id, name: team.name, key: team.key }))
      : []
  } catch {
    teams.value = []
  }
}

async function loadIssues() {
  await issuesStore.fetchIssues(undefined, {
    q: searchQuery.value,
    status: statusFilter.value,
    severity: severityFilter.value,
    source: sourceFilter.value,
    assignedToUserId: assigneeFilter.value || undefined,
    assignedToTeamId: assigneeTeamFilter.value || undefined,
  })
}

function issueIdFromRouteQuery(): string | null {
  return typeof route.query.issue === 'string' && route.query.issue.trim()
    ? route.query.issue
    : null
}

async function selectIssue(issueId: string, syncQuery = true) {
  await issuesStore.fetchIssue(issueId)
  if (issuesStore.selectedIssue) {
    editTitle.value = issuesStore.selectedIssue.title
    editDescription.value = issuesStore.selectedIssue.description || ''
    editSeverity.value = issuesStore.selectedIssue.severity
    editStatus.value = issuesStore.selectedIssue.status
    editSource.value = issuesStore.selectedIssue.source
    editAssigneeUserId.value = issuesStore.selectedIssue.assignedToUserId || ''
    editAssigneeTeamId.value = issuesStore.selectedIssue.assignedToTeamId || ''
    editResolutionSummary.value = issuesStore.selectedIssue.resolutionSummary || ''

    if (syncQuery && route.query.issue !== issueId) {
      void router.replace({ query: { ...route.query, issue: issueId } })
    }
  }
}

async function syncSelectionFromRoute() {
  const requestedIssueId = issueIdFromRouteQuery()
  if (requestedIssueId) {
    if (issuesStore.selectedIssue?.id === requestedIssueId) return
    await selectIssue(requestedIssueId, false)
    return
  }

  if (!issuesStore.selectedIssue && issuesStore.issues.length > 0) {
    await selectIssue(issuesStore.issues[0]!.id)
  }
}

async function createIssue() {
  if (!canCreateIssues.value) return
  if (!createTitle.value.trim()) return
  const created = await issuesStore.createIssue({
    title: createTitle.value.trim(),
    description: createDescription.value.trim() || null,
    severity: createSeverity.value,
    source: createSource.value,
    assignedToUserId: createAssigneeUserId.value || null,
    assignedToTeamId: createAssigneeTeamId.value || null,
  })
  if (!created) return

  showCreateForm.value = false
  createTitle.value = ''
  createDescription.value = ''
  createSeverity.value = 'minor'
  createSource.value = 'standalone'
  createAssigneeUserId.value = ''
  createAssigneeTeamId.value = ''
  await selectIssue(created.id)
}

async function saveIssue() {
  if (!canEditIssues.value) return
  if (!selectedIssue.value) return
  await issuesStore.updateIssue(selectedIssue.value.id, {
    title: editTitle.value.trim(),
    description: editDescription.value.trim() || null,
    severity: editSeverity.value,
    status: editStatus.value,
    source: editSource.value,
    assignedToUserId: editAssigneeUserId.value || null,
    assignedToTeamId: editAssigneeTeamId.value || null,
    resolutionSummary: editResolutionSummary.value.trim() || null,
  })
}

async function deleteIssue() {
  if (!canDeleteIssues.value) return
  if (!selectedIssue.value) return
  if (!confirm('Delete this issue? This cannot be undone.')) return
  await issuesStore.deleteIssue(selectedIssue.value.id)
}

watch(searchQuery, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadIssues()
  }, 250)
})

watch([statusFilter, severityFilter, sourceFilter, assigneeFilter, assigneeTeamFilter], () => {
  loadIssues()
})

watch(() => productStore.activeProduct.id, () => {
  issuesStore.selectedIssue = null
  if (route.query.issue) {
    const { issue: _issue, ...rest } = route.query
    void router.replace({ query: rest })
  }
  void Promise.all([fetchTeamUsers(), fetchOrganizationTeams()])
  loadIssues()
})

watch(() => route.query.issue, () => {
  syncSelectionFromRoute()
})

onMounted(async () => {
  await loadIssues()
  await Promise.all([fetchTeamUsers(), fetchOrganizationTeams()])
  await syncSelectionFromRoute()
})
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <div class="bg-white px-8 py-5 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
            <Bug :size="18" class="text-[#4857FE]" />
          </div>
          <div>
            <h1 class="text-xl font-semibold text-gray-900">Issues</h1>
            <p class="text-sm text-gray-400 mt-0.5">{{ productStore.activeProduct.name }}</p>
          </div>
        </div>
        <button
          class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="canCreateIssues
            ? 'bg-[#4857FE] text-white hover:bg-[#3E4BDE]'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'"
          :disabled="!canCreateIssues"
          :title="issuesPermissions.deniedReason('create', 'issues') || 'Create issue'"
          @click="showCreateForm = !showCreateForm"
        >
          <Plus :size="14" />
          {{ showCreateForm ? 'Close' : 'New Issue' }}
        </button>
      </div>

      <div class="mt-4 flex items-center gap-3 flex-wrap">
        <div class="relative w-full max-w-sm">
          <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search issues..."
            class="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
          />
        </div>

        <select v-model="statusFilter" class="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
          <option value="deferred">Deferred</option>
        </select>

        <select v-model="severityFilter" class="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700">
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="major">Major</option>
          <option value="minor">Minor</option>
          <option value="trivial">Trivial</option>
        </select>

        <select v-model="sourceFilter" class="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700">
          <option value="">All sources</option>
          <option value="standalone">Standalone</option>
          <option value="test_cycle">Test Cycle</option>
        </select>

        <select v-model="assigneeTeamFilter" class="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700">
          <option value="">All teams</option>
          <option v-for="team in teams" :key="team.id" :value="team.id">
            {{ team.name }}
          </option>
        </select>
      </div>
    </div>

    <div class="flex-1 min-h-0 px-8 py-6">
      <div class="h-full grid grid-cols-[minmax(420px,1fr)_minmax(360px,460px)] gap-5">
        <div class="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col min-h-0">
          <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-gray-700">Standalone Issues</h2>
            <Loader2 v-if="issuesStore.loading" :size="14" class="animate-spin text-[#4857FE]" />
          </div>

          <div v-if="showCreateForm && canCreateIssues" class="p-4 border-b border-gray-100 bg-gray-50/60 space-y-2">
            <input
              v-model="createTitle"
              type="text"
              placeholder="Issue title"
              class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white"
            />
            <textarea
              v-model="createDescription"
              rows="2"
              placeholder="Issue description"
              class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white"
            ></textarea>
            <div class="grid grid-cols-4 gap-2">
              <select v-model="createSeverity" class="px-2.5 py-2 text-xs rounded-lg border border-gray-200 bg-white">
                <option value="critical">Critical</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
                <option value="trivial">Trivial</option>
              </select>
              <select v-model="createSource" class="px-2.5 py-2 text-xs rounded-lg border border-gray-200 bg-white">
                <option value="standalone">Standalone</option>
                <option value="test_cycle">Test Cycle</option>
              </select>
              <select v-model="createAssigneeUserId" class="px-2.5 py-2 text-xs rounded-lg border border-gray-200 bg-white">
                <option value="">Unassigned</option>
                <option v-for="user in teamUsers" :key="user.id" :value="user.id">{{ user.name }}</option>
              </select>
              <select v-model="createAssigneeTeamId" class="px-2.5 py-2 text-xs rounded-lg border border-gray-200 bg-white">
                <option value="">No team</option>
                <option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option>
              </select>
            </div>
            <button
              class="w-full px-3 py-2 text-xs font-medium rounded-lg bg-[#4857FE] text-white hover:bg-[#3E4BDE] disabled:bg-gray-300"
              :disabled="issuesStore.saving || !createTitle.trim() || !canCreateIssues"
              :title="issuesPermissions.deniedReason('create', 'issues') || 'Create issue'"
              @click="createIssue"
            >
              Create issue
            </button>
          </div>

          <div v-if="issuesStore.loading && issuesStore.issues.length === 0" class="flex-1 flex items-center justify-center text-sm text-gray-500">
            Loading issues...
          </div>

          <div v-else-if="issuesStore.issues.length === 0" class="flex-1 flex items-center justify-center text-sm text-gray-500">
            No issues found
          </div>

          <div v-else class="flex-1 overflow-auto divide-y divide-gray-100">
            <button
              v-for="issue in issuesStore.issues"
              :key="issue.id"
              class="w-full text-left px-5 py-3 hover:bg-gray-50 transition-colors"
              :class="selectedIssue?.id === issue.id ? 'bg-[#4857FE]/5' : ''"
              @click="selectIssue(issue.id)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-medium text-gray-900 truncate">{{ issue.title }}</p>
                  <p class="text-xs text-gray-400 truncate mt-0.5">
                    {{ issue.assignedToUser?.name || issue.assignedToTeam?.name || 'Unassigned' }} • {{ issue.reportedByUser?.name || 'Unknown reporter' }}
                  </p>
                  <div class="flex items-center gap-2 mt-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium" :class="severityBadgeStyle(issue.severity)">
                      {{ humanize(issue.severity) }}
                    </span>
                    <span class="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium" :class="statusBadgeStyle(issue.status)">
                      {{ humanize(issue.status) }}
                    </span>
                    <span class="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium bg-gray-100 text-gray-600 border-gray-200">
                      {{ humanize(issue.source) }}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div class="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col min-h-0">
          <div class="px-5 py-3 border-b border-gray-100">
            <h2 class="text-sm font-semibold text-gray-700">Issue Details</h2>
          </div>

          <div v-if="!selectedIssue" class="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div class="w-14 h-14 rounded-xl bg-[#4857FE]/10 flex items-center justify-center mb-3">
              <Bug :size="24" class="text-[#4857FE]" />
            </div>
            <p class="text-sm text-gray-600 font-medium">Select an issue</p>
            <p class="text-xs text-gray-400 mt-1">Review and update issue lifecycle details.</p>
          </div>

          <div v-else class="flex-1 overflow-auto p-5 space-y-4">
            <input
              v-model="editTitle"
              :disabled="!canEditIssues || issuesStore.saving"
              type="text"
              class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white disabled:bg-gray-50 disabled:text-gray-400"
            />

            <textarea
              v-model="editDescription"
              :disabled="!canEditIssues || issuesStore.saving"
              rows="4"
              class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white disabled:bg-gray-50 disabled:text-gray-400"
            ></textarea>

            <div class="grid grid-cols-2 gap-2">
              <select v-model="editStatus" :disabled="!canEditIssues || issuesStore.saving" class="px-2.5 py-2 text-sm rounded-lg border border-gray-200 bg-white disabled:bg-gray-50 disabled:text-gray-400">
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
                <option value="deferred">Deferred</option>
              </select>
              <select v-model="editSeverity" :disabled="!canEditIssues || issuesStore.saving" class="px-2.5 py-2 text-sm rounded-lg border border-gray-200 bg-white disabled:bg-gray-50 disabled:text-gray-400">
                <option value="critical">Critical</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
                <option value="trivial">Trivial</option>
              </select>
            </div>

            <div class="grid grid-cols-3 gap-2">
              <select v-model="editSource" :disabled="!canEditIssues || issuesStore.saving" class="px-2.5 py-2 text-sm rounded-lg border border-gray-200 bg-white disabled:bg-gray-50 disabled:text-gray-400">
                <option value="standalone">Standalone</option>
                <option value="test_cycle">Test Cycle</option>
              </select>
              <select v-model="editAssigneeUserId" :disabled="!canEditIssues || issuesStore.saving" class="px-2.5 py-2 text-sm rounded-lg border border-gray-200 bg-white disabled:bg-gray-50 disabled:text-gray-400">
                <option value="">Unassigned</option>
                <option v-for="user in teamUsers" :key="user.id" :value="user.id">{{ user.name }}</option>
              </select>
              <select v-model="editAssigneeTeamId" :disabled="!canEditIssues || issuesStore.saving" class="px-2.5 py-2 text-sm rounded-lg border border-gray-200 bg-white disabled:bg-gray-50 disabled:text-gray-400">
                <option value="">No team</option>
                <option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option>
              </select>
            </div>

            <textarea
              v-model="editResolutionSummary"
              :disabled="!canEditIssues || issuesStore.saving"
              rows="3"
              placeholder="Resolution summary (optional)"
              class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white disabled:bg-gray-50 disabled:text-gray-400"
            ></textarea>

            <div class="flex items-center gap-2 pt-1">
              <button
                class="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-[#4857FE] text-white hover:bg-[#3E4BDE] disabled:bg-gray-300"
                :disabled="!canEditIssues || issuesStore.saving"
                :title="issuesPermissions.deniedReason('edit', 'issues') || 'Save changes'"
                @click="saveIssue"
              >
                Save changes
              </button>
              <button
                class="px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                :disabled="issuesStore.saving || !canDeleteIssues"
                :title="issuesPermissions.deniedReason('delete', 'issues') || 'Delete issue'"
                @click="deleteIssue"
              >
                <Trash2 :size="14" />
              </button>
            </div>

            <p v-if="issuesStore.error" class="text-xs text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {{ issuesStore.error }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
