import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { rolesApi } from '@/lib/apiClient'
import { useMetadataStore } from './metadata'
import type { UserRole, UserTitle } from '@/types/user'

export interface PagePermission {
  visible: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  selfViewOnly: boolean
}

export interface PageCatalogEntry {
  key: string
  label: string
  routePrefixes: string[]
  selfViewConfigurable: boolean
}

export interface ConfigurableRoleCatalogEntry {
  key: UserRole
  label: string
}

export interface TitleCatalogEntry {
  id: string
  key: string
  name: string
  description: string | null
  isActive: boolean
  isSystem: boolean
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
  assignedUsersCount: number
  permissionCount: number
}

const FULL_PERMISSION: PagePermission = {
  visible: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  selfViewOnly: false,
}

const DENY_PERMISSION: PagePermission = {
  visible: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  selfViewOnly: false,
}

export const useRolesStore = defineStore('roles', () => {
  const authStore = useAuthStore()
  const metadataStore = useMetadataStore()

  // Current user's page permissions
  const myPages = ref<Record<string, PagePermission>>({})
  const loaded = ref(false)
  const loadedForUserId = ref<string | null>(null)
  const loading = ref(false)

  // All role permissions (for super_admin management UI)
  const allPermissions = ref<Record<string, Record<string, PagePermission>>>({})

  // Title catalog + title permission matrices (single title per user)
  const titles = ref<TitleCatalogEntry[]>([])
  const titlePermissions = ref<Record<string, Record<string, PagePermission>>>({})

  // Effective permission context for current user
  const myTitle = ref<UserTitle | null>(null)
  const fallbackToRoleOnly = ref(true)
  const effectivePermissionFormula = ref(
    'roleHardLimit ∩ (rolePermissionProfile ∪ titlePermissionProfile) ∩ productMembershipScope'
  )

  const routePrefixesByPage = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    for (const route of metadataStore.routes) {
      if (!map[route.pageKey]) map[route.pageKey] = []
      if (!map[route.pageKey]!.includes(route.pathPrefix)) {
        map[route.pageKey]!.push(route.pathPrefix)
      }
    }
    return map
  })

  const pageCatalog = computed<PageCatalogEntry[]>(() => {
    return metadataStore.pages.map((entry) => ({
      key: entry.key,
      label: entry.label,
      routePrefixes: routePrefixesByPage.value[entry.key] ?? [],
      selfViewConfigurable: entry.selfViewOnlySupported,
    }))
  })

  const configurableRoles = computed<ConfigurableRoleCatalogEntry[]>(() => {
    return metadataStore.configurableRoles.map((entry) => ({
      key: entry.key,
      label: entry.label,
    }))
  })

  const CONTROLLABLE_PAGES = computed(() => pageCatalog.value.map((entry) => entry.key))
  const controllablePageSet = computed(() => new Set(CONTROLLABLE_PAGES.value))

  const pageCatalogByKey = computed<Record<string, PageCatalogEntry>>(() => {
    const map: Record<string, PageCatalogEntry> = {}
    for (const entry of pageCatalog.value) {
      map[entry.key] = entry
    }
    return map
  })

  function getPagePermission(page: string): PagePermission {
    if (authStore.user?.role === 'super_admin') {
      return FULL_PERMISSION
    }
    if (!loaded.value || loadedForUserId.value !== authStore.user?.id) return DENY_PERMISSION
    if (!controllablePageSet.value.has(page)) return DENY_PERMISSION
    return myPages.value[page] || DENY_PERMISSION
  }

  function canAccess(page: string): boolean {
    return getPagePermission(page).visible
  }

  function canCreate(page: string): boolean {
    const perm = getPagePermission(page)
    return perm.visible && perm.canCreate
  }

  function canEdit(page: string): boolean {
    const perm = getPagePermission(page)
    return perm.visible && perm.canEdit
  }

  function canDelete(page: string): boolean {
    const perm = getPagePermission(page)
    return perm.visible && perm.canDelete
  }

  function isSelfViewOnly(page: string): boolean {
    return getPagePermission(page).selfViewOnly
  }

  const firstAccessibleRoute = computed<string | null>(() => {
    if (authStore.user?.role === 'super_admin') return '/home'
    if (!metadataStore.loaded.routes) return null
    for (const route of metadataStore.routes) {
      if (canAccess(route.pageKey)) return route.pathPrefix
    }
    return null
  })

  function canAccessRoute(path: string): boolean {
    if (authStore.user?.role === 'super_admin') return true
    if (!metadataStore.loaded.routes) return false
    const page = metadataStore.resolvePageForPath(path)
    if (!page) return false
    return canAccess(page)
  }

  async function fetchCatalog() {
    try {
      await metadataStore.ensureLoaded(['pages', 'routes'])
    } catch {
      // metadata store keeps previous values and error state
    }
  }

  async function fetchMyPermissions() {
    if (loading.value) return
    const currentUserId = authStore.user?.id || null
    if (!currentUserId) {
      reset()
      return
    }
    loading.value = true
    try {
      await fetchCatalog()
      const data = await rolesApi.getMyPermissions(authStore.token)
      myPages.value = data.pages || {}
      myTitle.value = data.title ?? null
      fallbackToRoleOnly.value = data.fallbackToRoleOnly ?? !data.title
      if (data.effectivePermissionFormula) {
        effectivePermissionFormula.value = data.effectivePermissionFormula
      }
      loaded.value = true
      loadedForUserId.value = currentUserId
    } catch {
      myPages.value = {}
      myTitle.value = null
      fallbackToRoleOnly.value = true
      loaded.value = false
      loadedForUserId.value = null
    } finally {
      loading.value = false
    }
  }

  function reset() {
    myPages.value = {}
    loaded.value = false
    loadedForUserId.value = null
    allPermissions.value = {}
    titles.value = []
    titlePermissions.value = {}
    myTitle.value = null
    fallbackToRoleOnly.value = true
    effectivePermissionFormula.value =
      'roleHardLimit ∩ (rolePermissionProfile ∪ titlePermissionProfile) ∩ productMembershipScope'
  }

  async function fetchAllPermissions() {
    try {
      await fetchCatalog()
      const data = await rolesApi.getPermissions(authStore.token)
      allPermissions.value = data.permissions || {}
    } catch {
      // ignore
    }
  }

  async function updateRolePermissions(role: string, pages: Record<string, PagePermission>) {
    const controllable = controllablePageSet.value
    const sanitized: Record<string, PagePermission> = {}
    for (const [page, permission] of Object.entries(pages)) {
      if (!controllable.has(page)) continue
      sanitized[page] = { ...permission }
    }
    await rolesApi.updatePermissions(role, sanitized, authStore.token)
    // Refresh all permissions
    await fetchAllPermissions()
  }

  async function fetchTitles() {
    try {
      const data = await rolesApi.getTitles(authStore.token)
      titles.value = (data.titles || []).map((entry) => ({
        id: entry.id,
        key: entry.key,
        name: entry.name,
        description: entry.description ?? null,
        isActive: entry.isActive,
        isSystem: entry.isSystem,
        createdByUserId: entry.createdByUserId ?? null,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        assignedUsersCount: entry.assignedUsersCount ?? 0,
        permissionCount: entry.permissionCount ?? 0,
      }))
      if (data.effectivePermissionFormula) {
        effectivePermissionFormula.value = data.effectivePermissionFormula
      }
    } catch {
      // ignore in UI; callers can decide if they need explicit errors
    }
  }

  async function createTitle(payload: {
    name: string
    key?: string
    description?: string
    baseRole?: string
  }) {
    await rolesApi.createTitle(payload, authStore.token)
    await fetchTitles()
  }

  async function updateTitle(titleId: string, payload: {
    name?: string
    description?: string | null
    isActive?: boolean
  }) {
    await rolesApi.updateTitle(titleId, payload, authStore.token)
    await fetchTitles()
  }

  async function fetchTitlePermissions(titleId: string) {
    const data = await rolesApi.getTitlePermissions(titleId, authStore.token)
    titlePermissions.value[titleId] = data.pages || {}
    if (data.effectivePermissionFormula) {
      effectivePermissionFormula.value = data.effectivePermissionFormula
    }
    return titlePermissions.value[titleId] || {}
  }

  async function updateTitlePermissions(titleId: string, pages: Record<string, PagePermission>) {
    const controllable = controllablePageSet.value
    const sanitized: Record<string, PagePermission> = {}
    for (const [page, permission] of Object.entries(pages)) {
      if (!controllable.has(page)) continue
      sanitized[page] = { ...permission }
    }
    await rolesApi.updateTitlePermissions(titleId, sanitized, authStore.token)
    await fetchTitlePermissions(titleId)
    await fetchTitles()
  }

  return {
    myPages,
    loaded,
    loadedForUserId,
    loading,
    allPermissions,
    titles,
    titlePermissions,
    myTitle,
    fallbackToRoleOnly,
    effectivePermissionFormula,
    pageCatalog,
    pageCatalogByKey,
    configurableRoles,
    canAccess,
    canCreate,
    canEdit,
    canDelete,
    isSelfViewOnly,
    firstAccessibleRoute,
    canAccessRoute,
    getPagePermission,
    fetchCatalog,
    fetchMyPermissions,
    reset,
    fetchAllPermissions,
    fetchTitles,
    createTitle,
    updateTitle,
    fetchTitlePermissions,
    updateTitlePermissions,
    updateRolePermissions,
    CONTROLLABLE_PAGES,
  }
})
