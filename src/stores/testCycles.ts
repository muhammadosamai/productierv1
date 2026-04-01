import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useProductStore } from './products'
import { useAuthStore } from './auth'
import type { TestCycle, CreateTestCyclePayload, CreateIssuePayload } from '@/types/testCycle'

export const useTestCyclesStore = defineStore('testCycles', () => {
  const cycles = ref<TestCycle[]>([])
  const loading = ref(false)

  function authHeaders() {
    const authStore = useAuthStore()
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authStore.token}`,
    }
  }

  async function fetchCycles(product?: string) {
    loading.value = true
    try {
      const p = product || useProductStore().activeProductName
      const res = await fetch(`/api/test-cycles?product=${encodeURIComponent(p)}`, {
        headers: authHeaders(),
      })
      if (res.ok) {
        cycles.value = await res.json()
      }
    } catch {}
    finally { loading.value = false }
  }

  async function fetchCycle(id: string): Promise<TestCycle | null> {
    try {
      const res = await fetch(`/api/test-cycles/${id}`, { headers: authHeaders() })
      if (res.ok) return await res.json()
    } catch {}
    return null
  }

  async function createCycle(payload: CreateTestCyclePayload): Promise<TestCycle | null> {
    try {
      const productId = useProductStore().activeProductName
      const res = await fetch('/api/test-cycles', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...payload, productId }),
      })
      if (res.ok) {
        const cycle = await res.json()
        cycles.value.unshift(cycle)
        return cycle
      }
    } catch {}
    return null
  }

  async function updateCycle(id: string, payload: Partial<CreateTestCyclePayload>): Promise<TestCycle | null> {
    try {
      const res = await fetch(`/api/test-cycles/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const updated = await res.json()
        const idx = cycles.value.findIndex(c => c.id === id)
        if (idx >= 0) cycles.value[idx] = updated
        return updated
      }
    } catch {}
    return null
  }

  async function deleteCycle(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/test-cycles/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (res.ok) {
        cycles.value = cycles.value.filter(c => c.id !== id)
        return true
      }
    } catch {}
    return false
  }

  async function addIssue(cycleId: string, payload: CreateIssuePayload) {
    try {
      const res = await fetch(`/api/test-cycles/${cycleId}/issues`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (res.ok) return await res.json()
    } catch {}
    return null
  }

  async function updateIssue(cycleId: string, issueId: string, payload: Partial<CreateIssuePayload>) {
    try {
      const res = await fetch(`/api/test-cycles/${cycleId}/issues/${issueId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (res.ok) return await res.json()
    } catch {}
    return null
  }

  async function deleteIssue(cycleId: string, issueId: string) {
    try {
      const res = await fetch(`/api/test-cycles/${cycleId}/issues/${issueId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      return res.ok
    } catch {}
    return false
  }

  return {
    cycles, loading,
    fetchCycles, fetchCycle, createCycle, updateCycle, deleteCycle,
    addIssue, updateIssue, deleteIssue,
  }
})
