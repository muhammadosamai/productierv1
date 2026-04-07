export const PRODUCT_MEMBER_ROLES = [
  'admin',
  'member',
  'product_manager',
  'business_analyst',
  'developer',
  'viewer',
] as const

export type ProductMemberRole = (typeof PRODUCT_MEMBER_ROLES)[number]

const LABELS: Record<ProductMemberRole, string> = {
  admin: 'Admin',
  member: 'Member',
  product_manager: 'Product Manager',
  business_analyst: 'Business Analyst',
  developer: 'Developer',
  viewer: 'Viewer',
}

export function isProductMemberRole(role: string): role is ProductMemberRole {
  return (PRODUCT_MEMBER_ROLES as readonly string[]).includes(role)
}

export function formatProductRoleLabel(role: string): string {
  if (isProductMemberRole(role)) return LABELS[role]
  return role.replaceAll('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}
