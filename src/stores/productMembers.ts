import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface ProductMember {
  id: string
  product: string
  /** Present when API returns it; use for disambiguation when display names duplicate. */
  productId?: string
  role: string
  addedAt: string
  userId: string
  userName: string
  userEmail: string
  userAvatar: string | null
  userRole: string
}

const API_BASE = '/api'

export const useProductMembersStore = defineStore('productMembers', () => {
  const members = ref<ProductMember[]>([])
  const loading = ref(false)

  async function fetchMembers(product: string) {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/products/${encodeURIComponent(product)}/members`)
      if (res.ok) {
        members.value = await res.json()
      }
    } catch (e) {
      console.error('Failed to fetch members:', e)
    } finally {
      loading.value = false
    }
  }

  async function addMember(product: string, userId: string, role?: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/products/${encodeURIComponent(product)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      })
      if (res.ok) {
        await fetchMembers(product)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function removeMember(product: string, userId: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/products/${encodeURIComponent(product)}/members/${userId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        members.value = members.value.filter(m => m.userId !== userId)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  return { members, loading, fetchMembers, addMember, removeMember }
})
