import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FeatureRequest, CreateFeatureRequestPayload, FeatureRequestComment } from '@/types/featureRequest'
import { useAuthStore } from './auth'

const API_BASE = '/api/feature-requests'

export const useFeatureRequestsStore = defineStore('featureRequests', () => {
  const items = ref<FeatureRequest[]>([])
  const loading = ref(false)

  function authHeaders() {
    const authStore = useAuthStore()
    return { Authorization: `Bearer ${authStore.token}`, 'Content-Type': 'application/json' }
  }

  async function fetchAll(product?: string, sort?: string) {
    loading.value = true
    try {
      const params = new URLSearchParams()
      if (product) params.set('product', product)
      if (sort) params.set('sort', sort)
      const res = await fetch(`${API_BASE}?${params}`)
      if (res.ok) items.value = await res.json()
    } finally {
      loading.value = false
    }
  }

  async function create(payload: CreateFeatureRequestPayload): Promise<FeatureRequest | null> {
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) return null
      const created = await res.json()
      await fetchAll(payload.productId)
      return created
    } catch { return null }
  }

  async function update(id: string, data: Partial<FeatureRequest>): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(data),
      })
      return res.ok
    } catch { return false }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (res.ok) {
        items.value = items.value.filter(i => i.id !== id)
      }
      return res.ok
    } catch { return false }
  }

  async function toggleUpvote(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/${id}/upvote`, {
        method: 'POST',
        headers: authHeaders(),
      })
      return res.ok
    } catch { return false }
  }

  async function addComment(id: string, content: string): Promise<FeatureRequestComment | null> {
    try {
      const res = await fetch(`${API_BASE}/${id}/comments`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content }),
      })
      if (!res.ok) return null
      return await res.json()
    } catch { return null }
  }

  return { items, loading, fetchAll, create, update, remove, toggleUpvote, addComment }
})
