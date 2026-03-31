<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Check, Copy, Loader2, Plus, X } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { organizationTeamsApi, productsApi } from '@/lib/apiClient'
import { useAuthStore } from '@/stores/auth'
import { useOnboardingStore } from '@/stores/onboarding'
import { useRolesStore } from '@/stores/roles'

type InviteRole = 'owner' | 'admin' | 'member' | 'viewer'

interface InviteRow {
  id: string
  name: string
  email: string
  role: InviteRole
  workspaceProductId: string
  organizationTeamId: string
  titleId: string
}

interface WorkspaceOption {
  id: string
  name: string
}

interface TeamOption {
  id: string
  name: string
}

const props = withDefaults(defineProps<{
  canInvite: boolean
  heading?: string
  description?: string
}>(), {
  heading: 'Invite Members',
  description: 'Create invite links for new members with optional team, workspace, and title defaults.',
})

const authStore = useAuthStore()
const onboardingStore = useOnboardingStore()
const rolesStore = useRolesStore()

const inviteRows = ref<InviteRow[]>([])
const workspaceOptions = ref<WorkspaceOption[]>([])
const teamOptions = ref<TeamOption[]>([])
const copiedInviteId = ref<string | null>(null)
const localError = ref<string | null>(null)
const optionsLoading = ref(false)

function createRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizeOptionalId(value: string): string | null {
  const normalized = value.trim()
  return normalized || null
}

function createInviteRow(): InviteRow {
  return {
    id: createRowId(),
    name: '',
    email: '',
    role: 'member',
    workspaceProductId: '',
    organizationTeamId: '',
    titleId: '',
  }
}

function resetInviteRows() {
  inviteRows.value = [createInviteRow()]
}

const activeOrganizationId = computed(() => onboardingStore.activeOrganizationId || null)
const pendingInvites = computed(() => onboardingStore.invites.filter((invite) => invite.status === 'pending'))
const canAssignOwnerRole = computed(() => onboardingStore.activeOrganization?.role === 'owner')
const isOrganizationManager = computed(() => {
  const role = onboardingStore.activeOrganization?.role
  return role === 'owner' || role === 'admin'
})
const canInviteActions = computed(() => props.canInvite && isOrganizationManager.value)
const activeError = computed(() => localError.value || onboardingStore.error)

const roleOptions = computed<Array<{ value: InviteRole; label: string }>>(() => {
  const base: Array<{ value: InviteRole; label: string }> = [
    { value: 'admin', label: 'Admin' },
    { value: 'member', label: 'Member' },
    { value: 'viewer', label: 'Viewer' },
  ]
  return canAssignOwnerRole.value ? [{ value: 'owner', label: 'Owner' }, ...base] : base
})

const titleOptions = computed(() => rolesStore.titles.filter((title) => title.isActive))
const workspaceNameById = computed(() => new Map(workspaceOptions.value.map((workspace) => [workspace.id, workspace.name])))
const teamNameById = computed(() => new Map(teamOptions.value.map((team) => [team.id, team.name])))
const titleNameById = computed(() => new Map(titleOptions.value.map((title) => [title.id, title.name])))

function formatSkippedReason(reason: string): string {
  const dictionary: Record<string, string> = {
    invalid_email: 'Invalid email format',
    cannot_invite_self: 'Cannot invite your own account',
    owner_role_requires_owner: 'Only organization owners can invite other owners',
    already_member: 'User is already an organization member',
    invalid_workspace: 'Selected workspace is invalid for this organization',
    invalid_team: 'Selected team is invalid for this organization',
    invalid_title: 'Selected title is invalid or archived',
  }
  return dictionary[reason] || reason.replace(/_/g, ' ')
}

async function ensureSupportingDataLoaded() {
  const organizationId = activeOrganizationId.value
  if (!organizationId) {
    workspaceOptions.value = []
    teamOptions.value = []
    return
  }

  optionsLoading.value = true
  localError.value = null
  try {
    const [workspaces, teams] = await Promise.all([
      productsApi.list(organizationId, authStore.token),
      organizationTeamsApi.list(organizationId, { includeMembers: false }, authStore.token),
    ])
    workspaceOptions.value = (Array.isArray(workspaces) ? workspaces : [])
      .map((workspace) => ({
        id: workspace.id || '',
        name: workspace.name,
      }))
      .filter((workspace) => workspace.id)
    teamOptions.value = (Array.isArray(teams) ? teams : [])
      .map((team) => ({ id: team.id, name: team.name }))
      .filter((team) => team.id)
    await rolesStore.fetchTitles()
  } catch (error) {
    localError.value = error instanceof Error ? error.message : 'Failed to load invite options.'
    workspaceOptions.value = []
    teamOptions.value = []
  } finally {
    optionsLoading.value = false
  }
}

async function refreshInvites() {
  const organizationId = activeOrganizationId.value
  if (!organizationId || !isOrganizationManager.value) return
  await onboardingStore.fetchInvites(organizationId)
}

