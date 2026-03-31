export const PRODUCT_CREATOR_MEMBER_ROLE = 'admin'
export const PRODUCT_DEFAULT_MEMBER_ROLE = 'member'
export const PRODUCT_MEMBERSHIP_MANAGER_ROLES = ['admin', 'owner'] as const

export function resolveProductMemberRole(
  requestedRole: string | null | undefined,
  fallbackRole: string = PRODUCT_DEFAULT_MEMBER_ROLE,
): string {
  const trimmed = requestedRole?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallbackRole
}

