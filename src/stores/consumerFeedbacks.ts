import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ConsumerFeedback } from '@/types/consumerFeedback'
import { useAuthStore } from './auth'

const API = '/api/consumer-feedbacks'

export const useConsumerFeedbacksStore = defineStore('consumerFeedbacks', () => {
  const items = ref<ConsumerFeedback[]>([])
  const loading = ref(false)

  function authHeaders() {
    const auth = useAuthStore()
    return { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }
  }

  async function fetchAll(product?: string) {
    loading.value = true
    try {
      const params = product ? `?product=${encodeURIComponent(product)}` : ''
      const res = await fetch(`${API}${params}`)
      if (res.ok) items.value = await res.json()
    } finally { loading.value = false }
  }

  async function fetchOne(id: string): Promise<ConsumerFeedback | null> {
    try {
      const res = await fetch(`${API}/${id}`)
      if (!res.ok) return null
      return await res.json()
    } catch { return null }
  }

  async function create(data: any): Promise<ConsumerFeedback | null> {
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      if (!res.ok) return null
      const created = await res.json()
      await fetchAll(data.productId)
      return created
    } catch { return null }
  }

  async function update(id: string, data: any): Promise<boolean> {
    try {
      const res = await fetch(`${API}/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(data) })
      return res.ok
    } catch { return false }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE', headers: authHeaders() })
      if (res.ok) items.value = items.value.filter(i => i.id !== id)
      return res.ok
    } catch { return false }
  }

  async function addComment(id: string, content: string, isInternal = false) {
    try {
      const res = await fetch(`${API}/${id}/comments`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ content, isInternal }),
      })
      if (!res.ok) return null
      return await res.json()
    } catch { return null }
  }

  return { items, loading, fetchAll, fetchOne, create, update, remove, addComment }
})