function addInviteRow() {
  inviteRows.value = [...inviteRows.value, createInviteRow()]
}

function removeInviteRow(rowId: string) {
  if (inviteRows.value.length <= 1) {
    resetInviteRows()
    return
  }
  inviteRows.value = inviteRows.value.filter((row) => row.id !== rowId)
}

async function sendInvites() {
  localError.value = null
  const organizationId = activeOrganizationId.value
  if (!organizationId) {
    localError.value = 'Organization context is missing.'
    return
  }
  if (!canInviteActions.value) {
    localError.value = 'You do not have permission to invite members.'
    return
  }

  const uniqueInvites: Array<{
    email: string
    name: string
    role: InviteRole
    workspaceProductId?: string | null
    organizationTeamId?: string | null
    titleId?: string | null
  }> = []
  const seenEmails = new Set<string>()

  for (const row of inviteRows.value) {
    const normalizedEmail = row.email.trim().toLowerCase()
    const normalizedName = row.name.trim()
    if (!normalizedEmail && !normalizedName) continue

    if (!normalizedEmail) {
      localError.value = 'Each invite row requires an email.'
      return
    }
    if (!isLikelyEmail(normalizedEmail)) {
      localError.value = `Invalid email: ${row.email}`
      return
    }
    if (!normalizedName) {
      localError.value = `Please provide a name for ${normalizedEmail}.`
      return
    }
    if (seenEmails.has(normalizedEmail)) continue

    seenEmails.add(normalizedEmail)
    uniqueInvites.push({
      email: normalizedEmail,
      name: normalizedName,
      role: row.role === 'owner' && !canAssignOwnerRole.value ? 'member' : row.role,
      workspaceProductId: normalizeOptionalId(row.workspaceProductId),
      organizationTeamId: normalizeOptionalId(row.organizationTeamId),
      titleId: normalizeOptionalId(row.titleId),
    })
  }

  if (uniqueInvites.length === 0) {
    localError.value = 'Add at least one invite with name and email.'
    return
  }

  const success = await onboardingStore.createInvites({
    organizationId,
    invites: uniqueInvites,
  })
  if (!success) return

  resetInviteRows()
}

async function copyInviteLink(inviteId: string, link: string) {
  try {
    await navigator.clipboard.writeText(link)
    copiedInviteId.value = inviteId
    window.setTimeout(() => {
      if (copiedInviteId.value === inviteId) copiedInviteId.value = null
    }, 1600)
  } catch {
    localError.value = 'Could not copy invite link. Copy it manually instead.'
  }
}

async function cancelInvite(inviteId: string) {
  localError.value = null
  await onboardingStore.cancelInvite(inviteId)
}

watch(canAssignOwnerRole, (allowed) => {
  if (allowed) return
  inviteRows.value = inviteRows.value.map((row) => (
    row.role === 'owner'
      ? { ...row, role: 'member' }
      : row
  ))
})

watch(activeOrganizationId, async () => {
  resetInviteRows()
  await Promise.all([
    ensureSupportingDataLoaded(),
    refreshInvites(),
  ])
})

onMounted(async () => {
  resetInviteRows()
  await Promise.all([
    ensureSupportingDataLoaded(),
    refreshInvites(),
  ])
})
</script>

