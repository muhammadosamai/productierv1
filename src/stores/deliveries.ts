import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Delivery, CreateDeliveryPayload } from '@/types/delivery'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'

const API_BASE = '/api'

function authHeaders() {
  const authStore = useAuthStore()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authStore.token}`,
  }
}

export const useDeliveriesStore = defineStore('deliveries', () => {
  const deliveries = ref<Delivery[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const deliveryCount = computed(() => deliveries.value.length)

  async function fetchDeliveries(productName?: string) {
    const product = productName || useProductStore().activeProductScopeForApi
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/deliveries?product=${encodeURIComponent(product)}`)
      if (!res.ok) throw new Error('Failed to fetch deliveries')
      deliveries.value = await res.json()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function fetchDelivery(id: string): Promise<Delivery | null> {
    try {
      const res = await fetch(`${API_BASE}/deliveries/${id}`)
      if (!res.ok) throw new Error('Failed to fetch delivery')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function createDelivery(payload: CreateDeliveryPayload): Promise<Delivery | null> {
    try {
      const res = await fetch(`${API_BASE}/deliveries`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to create delivery')
      const created = await res.json()
      await fetchDeliveries()
      return created
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function updateDelivery(id: string, payload: Partial<CreateDeliveryPayload>) {
    try {
      const res = await fetch(`${API_BASE}/deliveries/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to update delivery')
      await fetchDeliveries()
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function deleteDelivery(id: string) {
    try {
      const res = await fetch(`${API_BASE}/deliveries/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Failed to delete delivery')
      deliveries.value = deliveries.value.filter(d => d.id !== id)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  return {
    deliveries, loading, error, deliveryCount,
    fetchDeliveries, fetchDelivery, createDelivery, updateDelivery, deleteDelivery,
  }
})
