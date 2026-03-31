import { onBeforeUnmount, ref, type Ref } from 'vue'
import { apiFetch, ApiError } from '@/lib/apiClient'
import type { Activity } from '@/stores/activities'
import { buildProductScopedPath, resolveProductScope } from '@/lib/productScopeApi'

interface UseEntityActivityDropdownOptions {
  entityType: string
  token: Ref<string | null>
  productId: Ref<string | null>
  limit?: number
  fetchErrorMessage?: string
}

export function useEntityActivityDropdown(options: UseEntityActivityDropdownOptions) {
  const showDropdown = ref(false)
  const activities = ref<Activity[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  let clickHandlerBound = false

  function closeDropdown() {
    showDropdown.value = false
  }

  async function fetchActivities() {
    loading.value = true
    error.value = null
    try {
      const activeProductId = options.productId.value
      const scope = resolveProductScope(activeProductId)
      if (!scope) {
        activities.value = []
        return
      }
      const response = await apiFetch(buildProductScopedPath(scope, '/activities'), {
        token: options.token.value,
        query: {
          entityType: options.entityType,
          limit: options.limit ?? 50,
        },
      })
      if (!response.ok) {
        throw new ApiError(
          response.status,
          options.fetchErrorMessage || 'Unable to load activities.',
          null,
        )
      }
      const payload = await response.json()
      activities.value = Array.isArray(payload) ? payload : []
    } catch (err) {
      activities.value = []
      if (err instanceof ApiError) {
        error.value = err.message
      } else {
        error.value = options.fetchErrorMessage || 'Unable to load activities.'
      }
    } finally {
      loading.value = false
    }
  }

  function onClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement | null
    if (target && !target.closest('.activity-dropdown-container')) {
      closeDropdown()
    }
  }

  function bindClickHandler() {
    if (clickHandlerBound) return
    clickHandlerBound = true
    setTimeout(() => document.addEventListener('click', onClickOutside), 0)
  }

  function unbindClickHandler() {
    if (!clickHandlerBound) return
    clickHandlerBound = false
    document.removeEventListener('click', onClickOutside)
  }

  async function toggleDropdown() {
    showDropdown.value = !showDropdown.value
    if (showDropdown.value) {
      bindClickHandler()
      await fetchActivities()
      return
    }
    unbindClickHandler()
  }

  onBeforeUnmount(() => {
    unbindClickHandler()
  })

  return {
    showDropdown,
    activities,
    loading,
    error,
    toggleDropdown,
    closeDropdown,
    fetchActivities,
  }
}