<template>
  <section class="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-gray-900">{{ heading }}</h2>
        <p class="mt-1 text-sm text-gray-500">{{ description }}</p>
        <p v-if="!canInviteActions" class="mt-1 text-xs text-amber-700">
          Only organization owners or admins can create invites.
        </p>
      </div>
      <Loader2 v-if="optionsLoading || onboardingStore.invitesLoading" :size="16" class="animate-spin text-[#4857FE]" />
    </div>

    <p
      v-if="activeError"
      aria-live="polite"
      class="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2"
    >
      {{ activeError }}
    </p>

    <form class="space-y-3" @submit.prevent="sendInvites">
      <article
        v-for="(row, index) in inviteRows"
        :key="row.id"
        class="rounded-lg border border-gray-200 p-3 space-y-3 bg-gray-50/40"
      >
        <div class="grid gap-2 xl:grid-cols-3">
          <div class="space-y-1">
            <label class="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Name {{ index + 1 }}
            </label>
            <Input
              v-model="row.name"
              class="h-9 bg-white"
              placeholder="Jane Doe"
              type="text"
              :disabled="!canInviteActions || onboardingStore.submitting"
            />
          </div>
          <div class="space-y-1">
            <label class="text-[11px] font-medium uppercase tracking-wide text-gray-500">Email</label>
            <Input
              v-model="row.email"
              class="h-9 bg-white"
              placeholder="name@company.com"
              type="email"
              :disabled="!canInviteActions || onboardingStore.submitting"
            />
          </div>
          <div class="space-y-1">
            <label class="text-[11px] font-medium uppercase tracking-wide text-gray-500">Org Role</label>
            <select
              v-model="row.role"
              :disabled="!canInviteActions || onboardingStore.submitting"
              class="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
            >
              <option v-for="option in roleOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>

        <div class="grid gap-2 xl:grid-cols-3">
          <div class="space-y-1">
            <label class="text-[11px] font-medium uppercase tracking-wide text-gray-500">Workspace (optional)</label>
            <select
              v-model="row.workspaceProductId"
              :disabled="!canInviteActions || onboardingStore.submitting"
              class="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
            >
              <option value="">No default workspace</option>
              <option v-for="workspace in workspaceOptions" :key="workspace.id" :value="workspace.id">
                {{ workspace.name }}
              </option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-[11px] font-medium uppercase tracking-wide text-gray-500">Team (optional)</label>
            <select
              v-model="row.organizationTeamId"
              :disabled="!canInviteActions || onboardingStore.submitting"
              class="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
            >
              <option value="">No default team</option>
              <option v-for="team in teamOptions" :key="team.id" :value="team.id">
                {{ team.name }}
              </option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-[11px] font-medium uppercase tracking-wide text-gray-500">Title (optional)</label>
            <select
              v-model="row.titleId"
              :disabled="!canInviteActions || onboardingStore.submitting"
              class="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
            >
              <option value="">No default title</option>
              <option v-for="title in titleOptions" :key="title.id" :value="title.id">
                {{ title.name }}
              </option>
            </select>
          </div>
        </div>

        <div class="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="h-8 text-gray-500 hover:text-red-600"
            :disabled="!canInviteActions || onboardingStore.submitting"
            @click="removeInviteRow(row.id)"
          >
            <X :size="13" class="mr-1" />
            Remove
          </Button>
        </div>
      </article>

      <div class="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="h-8"
          :disabled="!canInviteActions || onboardingStore.submitting"
          @click="addInviteRow"
        >
          <Plus :size="13" class="mr-1.5" />
          Add person
        </Button>
        <p v-if="!canAssignOwnerRole" class="text-xs text-gray-500">
          Owner invites are restricted to current organization owners.
        </p>
      </div>

      <Button
        type="submit"
        class="h-10"
        :disabled="onboardingStore.submitting || !canInviteActions"
      >
        <Loader2 v-if="onboardingStore.submitting" :size="14" class="mr-2 animate-spin" />
        Create invite links
      </Button>
    </form>

    <div v-if="onboardingStore.lastSkippedInvites.length > 0" class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
      <p class="font-medium text-amber-800">Some invites were skipped:</p>
      <ul class="mt-1 space-y-0.5 text-amber-700">
        <li v-for="item in onboardingStore.lastSkippedInvites" :key="`${item.email}-${item.reason}`">
          {{ item.email }} - {{ formatSkippedReason(item.reason) }}
        </li>
      </ul>
    </div>

    <div v-if="onboardingStore.lastCreatedInviteLinks.length > 0" class="space-y-2">
      <p class="text-sm font-semibold text-gray-900">Generated invite links</p>
      <article
        v-for="item in onboardingStore.lastCreatedInviteLinks"
        :key="item.id"
        class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-gray-800">{{ item.email }}</p>
          <p class="truncate text-xs text-gray-500">{{ item.inviteLink }}</p>
        </div>
        <Button type="button" variant="outline" size="sm" class="h-8" @click="copyInviteLink(item.id, item.inviteLink)">
          <Check v-if="copiedInviteId === item.id" :size="13" />
          <Copy v-else :size="13" />
          {{ copiedInviteId === item.id ? 'Copied' : 'Copy link' }}
        </Button>
      </article>
    </div>

    <div class="space-y-2">
      <p class="text-sm font-semibold text-gray-900">Pending invites</p>
      <p v-if="pendingInvites.length === 0" class="text-sm text-gray-500">No pending invites yet.</p>
      <article
        v-for="invite in pendingInvites"
        :key="invite.id"
        class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex items-center justify-between gap-2"
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-gray-900">
            {{ invite.inviteeName || invite.email }}
            <span class="ml-2 inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600">
              {{ invite.role }}
            </span>
          </p>
          <p class="truncate text-xs text-gray-500">{{ invite.email }}</p>
          <p class="text-[11px] text-gray-500 mt-1">
            Expires {{ new Date(invite.expiresAt).toLocaleDateString() }}
            <span v-if="invite.workspaceProductId"> • Workspace: {{ workspaceNameById.get(invite.workspaceProductId) || 'Unknown' }}</span>
            <span v-if="invite.organizationTeamId"> • Team: {{ teamNameById.get(invite.organizationTeamId) || 'Unknown' }}</span>
            <span v-if="invite.titleId"> • Title: {{ titleNameById.get(invite.titleId) || 'Unknown' }}</span>
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          class="h-8 text-gray-500 hover:text-red-600"
          :disabled="onboardingStore.submitting || !canInviteActions"
          @click="cancelInvite(invite.id)"
        >
          Cancel
        </Button>
      </article>
    </div>
  </section>
</template>
