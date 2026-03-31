import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { assertPageAction, ensureOk } from '@/lib/storeAuthz'
import { apiFetch } from '@/lib/apiClient'
import { buildProductScopedPath, resolveProductScope } from '@/lib/productScopeApi'

export interface ProductMember {
  id: string
  productId: string
  role: string
  addedAt: string
  userId: string
  userName: string
  userEmail?: string
  userAvatar: string | null
  userRole: string
}

export const useProductMembersStore = defineStore('productMembers', () => {
  const members = ref<ProductMember[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  function authToken() {
    return useAuthStore().token
  }

  async function fetchMembers(productId: string) {
    assertPageAction('team', 'read', 'team members')
    const scope = resolveProductScope(productId)
    if (!scope) {
      error.value = 'No active product selected'
      members.value = []
      return
    }
    loading.value = true
    error.value = null
    try {
      const res = await apiFetch(buildProductScopedPath(scope, '/members'), {
        token: authToken(),
      })
      await ensureOk(res, 'Failed to fetch members')
      members.value = await res.json()
    } catch (e) {
      error.value = (e as Error).message
      members.value = []
    } finally {
      loading.value = false
    }
  }

  async function addMember(productId: string, userId: string, role?: string): Promise<boolean> {
    try {
      assertPageAction('team', 'create', 'team members')
      const scope = resolveProductScope(productId)
      if (!scope) {
        error.value = 'No active product selected'
        return false
      }
      const res = await apiFetch(buildProductScopedPath(scope, '/members'), {
        method: 'POST',
        token: authToken(),
        json: { userId, role },
      })
      await ensureOk(res, 'Failed to add member')
      await fetchMembers(productId)
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  async function removeMember(productId: string, userId: string): Promise<boolean> {
    try {
      assertPageAction('team', 'delete', 'team members')
      const scope = resolveProductScope(productId)
      if (!scope) {
        error.value = 'No active product selected'
        return false
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/members/${userId}`), {
        method: 'DELETE',
        token: authToken(),
      })
      await ensureOk(res, 'Failed to remove member')
      members.value = members.value.filter(m => m.userId !== userId)
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  return { members, loading, error, fetchMembers, addMember, removeMember }
})
