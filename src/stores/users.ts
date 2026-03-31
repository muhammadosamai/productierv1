import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useOnboardingStore } from '@/stores/onboarding'
import { assertPageAction, ensureOk } from '@/lib/storeAuthz'
import type { UserRole, UserTitle } from '@/types/user'
import { apiFetch } from '@/lib/apiClient'

function resolveOrganizationId(): string {
  const organizationId = useOnboardingStore().activeOrganizationId?.trim() || ''
  if (!organizationId) {
    throw new Error('No active organization selected')
  }
  return organizationId
}

function scopedApiBase(): string {
  return `/organizations/${encodeURIComponent(resolveOrganizationId())}/users-admin`
}

export interface ManagedUser {
  id: string
  name: string
  email: string
  role: UserRole
  title?: UserTitle | null
  titleId?: string | null
  isActive: boolean
  avatar: string | null
  createdAt: string
  updatedAt: string
  membershipsCount?: number
}

export interface UserMembership {
  id: string
  userId: string
  productId: string
  role: string
  addedAt: string
}

interface ListFilters {
  q?: string
  role?: string
  active?: 'true' | 'false' | ''
  limit?: number
}

function authToken() {
  return useAuthStore().token
}

export const useUsersStore = defineStore('users-admin', () => {
  const users = ref<ManagedUser[]>([])
  const memberships = ref<UserMembership[]>([])
  const selectedUser = ref<ManagedUser | null>(null)
  const loading = ref(false)
  const membershipsLoading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  const userCount = computed(() => users.value.length)

  async function fetchUsers(filters: ListFilters = {}) {
    assertPageAction('users', 'read', 'users')
    loading.value = true
    error.value = null
    try {
      const params = new URLSearchParams()
      params.set('limit', String(filters.limit ?? 150))
      if (filters.q?.trim()) params.set('q', filters.q.trim())
      if (filters.role?.trim()) params.set('role', filters.role.trim())
      if (filters.active === 'true' || filters.active === 'false') params.set('active', filters.active)

      const res = await apiFetch(scopedApiBase(), {
        token: authToken(),
        query: Object.fromEntries(params.entries()),
      })
      await ensureOk(res, 'Failed to fetch users')
      users.value = await res.json()
    } catch (e) {
      error.value = (e as Error).message
      users.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchUser(userId: string): Promise<ManagedUser | null> {
    assertPageAction('users', 'read', 'user details')
    error.value = null
    try {
      const res = await apiFetch(`${scopedApiBase()}/${encodeURIComponent(userId)}`, {
        token: authToken(),
      })
      await ensureOk(res, 'Failed to fetch user details')
      const full = await res.json() as ManagedUser & { memberships?: UserMembership[] }
      selectedUser.value = {
        id: full.id,
        name: full.name,
        email: full.email,
        role: full.role,
        title: full.title ?? null,
        titleId: full.titleId ?? full.title?.id ?? null,
        isActive: full.isActive,
        avatar: full.avatar,
        createdAt: full.createdAt,
        updatedAt: full.updatedAt,
      }
      memberships.value = Array.isArray(full.memberships) ? full.memberships : []
      return selectedUser.value
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function fetchMemberships(userId: string) {
    assertPageAction('users', 'read', 'memberships')
    membershipsLoading.value = true
    error.value = null
    try {
      const res = await apiFetch(`${scopedApiBase()}/${encodeURIComponent(userId)}/memberships`, {
        token: authToken(),
      })
      await ensureOk(res, 'Failed to fetch memberships')
      memberships.value = await res.json()
    } catch (e) {
      error.value = (e as Error).message
      memberships.value = []
    } finally {
      membershipsLoading.value = false
    }
  }

  async function updateUserRole(userId: string, role: UserRole): Promise<boolean> {
    assertPageAction('users', 'edit', 'update user role')
    saving.value = true
    error.value = null
    try {
      const res = await apiFetch(`${scopedApiBase()}/${encodeURIComponent(userId)}/role`, {
        method: 'PUT',
        token: authToken(),
        json: { role },
      })
      await ensureOk(res, 'Failed to update role')
      const updated = await res.json() as ManagedUser
      users.value = users.value.map((u) => (u.id === updated.id ? { ...u, role: updated.role, updatedAt: updated.updatedAt } : u))
      if (selectedUser.value?.id === updated.id) {
        selectedUser.value = { ...selectedUser.value, role: updated.role, updatedAt: updated.updatedAt }
      }
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    } finally {
      saving.value = false
    }
  }

  async function updateUserStatus(userId: string, isActive: boolean): Promise<boolean> {
    assertPageAction('users', 'edit', 'update user status')
    saving.value = true
    error.value = null
    try {
      const res = await apiFetch(`${scopedApiBase()}/${encodeURIComponent(userId)}/status`, {
        method: 'PUT',
        token: authToken(),
        json: { isActive },
      })
      await ensureOk(res, 'Failed to update user status')
      const updated = await res.json() as ManagedUser
      users.value = users.value.map((u) => (u.id === updated.id ? { ...u, isActive: updated.isActive, updatedAt: updated.updatedAt } : u))
      if (selectedUser.value?.id === updated.id) {
        selectedUser.value = { ...selectedUser.value, isActive: updated.isActive, updatedAt: updated.updatedAt }
      }
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    } finally {
      saving.value = false
    }
  }

  async function updateUserTitle(userId: string, titleId: string | null): Promise<boolean> {
    assertPageAction('users', 'edit', 'update user title')
    saving.value = true
    error.value = null
    try {
      const res = await apiFetch(`${scopedApiBase()}/${encodeURIComponent(userId)}/title`, {
        method: 'PUT',
        token: authToken(),
        json: { titleId },
      })
      await ensureOk(res, 'Failed to update user title')
      const updated = await res.json() as ManagedUser
      users.value = users.value.map((u) => (
        u.id === updated.id
          ? {
            ...u,
            title: updated.title ?? null,
            titleId: updated.titleId ?? updated.title?.id ?? null,
          }
          : u
      ))
      if (selectedUser.value?.id === updated.id) {
        selectedUser.value = {
          ...selectedUser.value,
          title: updated.title ?? null,
          titleId: updated.titleId ?? updated.title?.id ?? null,
        }
      }
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    } finally {
      saving.value = false
    }
  }

  async function addMembership(userId: string, productId: string, role = 'member'): Promise<boolean> {
    assertPageAction('users', 'edit', 'add product membership')
    saving.value = true
    error.value = null
    try {
      const res = await apiFetch(`${scopedApiBase()}/${encodeURIComponent(userId)}/memberships`, {
        method: 'POST',
        token: authToken(),
        json: { productId, role },
      })
      await ensureOk(res, 'Failed to add membership')
      await fetchMemberships(userId)
      await fetchUsers()
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    } finally {
      saving.value = false
    }
  }

  async function removeMembership(userId: string, productId: string): Promise<boolean> {
    assertPageAction('users', 'edit', 'remove product membership')
    saving.value = true
    error.value = null
    try {
      const res = await apiFetch(`${scopedApiBase()}/${encodeURIComponent(userId)}/memberships/${encodeURIComponent(productId)}`, {
        method: 'DELETE',
        token: authToken(),
      })
      await ensureOk(res, 'Failed to remove membership')
      memberships.value = memberships.value.filter((m) => !(m.userId === userId && m.productId === productId))
      await fetchUsers()
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    users,
    memberships,
    selectedUser,
    loading,
    membershipsLoading,
    saving,
    error,
    userCount,
    fetchUsers,
    fetchUser,
    fetchMemberships,
    updateUserRole,
    updateUserStatus,
    updateUserTitle,
    addMembership,
    removeMembership,
  }
})

