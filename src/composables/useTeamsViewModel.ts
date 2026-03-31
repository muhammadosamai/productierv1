import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  organizationTeamsApi,
  productsApi,
  type ApiOrganizationTeam,
  type ApiOrganizationTeamMember,
  type ApiProductMember,
} from '@/lib/apiClient'
import { usePagePermissions } from '@/lib/pagePermissions'
import { useAuthStore } from '@/stores/auth'
import { useOnboardingStore } from '@/stores/onboarding'
import { useProductStore } from '@/stores/products'

export type TeamMemberRole = ApiOrganizationTeamMember['role']

export interface TeamMemberRow {
  userId: string
  userName: string
  userEmail: string
  role: TeamMemberRole
}

type TeamDangerAction = {
  type: 'remove-member' | 'delete-team'
  userId?: string
  teamId?: string
  label: string
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

function asRole(value: string | null | undefined): TeamMemberRole {
  return value === 'lead' ? 'lead' : 'member'
}

export function normalizeTeamRole(value: string | null | undefined): TeamMemberRole {
  return asRole(value)
}

export function normalizeUserIds(values: Array<string | null | undefined>): string[] {
  const unique = new Set<string>()
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (!normalized) continue
    unique.add(normalized)
  }
  return Array.from(unique)
}

export function resolveTeamLeadUserIds(
  team: Pick<ApiOrganizationTeam, 'leadUserIds' | 'leadUserId'>,
  teamMembers: Array<Pick<ApiOrganizationTeamMember, 'userId' | 'role'>> = [],
): string[] {
  const fromContract = Array.isArray(team.leadUserIds) ? team.leadUserIds : []
  const fromMembers = teamMembers
    .filter((member) => asRole(member.role) === 'lead')
    .map((member) => member.userId)
  const fromLegacy = team.leadUserId ? [team.leadUserId] : []
  return normalizeUserIds([...fromContract, ...fromMembers, ...fromLegacy])
}

function sortTeamsByName(teams: ApiOrganizationTeam[]): ApiOrganizationTeam[] {
  return [...teams].sort((left, right) => left.name.localeCompare(right.name))
}

