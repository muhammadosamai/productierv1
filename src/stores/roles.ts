import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import type { UserRole } from '@/types/user'

export interface PagePermission {
  visible: boolean
  canCreate: boolean
  canEdit: boolean
  selfViewOnly: boolean
}

const CONTROLLABLE_PAGES = [
  'home', 'overview', 'wiki', 'team', 'initiatives', 'stories', 'tasks',
  'deliveries', 'releases', 'test-cycles', 'performance-cycles', 'issues', 'feedbacks',
  'feature-requests', 'users', 'integrations', 'settings',
]

// Map route paths to page keys
const ROUTE_TO_PAGE: Record<string, string> = {
  '/home': 'home',
  '/metrics': 'overview',
  '/wiki': 'wiki',
  '/team': 'team',
  '/initiatives': 'initiatives',
  '/stories': 'stories',
  '/backlog': 'stories',
  '/tasks': 'tasks',
  '/deliveries': 'deliveries',
  '/releases': 'releases',
  '/test-cycles': 'test-cycles',
  '/performance-cycles': 'performance-cycles',
  '/issues': 'issues',
  '/feedbacks': 'feedbacks',
  '/feature-requests': 'feature-requests',
  '/users': 'users',
  '/integrations': 'integrations',
  '/settings': 'settings',
}

const DEFAULT_PERMISSION: PagePermission = { visible: true, canCreate: true, canEdit: true, selfViewOnly: false }

export const useRolesStore = defineStore('roles', () => {
  const authStore = useAuthStore()

  // Current user's page permissions
  const myPages = ref<Record<string, PagePermission>>({})
  const loaded = ref(false)
  const loading = ref(false)

  // All role permissions (for super_admin management UI)
  const allPermissions = ref<Record<string, Record<string, PagePermission>>>({})

  function getPagePermission(page: string): PagePermission {
    if (authStore.user?.role === 'super_admin') return { visible: true, canCreate: true, canEdit: true, selfViewOnly: false }
    if (!loaded.value) return DEFAULT_PERMISSION
    return myPages.value[page] || DEFAULT_PERMISSION
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

  function isSelfViewOnly(page: string): boolean {
    return getPagePermission(page).selfViewOnly
  }

  function canAccessRoute(path: string): boolean {
    // Find matching page key from route path
    const basePath = '/' + path.split('/').filter(Boolean)[0]
    const page = ROUTE_TO_PAGE[basePath]
    if (!page) return true // unknown routes are accessible
    return canAccess(page)
  }

  async function fetchMyPermissions() {
    if (loading.value) return
    loading.value = true
    try {
      const res = await fetch('/api/roles/my-permissions', {
        headers: { Authorization: `Bearer ${authStore.token}` },
      })
      if (res.ok) {
        const data = await res.json()
        myPages.value = data.pages
        loaded.value = true
      }
    } catch {
      // On error, default all to visible
    } finally {
      loading.value = false
    }
  }

  async function fetchAllPermissions() {
    try {
      const res = await fetch('/api/roles/permissions', {
        headers: { Authorization: `Bearer ${authStore.token}` },
      })
      if (res.ok) {
        const data = await res.json()
        allPermissions.value = data.permissions
      }
    } catch {
      // ignore
    }
  }

  async function updateRolePermissions(role: string, pages: Record<string, PagePermission>) {
    const res = await fetch('/api/roles/permissions', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({ role, pages }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Failed to update permissions')
    }
    // Refresh all permissions
    await fetchAllPermissions()
  }

  return {
    myPages,
    loaded,
    loading,
    allPermissions,
    canAccess,
    canCreate,
    canEdit,
    isSelfViewOnly,
    canAccessRoute,
    getPagePermission,
    fetchMyPermissions,
    fetchAllPermissions,
    updateRolePermissions,
    CONTROLLABLE_PAGES,
    ROUTE_TO_PAGE,
  }
})
