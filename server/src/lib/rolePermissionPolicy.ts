import {
  type ConfigurableRoleKey,
  type ControllablePageKey,
  SELF_VIEW_CONFIGURABLE_PAGE_SET,
} from './pageCatalog'

export interface PagePermissionValue {
  visible: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  selfViewOnly: boolean
}

const VIEWER_HIDDEN_PAGES = new Set<ControllablePageKey>(['users', 'integrations', 'settings'])

export function buildDenyPermission(): PagePermissionValue {
  return {
    visible: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    selfViewOnly: false,
  }
}

export function buildFullPermission(): PagePermissionValue {
  return {
    visible: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    selfViewOnly: false,
  }
}

export function getDefaultPermissionForRolePage(
  role: ConfigurableRoleKey,
  page: ControllablePageKey,
): PagePermissionValue {
  if (role === 'viewer') {
    const visible = !VIEWER_HIDDEN_PAGES.has(page)
    return {
      visible,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      selfViewOnly: visible && SELF_VIEW_CONFIGURABLE_PAGE_SET.has(page),
    }
  }

  return buildFullPermission()
}

