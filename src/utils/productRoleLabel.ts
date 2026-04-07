/** Labels for product_members.role (aligned with server/src/lib/productMemberRoles.ts). */
const LABELS: Record<string, string> = {
  admin: 'Admin',
  member: 'Member',
  product_manager: 'Product Manager',
  business_analyst: 'Business Analyst',
  developer: 'Developer',
  viewer: 'Viewer',
}

export function formatProductRoleLabel(role: string): string {
  if (role in LABELS) return LABELS[role]!
  return role.replaceAll('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

export function formatAccountRoleLabel(role: string): string {
  return role.replaceAll('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}