export function useTeamsViewModel() {
  const authStore = useAuthStore()
  const onboardingStore = useOnboardingStore()
  const productStore = useProductStore()
  const teamPermissions = usePagePermissions('team')
  const route = useRoute()
  const router = useRouter()

  const loading = ref(false)
  const error = ref<string | null>(null)
  const teams = ref<ApiOrganizationTeam[]>([])
  const productMembers = ref<ApiProductMember[]>([])
  const teamMembersByTeamId = ref<Record<string, ApiOrganizationTeamMember[]>>({})
  const selectedTeamId = ref<string | null>(null)
  const loadingMembersTeamId = ref<string | null>(null)

  const teamSearchQuery = ref('')
  const isManageMode = ref(false)
  const showCreateTeamDialog = ref(false)

  const createTeamName = ref('')
  const createTeamKey = ref('')
  const createTeamDescription = ref('')

  const teamNameDraft = ref('')
  const teamKeyDraft = ref('')
  const teamDescriptionDraft = ref('')

  const memberToAddUserId = ref('')
  const memberToAddRole = ref<TeamMemberRole>('member')

  const teamMutationLoading = ref(false)
  const teamMutationError = ref<string | null>(null)

  const pendingDangerAction = ref<TeamDangerAction | null>(null)

  const activeOrganizationId = computed(() => productStore.activeProduct.organizationId || null)
  const activeProductId = computed(() => productStore.activeProduct.id || null)
  const currentUserId = computed(() => authStore.user?.id || '')

  const activeOrganizationRole = computed<'owner' | 'admin' | 'member' | 'viewer' | null>(() => {
    const organizationId = activeOrganizationId.value
    if (!organizationId) return null
    const organization = onboardingStore.organizations.find((row) => row.id === organizationId)
    return organization?.role || null
  })

  const isOrganizationManager = computed(() => {
    return activeOrganizationRole.value === 'owner' || activeOrganizationRole.value === 'admin'
  })

  const selectedTeam = computed(() => {
    if (!selectedTeamId.value) return null
    return teams.value.find((team) => team.id === selectedTeamId.value) ?? null
  })

  const selectedTeamMembers = computed(() => {
    const teamId = selectedTeamId.value
    if (!teamId) return [] as ApiOrganizationTeamMember[]
    return teamMembersByTeamId.value[teamId] || []
  })

  const selectedTeamMembersLoading = computed(() => {
    if (!selectedTeamId.value) return false
    return loadingMembersTeamId.value === selectedTeamId.value
  })

  const memberByUserId = computed(() => {
    const map = new Map<string, ApiProductMember>()
    for (const member of productMembers.value) map.set(member.userId, member)
    return map
  })

  const selectedTeamLeadUserIds = computed(() => {
    const team = selectedTeam.value
    if (!team) return [] as string[]
    return resolveTeamLeadUserIds(team, selectedTeamMembers.value)
  })

  const selectedTeamMemberCount = computed(() => selectedTeamMembers.value.length)
  const selectedTeamLeadCount = computed(() => selectedTeamLeadUserIds.value.length)

  const isCurrentUserLeadOfSelectedTeam = computed(() => {
    if (!currentUserId.value) return false
    return selectedTeamLeadUserIds.value.includes(currentUserId.value)
  })

  const canCreateTeams = computed(() => {
    return teamPermissions.canCreate.value && isOrganizationManager.value
  })

  const canManageSelectedTeam = computed(() => {
    if (!selectedTeam.value) return false
    if (!teamPermissions.canEdit.value) return false
    return isOrganizationManager.value || isCurrentUserLeadOfSelectedTeam.value
  })

  const canDeleteSelectedTeam = computed(() => {
    return Boolean(selectedTeam.value) && teamPermissions.canDelete.value && isOrganizationManager.value
  })

  const createTeamDisabledReason = computed(() => {
    if (canCreateTeams.value) return 'Create team'
    if (!teamPermissions.canCreate.value) return teamPermissions.deniedReason('create', 'teams')
    return 'Only organization owners/admins can create teams.'
  })

  const selectedTeamAccessHint = computed(() => {
    if (!selectedTeam.value) return ''
    if (canManageSelectedTeam.value) return ''
    if (!teamPermissions.canEdit.value) return teamPermissions.deniedReason('edit', 'teams')
    return 'Read-only: only organization owners/admins or leads of this team can manage changes.'
  })

  const filteredTeams = computed(() => {
    const query = teamSearchQuery.value.trim().toLowerCase()
    const sortedTeams = sortTeamsByName(teams.value)
    if (!query) return sortedTeams
    return sortedTeams.filter((team) => {
      const name = team.name.toLowerCase()
      const key = team.key.toLowerCase()
      return name.includes(query) || key.includes(query)
    })
  })

  const selectedTeamMemberRows = computed<TeamMemberRow[]>(() => {
    const rows = selectedTeamMembers.value.map((member) => ({
      userId: member.userId,
      userName: displayMemberName(member.userId, member.userName),
      userEmail: displayMemberEmail(member.userId, member.userEmail),
      role: asRole(member.role),
    }))
    return rows.sort((left, right) => {
      if (left.role !== right.role) return left.role === 'lead' ? -1 : 1
      return left.userName.localeCompare(right.userName)
    })
  })

  const selectedTeamLeadNames = computed(() => {
    const leadIds = selectedTeamLeadUserIds.value
    if (leadIds.length === 0) return 'No leads assigned'
    const names = leadIds.map((leadUserId) => {
      const teamMember = selectedTeamMembers.value.find((member) => member.userId === leadUserId)
      return displayMemberName(leadUserId, teamMember?.userName)
    })
    return names.join(', ')
  })

  const availableMembersForSelection = computed(() => {
    const currentIds = new Set(selectedTeamMembers.value.map((member) => member.userId))
    return productMembers.value.filter((member) => !currentIds.has(member.userId))
  })

  const showDangerDialog = computed({
    get: () => Boolean(pendingDangerAction.value),
    set: (next) => {
      if (!next) pendingDangerAction.value = null
    },
  })

  const dangerDialogTitle = computed(() => {
    if (!pendingDangerAction.value) return ''
    if (pendingDangerAction.value.type === 'delete-team') return 'Delete Team'
    return 'Remove Team Member'
  })

  const dangerDialogDescription = computed(() => {
    if (!pendingDangerAction.value) return ''
    if (pendingDangerAction.value.type === 'delete-team') {
      return `Delete "${pendingDangerAction.value.label}" permanently? This action cannot be undone.`
    }
    return `Remove "${pendingDangerAction.value.label}" from this team?`
  })

  const dangerDialogConfirmLabel = computed(() => {
    if (!pendingDangerAction.value) return 'Confirm'
    return pendingDangerAction.value.type === 'delete-team' ? 'Delete Team' : 'Remove Member'
  })

  function resetCreateTeamForm() {
    createTeamName.value = ''
    createTeamKey.value = ''
    createTeamDescription.value = ''
  }

  function openCreateTeamDialogPanel() {
    if (!canCreateTeams.value) return
    teamMutationError.value = null
    resetCreateTeamForm()
    showCreateTeamDialog.value = true
  }

  function closeCreateTeamDialogPanel() {
    showCreateTeamDialog.value = false
    resetCreateTeamForm()
  }

  function syncTeamDrafts(team: ApiOrganizationTeam | null) {
    teamNameDraft.value = team?.name || ''
    teamKeyDraft.value = team?.key || ''
    teamDescriptionDraft.value = team?.description || ''
  }

  function displayMemberName(userId: string, fallbackName?: string): string {
    return memberByUserId.value.get(userId)?.userName || fallbackName || 'Unknown member'
  }

  function displayMemberEmail(userId: string, fallbackEmail?: string): string {
    return memberByUserId.value.get(userId)?.userEmail || fallbackEmail || 'No email'
  }

  function teamLeadCount(team: ApiOrganizationTeam): number {
    return resolveTeamLeadUserIds(team, teamMembersByTeamId.value[team.id] || []).length
  }

  function updateTeamInList(teamId: string, updater: (current: ApiOrganizationTeam) => ApiOrganizationTeam) {
    const next = teams.value.map((team) => {
      if (team.id !== teamId) return team
      return updater(team)
    })
    teams.value = sortTeamsByName(next)
  }

  function applyLeadSnapshotToTeam(teamId: string) {
    const members = teamMembersByTeamId.value[teamId] || []
    const leadUserIds = normalizeUserIds(
      members
        .filter((member) => asRole(member.role) === 'lead')
        .map((member) => member.userId),
    )
    updateTeamInList(teamId, (team) => ({
      ...team,
      leadUserIds,
      leadUserId: leadUserIds[0] || null,
    }))
  }

  function syncRouteTeam(teamId: string | null) {
    const current = typeof route.query.team === 'string' ? route.query.team : undefined
    const next = teamId || undefined
    if (current === next) return
    void router.replace({
      query: {
        ...route.query,
        team: next,
      },
    })
  }

  function setSelectedTeam(
    teamId: string | null,
    options: {
      syncRoute?: boolean
      loadMembers?: boolean
      exitManageMode?: boolean
    } = {},
  ) {
    selectedTeamId.value = teamId
    memberToAddUserId.value = ''
    memberToAddRole.value = 'member'
    teamMutationError.value = null
    if (options.exitManageMode !== false) {
      isManageMode.value = false
    }
    syncTeamDrafts(selectedTeam.value)
    if (options.syncRoute !== false) {
      syncRouteTeam(teamId)
    }
    if (teamId && options.loadMembers !== false) {
      void ensureTeamMembersLoaded(teamId)
    }
  }

  async function ensureTeamMembersLoaded(teamId: string, options: { force?: boolean } = {}) {
    const organizationId = activeOrganizationId.value
    if (!organizationId) return
    if (!options.force && teamMembersByTeamId.value[teamId]) return
    if (loadingMembersTeamId.value === teamId) return

    loadingMembersTeamId.value = teamId
    try {
      const members = await organizationTeamsApi.getMembers(organizationId, teamId, authStore.token)
      const normalizedMembers = (Array.isArray(members) ? members : []).map((member) => ({
        ...member,
        organizationTeamId: teamId,
        role: asRole(member.role),
      }))
      teamMembersByTeamId.value = {
        ...teamMembersByTeamId.value,
        [teamId]: normalizedMembers,
      }
      applyLeadSnapshotToTeam(teamId)
    } catch (err) {
      teamMutationError.value = toErrorMessage(err, 'Failed to load team members')
      teamMembersByTeamId.value = {
        ...teamMembersByTeamId.value,
        [teamId]: [],
      }
    } finally {
      if (loadingMembersTeamId.value === teamId) {
        loadingMembersTeamId.value = null
      }
    }
  }

  async function refreshSelectedTeamMembers() {
    if (!selectedTeamId.value) return
    await ensureTeamMembersLoaded(selectedTeamId.value, { force: true })
  }

  async function loadData(preferredTeamId?: string | null) {
    const organizationId = activeOrganizationId.value
    const productId = activeProductId.value
    if (!organizationId || !productId) {
      teams.value = []
      productMembers.value = []
      teamMembersByTeamId.value = {}
      setSelectedTeam(null)
      return
    }

    loading.value = true
    error.value = null
    teamMutationError.value = null
    try {
      const resolvedProductId: string = productId
      if (!onboardingStore.loaded && authStore.token) {
        await onboardingStore.fetchState({ silent: true })
      }

      const [teamList, memberList] = await Promise.all([
        organizationTeamsApi.list(organizationId, { includeMembers: false }, authStore.token),
        productsApi.getMembers(organizationId, resolvedProductId, authStore.token),
      ])

      teams.value = sortTeamsByName((Array.isArray(teamList) ? teamList : []).map((team) => ({
        ...team,
        leadUserIds: resolveTeamLeadUserIds(team),
      })))
      productMembers.value = Array.isArray(memberList) ? memberList : []

      const existingIds = new Set(teams.value.map((team) => team.id))
      const nextMembersByTeamId: Record<string, ApiOrganizationTeamMember[]> = {}
      for (const [teamId, rows] of Object.entries(teamMembersByTeamId.value)) {
        if (existingIds.has(teamId)) nextMembersByTeamId[teamId] = rows
      }
      teamMembersByTeamId.value = nextMembersByTeamId

      const routeTeamId = typeof route.query.team === 'string' ? route.query.team : null
      const requestedTeamId = preferredTeamId || routeTeamId
      const requestedExists = requestedTeamId
        ? teams.value.some((team) => team.id === requestedTeamId)
        : false
      const nextTeamId = requestedExists ? requestedTeamId : (teams.value[0]?.id ?? null)

      setSelectedTeam(nextTeamId, { loadMembers: false })
      if (nextTeamId) {
        await ensureTeamMembersLoaded(nextTeamId)
      }
    } catch (err) {
      error.value = toErrorMessage(err, 'Failed to load teams')
      teams.value = []
      productMembers.value = []
      teamMembersByTeamId.value = {}
      setSelectedTeam(null)
    } finally {
      loading.value = false
    }
  }

  function enterManageMode() {
    if (!selectedTeam.value) return
    if (!canManageSelectedTeam.value) {
      teamMutationError.value = selectedTeamAccessHint.value || 'You do not have permission to manage this team.'
      return
    }
    isManageMode.value = true
  }

  function exitManageMode() {
    isManageMode.value = false
    teamMutationError.value = null
    syncTeamDrafts(selectedTeam.value)
  }

  function ensureManagePermission(subject = 'manage this team'): ApiOrganizationTeam | null {
    const team = selectedTeam.value
    if (!team) return null
    if (canManageSelectedTeam.value) return team
    teamMutationError.value = `You do not have permission to ${subject}.`
    return null
  }

  async function createTeam() {
    const organizationId = activeOrganizationId.value
    if (!organizationId || !canCreateTeams.value) return

    const name = createTeamName.value.trim()
    const key = createTeamKey.value.trim()
    const description = createTeamDescription.value.trim()
    if (name.length < 2) {
      teamMutationError.value = 'Team name must be at least 2 characters.'
      return
    }

    teamMutationLoading.value = true
    teamMutationError.value = null
    try {
      const created = await organizationTeamsApi.create(
        organizationId,
        {
          name,
          key: key || undefined,
          description: description || null,
        },
        authStore.token,
      )

      const normalizedCreated: ApiOrganizationTeam = {
        ...created,
        leadUserIds: resolveTeamLeadUserIds(created),
      }
      teams.value = sortTeamsByName([...teams.value, normalizedCreated])
      teamMembersByTeamId.value = {
        ...teamMembersByTeamId.value,
        [normalizedCreated.id]: [],
      }

      resetCreateTeamForm()
      showCreateTeamDialog.value = false
      setSelectedTeam(normalizedCreated.id)
      await ensureTeamMembersLoaded(normalizedCreated.id, { force: true })
    } catch (err) {
      teamMutationError.value = toErrorMessage(err, 'Failed to create team')
    } finally {
      teamMutationLoading.value = false
    }
  }

  async function saveSelectedTeamDetails() {
    const organizationId = activeOrganizationId.value
    const team = ensureManagePermission('edit team details')
    if (!organizationId || !team) return

    const nextName = teamNameDraft.value.trim()
    const nextKey = teamKeyDraft.value.trim()
    const nextDescription = teamDescriptionDraft.value.trim()
    if (nextName.length < 2) {
      teamMutationError.value = 'Team name must be at least 2 characters.'
      return
    }
    if (!nextKey) {
      teamMutationError.value = 'Team key cannot be empty.'
      return
    }

    const payload: {
      name?: string
      key?: string
      description?: string | null
    } = {}
    if (nextName !== team.name) payload.name = nextName
    if (nextKey !== team.key) payload.key = nextKey
    const currentDescription = team.description || ''
    if (nextDescription !== currentDescription) payload.description = nextDescription || null
    if (Object.keys(payload).length === 0) return

    teamMutationLoading.value = true
    teamMutationError.value = null
    try {
      const updated = await organizationTeamsApi.update(organizationId, team.id, payload, authStore.token)
      updateTeamInList(team.id, (current) => ({
        ...current,
        ...updated,
        leadUserIds: resolveTeamLeadUserIds(updated, teamMembersByTeamId.value[team.id] || []),
      }))
      syncTeamDrafts(selectedTeam.value)
    } catch (err) {
      teamMutationError.value = toErrorMessage(err, 'Failed to update team details')
    } finally {
      teamMutationLoading.value = false
    }
  }

  async function addMemberToSelectedTeam() {
    const organizationId = activeOrganizationId.value
    const team = ensureManagePermission('add team members')
    if (!organizationId || !team) return
    if (!memberToAddUserId.value) {
      teamMutationError.value = 'Select a member to add.'
      return
    }

    teamMutationLoading.value = true
    teamMutationError.value = null
    try {
      await organizationTeamsApi.addMember(
        organizationId,
        team.id,
        {
          userId: memberToAddUserId.value,
          role: memberToAddRole.value,
        },
        authStore.token,
      )
      memberToAddUserId.value = ''
      memberToAddRole.value = 'member'
      await refreshSelectedTeamMembers()
    } catch (err) {
      teamMutationError.value = toErrorMessage(err, 'Failed to add member')
    } finally {
      teamMutationLoading.value = false
    }
  }

  async function updateSelectedTeamMemberRole(payload: {
    userId: string
    role: TeamMemberRole
  }) {
    const organizationId = activeOrganizationId.value
    const team = ensureManagePermission('edit member roles')
    if (!organizationId || !team) return

    const existing = selectedTeamMembers.value.find((member) => member.userId === payload.userId)
    if (!existing) return
    if (asRole(existing.role) === payload.role) return

    teamMutationLoading.value = true
    teamMutationError.value = null
    try {
      await organizationTeamsApi.addMember(
        organizationId,
        team.id,
        {
          userId: payload.userId,
          role: payload.role,
        },
        authStore.token,
      )
      await refreshSelectedTeamMembers()
    } catch (err) {
      teamMutationError.value = toErrorMessage(err, 'Failed to update member role')
    } finally {
      teamMutationLoading.value = false
    }
  }

  function requestRemoveMember(userId: string) {
    const team = ensureManagePermission('remove team members')
    if (!team) return
    const member = selectedTeamMemberRows.value.find((row) => row.userId === userId)
    pendingDangerAction.value = {
      type: 'remove-member',
      userId,
      teamId: team.id,
      label: member?.userName || 'this member',
    }
  }

  function requestDeleteSelectedTeam() {
    const team = selectedTeam.value
    if (!team || !canDeleteSelectedTeam.value) return
    pendingDangerAction.value = {
      type: 'delete-team',
      teamId: team.id,
      label: team.name,
    }
  }

  function cancelDangerAction() {
    pendingDangerAction.value = null
  }

  async function removeMemberFromSelectedTeam(userId: string) {
    const organizationId = activeOrganizationId.value
    const team = ensureManagePermission('remove team members')
    if (!organizationId || !team) return

    teamMutationLoading.value = true
    teamMutationError.value = null
    try {
      await organizationTeamsApi.removeMember(organizationId, team.id, userId, authStore.token)
      await refreshSelectedTeamMembers()
    } catch (err) {
      teamMutationError.value = toErrorMessage(err, 'Failed to remove member')
    } finally {
      teamMutationLoading.value = false
    }
  }

  async function deleteSelectedTeam() {
    const organizationId = activeOrganizationId.value
    const team = selectedTeam.value
    if (!organizationId || !team || !canDeleteSelectedTeam.value) return

    teamMutationLoading.value = true
    teamMutationError.value = null
    try {
      await organizationTeamsApi.remove(organizationId, team.id, authStore.token)
      teams.value = teams.value.filter((row) => row.id !== team.id)
      const nextMembers = { ...teamMembersByTeamId.value }
      delete nextMembers[team.id]
      teamMembersByTeamId.value = nextMembers

      const nextTeamId = teams.value[0]?.id ?? null
      setSelectedTeam(nextTeamId, { loadMembers: false })
      if (nextTeamId) {
        await ensureTeamMembersLoaded(nextTeamId)
      }
    } catch (err) {
      teamMutationError.value = toErrorMessage(err, 'Failed to delete team')
    } finally {
      teamMutationLoading.value = false
    }
  }

  async function confirmDangerAction() {
    const action = pendingDangerAction.value
    if (!action) return
    pendingDangerAction.value = null
    if (action.type === 'remove-member' && action.userId) {
      await removeMemberFromSelectedTeam(action.userId)
      return
    }
    if (action.type === 'delete-team') {
      await deleteSelectedTeam()
    }
  }

  watch(
    () => [productStore.activeProduct.id, productStore.activeProduct.organizationId, authStore.token],
    () => {
      void loadData()
    },
  )

  watch(
    () => route.query.team,
    (value) => {
      if (typeof value !== 'string') return
      if (!teams.value.some((team) => team.id === value)) return
      if (selectedTeamId.value === value) return
      setSelectedTeam(value, { syncRoute: false })
    },
  )

  watch(selectedTeam, (team) => {
    syncTeamDrafts(team)
  })

  watch(canManageSelectedTeam, (allowed) => {
    if (!allowed && isManageMode.value) {
      isManageMode.value = false
    }
  })

  watch(showCreateTeamDialog, (open) => {
    if (!open) {
      resetCreateTeamForm()
    }
  })

  onMounted(async () => {
    await loadData()
  })

  return {
    loading,
    error,
    teamMutationLoading,
    teamMutationError,
    teams,
    filteredTeams,
    productMembers,
    selectedTeamId,
    selectedTeam,
    selectedTeamMembersLoading,
    selectedTeamMemberRows,
    selectedTeamMemberCount,
    selectedTeamLeadNames,
    selectedTeamLeadCount,
    selectedTeamAccessHint,
    selectedTeamLeadUserIds,
    canCreateTeams,
    createTeamDisabledReason,
    canManageSelectedTeam,
    canDeleteSelectedTeam,
    showCreateTeamDialog,
    createTeamName,
    createTeamKey,
    createTeamDescription,
    teamNameDraft,
    teamKeyDraft,
    teamDescriptionDraft,
    memberToAddUserId,
    memberToAddRole,
    availableMembersForSelection,
    teamSearchQuery,
    isManageMode,
    openCreateTeamDialogPanel,
    closeCreateTeamDialogPanel,
    showDangerDialog,
    dangerDialogTitle,
    dangerDialogDescription,
    dangerDialogConfirmLabel,
    setSelectedTeam,
    enterManageMode,
    exitManageMode,
    resetCreateTeamForm,
    createTeam,
    saveSelectedTeamDetails,
    addMemberToSelectedTeam,
    updateSelectedTeamMemberRole,
    requestRemoveMember,
    requestDeleteSelectedTeam,
    confirmDangerAction,
    cancelDangerAction,
    teamLeadCount,
  }
}
