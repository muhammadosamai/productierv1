import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Server, CreateServerPayload, Environment } from '@/types/release'
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

export const useServersStore = defineStore('servers', () => {
  const servers = ref<Server[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchServers(environment?: Environment) {
    const productStore = useProductStore()
    const product = productStore.activeProductScopeForApi
    loading.value = true
    error.value = null
    try {
      let url = `${API_BASE}/servers?product=${encodeURIComponent(product)}`
      if (environment) url += `&environment=${environment}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch servers')
      servers.value = await res.json()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function createServer(payload: CreateServerPayload): Promise<Server | null> {
    try {
      const res = await fetch(`${API_BASE}/servers`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to create server')
      const created = await res.json()
      await fetchServers()
      return created
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function updateServer(id: string, payload: Partial<CreateServerPayload>) {
    try {
      const res = await fetch(`${API_BASE}/servers/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to update server')
      await fetchServers()
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function deleteServer(id: string) {
    try {
      const res = await fetch(`${API_BASE}/servers/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Failed to delete server')
      servers.value = servers.value.filter(s => s.id !== id)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  return {
    servers, loading, error,
    fetchServers, createServer, updateServer, deleteServer,
  }
})
