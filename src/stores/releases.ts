import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Release, CreateReleasePayload, TargetStatus } from '@/types/release'
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

export const useReleasesStore = defineStore('releases', () => {
  const releases = ref<Release[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const releaseCount = computed(() => releases.value.length)

  async function fetchReleases(productName?: string) {
    const product = productName || useProductStore().activeProductName
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/releases?product=${encodeURIComponent(product)}`)
      if (!res.ok) throw new Error('Failed to fetch releases')
      releases.value = await res.json()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function fetchRelease(id: string): Promise<Release | null> {
    try {
      const res = await fetch(`${API_BASE}/releases/${id}`)
      if (!res.ok) throw new Error('Failed to fetch release')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function createRelease(payload: CreateReleasePayload): Promise<Release | null> {
    try {
      const res = await fetch(`${API_BASE}/releases`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to create release')
      const created = await res.json()
      await fetchReleases()
      return created
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function updateRelease(id: string, payload: Partial<CreateReleasePayload>) {
    try {
      const res = await fetch(`${API_BASE}/releases/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to update release')
      await fetchReleases()
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function deleteRelease(id: string) {
    try {
      const res = await fetch(`${API_BASE}/releases/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Failed to delete release')
      releases.value = releases.value.filter(r => r.id !== id)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function addDeploymentTargets(releaseId: string, deploymentId: string, serverIds: string[]) {
    try {
      const res = await fetch(`${API_BASE}/releases/${releaseId}/deployments/${deploymentId}/targets`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ serverIds }),
      })
      if (!res.ok) throw new Error('Failed to add deployment targets')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function updateTargetStatus(releaseId: string, deploymentId: string, targetId: string, status: TargetStatus) {
    try {
      const res = await fetch(`${API_BASE}/releases/${releaseId}/deployments/${deploymentId}/targets/${targetId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to update target status')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function removeDeploymentTarget(releaseId: string, deploymentId: string, targetId: string) {
    try {
      const res = await fetch(`${API_BASE}/releases/${releaseId}/deployments/${deploymentId}/targets/${targetId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Failed to remove target')
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  async function updateDeployment(releaseId: string, deploymentId: string, payload: { status?: string; notes?: string | null }) {
    try {
      const res = await fetch(`${API_BASE}/releases/${releaseId}/deployments/${deploymentId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to update deployment')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  return {
    releases, loading, error, releaseCount,
    fetchReleases, fetchRelease, createRelease, updateRelease, deleteRelease,
    addDeploymentTargets, updateTargetStatus, removeDeploymentTarget, updateDeployment,
  }
})
