import type { UserRole, UserTitle } from '@/types/user'

export type HomeViewKey = 'my_tasks' | 'team' | 'executive'

export interface HomeViewAccess {
  allowedViews: HomeViewKey[]
  defaultView: HomeViewKey
}

const TEAM_ROLE_ALLOWLIST = new Set<UserRole>([
  'super_admin',
  'admin',
  'product_admin',
  'product_manager',
])

const EXECUTIVE_ROLE_ALLOWLIST = new Set<UserRole>([
  'super_admin',
  'admin',
  'product_admin',
])

function normalizeTitleKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
}

function titleGrantsTeamView(titleKey: string): boolean {
  return /(manager|lead|supervisor|head|coordinator|owner)/.test(titleKey)
}

function titleGrantsExecutiveView(titleKey: string): boolean {
  return /(executive|director|vice_president|vp|chief|cxo|president|founder)/.test(titleKey)
}

export function resolveHomeViewAccess(role: UserRole, title?: UserTitle | null): HomeViewAccess {
  const allowed = new Set<HomeViewKey>(['my_tasks'])

  if (TEAM_ROLE_ALLOWLIST.has(role)) {
    allowed.add('team')
  }
  if (EXECUTIVE_ROLE_ALLOWLIST.has(role)) {
    allowed.add('executive')
  }

  const normalizedTitleKey = title?.key ? normalizeTitleKey(title.key) : null
  if (normalizedTitleKey) {
    if (titleGrantsTeamView(normalizedTitleKey)) {
      allowed.add('team')
    }
    if (titleGrantsExecutiveView(normalizedTitleKey)) {
      allowed.add('team')
      allowed.add('executive')
    }
  }

  const allowedViews = (['my_tasks', 'team', 'executive'] as const).filter((view) => allowed.has(view))
  const defaultView = allowed.has('executive')
    ? 'executive'
    : allowed.has('team')
      ? 'team'
      : 'my_tasks'

  return { allowedViews, defaultView }
}

export function ensureAllowedHomeView(
  candidate: string | null | undefined,
  access: HomeViewAccess,
): HomeViewKey {
  if (candidate && access.allowedViews.includes(candidate as HomeViewKey)) {
    return candidate as HomeViewKey
  }
  return access.defaultView
}
