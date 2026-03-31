import { useRolesStore } from '@/stores/roles'
import { permissionDeniedReason, type PageAction } from '@/lib/pagePermissions'

function canPerformAction(page: string, action: PageAction): boolean {
  const rolesStore = useRolesStore()
  switch (action) {
    case 'read':
      return rolesStore.canAccess(page)
    case 'create':
      return rolesStore.canCreate(page)
    case 'edit':
      return rolesStore.canEdit(page)
    case 'delete':
      return rolesStore.canDelete(page)
    default:
      return false
  }
}

export function assertPageAction(
  page: string,
  action: PageAction,
  subject = 'this action'
) {
  if (!canPerformAction(page, action)) {
    throw new Error(permissionDeniedReason(action, subject))
  }
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.clone().json() as { error?: string; message?: string }
    if (payload?.error) return payload.error
    if (payload?.message) return payload.message
  } catch {
    // ignore and use fallback
  }

  if (response.status === 401) return 'Unauthorized'
  if (response.status === 403) return 'Forbidden'
  return fallback
}

export async function ensureOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return
  throw new Error(await readApiError(response, fallback))
}
