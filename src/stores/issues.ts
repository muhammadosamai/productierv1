import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import type { Issue, CreateIssuePayload } from '@/types/issue'

export const useIssuesStore = defineStore('issues', () => {
  const issues = ref<Issue[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const issueCount = computed(() => issues.value.length)

  async function fetchIssues(productName?: string, testCycleId?: string) {
    loading.value = true
    error.value = null
    try {
      const params = new URLSearchParams()
      if (productName) params.set('product', productName)
      if (testCycleId) params.set('testCycleId', testCycleId)
      const url = `/api/issues${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url)
      if (res.ok) {
        issues.value = await res.json()
      }
    } catch {
      error.value = 'Failed to load issues'
    } finally {
      loading.value = false
    }
  }

  async function createIssue(payload: CreateIssuePayload): Promise<Issue | null> {
    const authStore = useAuthStore()
    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return null
      const created = await res.json()
      issues.value.unshift(created)
      return created
    } catch {
      return null
    }
  }

  async function updateIssue(id: string, payload: Partial<CreateIssuePayload>): Promise<Issue | null> {
    const authStore = useAuthStore()
    try {
      const res = await fetch(`/api/issues/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return null
      const updated = await res.json()
      const idx = issues.value.findIndex(i => i.id === id)
      if (idx !== -1) issues.value[idx] = updated
      return updated
    } catch {
      return null
    }
  }

  async function deleteIssue(id: string): Promise<boolean> {
    const authStore = useAuthStore()
    try {
      const res = await fetch(`/api/issues/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authStore.token}` },
      })
      if (!res.ok) return false
      issues.value = issues.value.filter(i => i.id !== id)
      return true
    } catch {
      return false
    }
  }

  return { issues, loading, error, issueCount, fetchIssues, createIssue, updateIssue, deleteIssue }
})
