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
  return role.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
}

export function formatAccountRoleLabel(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
}
