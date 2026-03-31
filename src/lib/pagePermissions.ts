import { computed, type Ref } from 'vue'
import { useRolesStore } from '@/stores/roles'

export type PageAction = 'read' | 'create' | 'edit' | 'delete'
type PageInput = string | Ref<string> | (() => string)

function resolvePage(input: PageInput): string {
  if (typeof input === 'function') return input()
  if (typeof input === 'string') return input
  return input.value
}

export function permissionDeniedReason(action: PageAction, subject = 'this action'): string {
  switch (action) {
    case 'read':
      return 'You do not have access to this page.'
    case 'create':
      return `You do not have permission to create ${subject}.`
    case 'edit':
      return `You do not have permission to edit ${subject}.`
    case 'delete':
      return `You do not have permission to delete ${subject}.`
    default:
      return 'You do not have permission to perform this action.'
  }
}

export function usePagePermissions(page: PageInput) {
  const rolesStore = useRolesStore()

  const pageKey = computed(() => resolvePage(page))
  const permission = computed(() => rolesStore.getPagePermission(pageKey.value))
  const canAccess = computed(() => rolesStore.canAccess(pageKey.value))
  const canCreate = computed(() => rolesStore.canCreate(pageKey.value))
  const canEdit = computed(() => rolesStore.canEdit(pageKey.value))
  const canDelete = computed(() => rolesStore.canDelete(pageKey.value))

  function can(action: PageAction): boolean {
    switch (action) {
      case 'read':
        return canAccess.value
      case 'create':
        return canCreate.value
      case 'edit':
        return canEdit.value
      case 'delete':
        return canDelete.value
      default:
        return false
    }
  }

  function deniedReason(action: PageAction, subject = 'this action'): string {
    if (can(action)) return ''
    if (!canAccess.value) return permissionDeniedReason('read')
    return permissionDeniedReason(action, subject)
  }

  return {
    pageKey,
    permission,
    canAccess,
    canCreate,
    canEdit,
    canDelete,
    can,
    deniedReason,
  }
}
