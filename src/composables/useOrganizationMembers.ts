import { computed, ref } from 'vue'
import { usersApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useProductStore } from '@/stores/products'

export interface OrganizationMemberEntry {
  id: string
  name: string
  email: string
  avatar: string | null
}

function normalizeMembers(payload: unknown): OrganizationMemberEntry[] {
  const rows = Array.isArray(payload)
    ? payload as Array<Record<string, unknown>>
    : (Array.isArray((payload as Record<string, unknown> | null)?.items)
      ? ((payload as Record<string, unknown>).items as Array<Record<string, unknown>>)
      : [])

  return rows
    .map((row) => ({
      id: typeof row.id === 'string' ? row.id : '',
      name: typeof row.name === 'string' ? row.name : '',
      email: typeof row.email === 'string' ? row.email : '',
      avatar: typeof row.avatar === 'string' ? row.avatar : null,
    }))
    .filter((row) => row.id.length > 0 && row.name.length > 0)
}

export function useOrganizationMembers() {
  const authStore = useAuthStore()
  const productStore = useProductStore()

  const members = ref<OrganizationMemberEntry[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const organizationId = computed(() => productStore.activeProduct?.organizationId || '')

  async function loadMembers(query = '') {
    if (!organizationId.value) {
      members.value = []
      return
    }
    loading.value = true
    error.value = null
    try {
      const payload = await usersApi.list({
        q: query,
        organizationId: organizationId.value,
        paged: 1,
        limit: 200,
      }, authStore.token)
      members.value = normalizeMembers(payload)
    } catch (e) {
      members.value = []
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  function getMemberById(id: string) {
    return members.value.find((entry) => entry.id === id)
  }

  return {
    members,
    loading,
    error,
    organizationId,
    loadMembers,
    getMemberById,
  }
}
