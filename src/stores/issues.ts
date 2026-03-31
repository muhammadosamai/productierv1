import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { assertPageAction, ensureOk } from '@/lib/storeAuthz'
import { apiFetch } from '@/lib/apiClient'
import { buildProductScopedPath, resolveProductScope } from '@/lib/productScopeApi'

export type IssueSeverity = 'critical' | 'major' | 'minor' | 'trivial'
export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'deferred'
export type IssueSource = 'standalone' | 'test_cycle'

export interface Issue {
  id: string
  productId: string
  title: string
  description: string | null
  severity: IssueSeverity
  status: IssueStatus
  source: IssueSource
  storyId: string | null
  initiativeId: string | null
  deliveryId: string | null
  testCycleId: string | null
  reportedByUserId: string
  assignedToUserId: string | null
  assignedToTeamId?: string | null
  resolutionSummary: string | null
  createdAt: string
  updatedAt: string
  story?: { id: string; title: string; initiativeId: string | null } | null
  initiative?: { id: string; title: string; status: string } | null
  delivery?: { id: string; title: string; status: string } | null
  testCycle?: { id: string; title: string; status: string } | null
  reportedByUser?: { id: string; name: string; email: string; avatar: string | null } | null
  assignedToUser?: { id: string; name: string; email: string; avatar: string | null } | null
  assignedToTeam?: { id: string; name: string; key: string } | null
}

export interface CreateIssuePayload {
  productId?: string
  title: string
  description?: string | null
  severity?: IssueSeverity
  status?: IssueStatus
  source?: IssueSource
  storyId?: string | null
  initiativeId?: string | null
  deliveryId?: string | null
  testCycleId?: string | null
  assignedToUserId?: string | null
  assignedToTeamId?: string | null
  resolutionSummary?: string | null
}

interface IssueFilters {
  q?: string
  status?: IssueStatus | ''
  severity?: IssueSeverity | ''
  source?: IssueSource | ''
  assignedToUserId?: string
  assignedToTeamId?: string
}

export const useIssuesStore = defineStore('issues', () => {
  const issues = ref<Issue[]>([])
  const selectedIssue = ref<Issue | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  const issueCount = computed(() => issues.value.length)

  function resolveScope(explicitProductId?: string) {
    return resolveProductScope(explicitProductId)
  }

  async function fetchIssues(productId?: string, filters: IssueFilters = {}) {
    assertPageAction('issues', 'read', 'issues')
    loading.value = true
    error.value = null
    try {
      const auth = useAuthStore()
      const scope = resolveScope(productId)
      if (!scope) {
        issues.value = []
        return
      }
      const params = new URLSearchParams()
      if (filters.q?.trim()) params.set('q', filters.q.trim())
      if (filters.status) params.set('status', filters.status)
      if (filters.severity) params.set('severity', filters.severity)
      if (filters.source) params.set('source', filters.source)
      if (filters.assignedToUserId) params.set('assignedToUserId', filters.assignedToUserId)
      if (filters.assignedToTeamId) params.set('assignedToTeamId', filters.assignedToTeamId)

      const res = await apiFetch(buildProductScopedPath(scope, '/issues'), {
        token: auth.token,
        query: Object.fromEntries(params.entries()),
      })
      await ensureOk(res, 'Failed to fetch issues')
      issues.value = await res.json()
    } catch (e) {
      error.value = (e as Error).message
      issues.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchIssue(id: string): Promise<Issue | null> {
    assertPageAction('issues', 'read', 'issue details')
    error.value = null
    try {
      const auth = useAuthStore()
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/issues/${encodeURIComponent(id)}`), {
        token: auth.token,
      })
      await ensureOk(res, 'Failed to fetch issue')
      const issue = await res.json() as Issue
      selectedIssue.value = issue
      return issue
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function createIssue(payload: CreateIssuePayload): Promise<Issue | null> {
    assertPageAction('issues', 'create', 'create issue')
    saving.value = true
    error.value = null
    try {
      const auth = useAuthStore()
      const scope = resolveScope(payload.productId)
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const body: CreateIssuePayload = {
        ...payload,
        productId: scope.productId,
      }
      const res = await apiFetch(buildProductScopedPath(scope, '/issues'), {
        method: 'POST',
        token: auth.token,
        json: body,
      })
      await ensureOk(res, 'Failed to create issue')
      const created = await res.json() as Issue
      issues.value = [created, ...issues.value]
      selectedIssue.value = created
      return created
    } catch (e) {
      error.value = (e as Error).message
      return null
    } finally {
      saving.value = false
    }
  }

  async function updateIssue(id: string, payload: Partial<CreateIssuePayload>): Promise<Issue | null> {
    assertPageAction('issues', 'edit', 'update issue')
    saving.value = true
    error.value = null
    try {
      const auth = useAuthStore()
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/issues/${encodeURIComponent(id)}`), {
        method: 'PUT',
        token: auth.token,
        json: payload,
      })
      await ensureOk(res, 'Failed to update issue')
      const updated = await res.json() as Issue
      issues.value = issues.value.map((issue) => (issue.id === updated.id ? updated : issue))
      if (selectedIssue.value?.id === updated.id) selectedIssue.value = updated
      return updated
    } catch (e) {
      error.value = (e as Error).message
      return null
    } finally {
      saving.value = false
    }
  }

  async function deleteIssue(id: string): Promise<boolean> {
    assertPageAction('issues', 'delete', 'delete issue')
    saving.value = true
    error.value = null
    try {
      const auth = useAuthStore()
      const scope = resolveScope()
      if (!scope) {
        error.value = 'No active product selected'
        return false
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/issues/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        token: auth.token,
      })
      await ensureOk(res, 'Failed to delete issue')
      issues.value = issues.value.filter((issue) => issue.id !== id)
      if (selectedIssue.value?.id === id) selectedIssue.value = null
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    issues,
    selectedIssue,
    loading,
    saving,
    error,
    issueCount,
    fetchIssues,
    fetchIssue,
    createIssue,
    updateIssue,
    deleteIssue,
  }
})

