import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Initiative, CreateInitiativePayload } from '@/types/initiative'
import { useProductStore } from '@/stores/products'

const API_BASE = '/api'

export const useInitiativesStore = defineStore('initiatives', () => {
  const initiatives = ref<Initiative[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const initiativeCount = computed(() => initiatives.value.length)

  async function fetchInitiatives(productScope?: string) {
    const ps = useProductStore()
    const product = productScope || ps.activeProductApiRef || ''
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/initiatives?product=${encodeURIComponent(product)}`)
      if (!res.ok) throw new Error('Failed to fetch initiatives')
      initiatives.value = await res.json()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function fetchInitiative(id: string): Promise<Initiative | null> {
    try {
      const res = await fetch(`${API_BASE}/initiatives/${id}`)
      if (!res.ok) throw new Error('Failed to fetch initiative')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function createInitiative(payload: CreateInitiativePayload): Promise<Initiative | null> {
    try {
      const res = await fetch(`${API_BASE}/initiatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to create initiative')
      const created = await res.json()
      await fetchInitiatives()
      return created
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function updateInitiative(id: string, payload: Partial<CreateInitiativePayload>) {
    try {
      const res = await fetch(`${API_BASE}/initiatives/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to update initiative')
      await fetchInitiatives()
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function deleteInitiative(id: string) {
    try {
      const res = await fetch(`${API_BASE}/initiatives/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete initiative')
      initiatives.value = initiatives.value.filter(i => i.id !== id)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  return {
    initiatives, loading, error, initiativeCount,
    fetchInitiatives, fetchInitiative, createInitiative, updateInitiative, deleteInitiative,
  }
})
