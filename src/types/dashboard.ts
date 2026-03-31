export type DashboardScopeType = 'product' | 'workspace'
export type DashboardVisibility = 'personal' | 'team' | 'invited'
export type DashboardPageViewerRole = 'viewer' | 'editor'
export type DashboardTemplateSource = 'system' | 'user'
export type DashboardTemplateVisibility = 'personal' | 'team'
export type DashboardTemplateApplyMode = 'append' | 'replace_custom'

export interface DashboardPageViewer {
  userId: string
  role: DashboardPageViewerRole
}

export interface DashboardWidget {
  id: string
  pageId: string
  widgetType: string
  widgetTitle: string | null
  configJson: Record<string, unknown>
  gridX: number
  gridY: number
  gridW: number
  gridH: number
  sortOrder: number
  createdByUserId: string | null
  updatedByUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface DashboardPage {
  id: string
  scopeType: DashboardScopeType
  scopeRefId: string
  sortOrder: number
  name: string
  slug: string
  visibility: DashboardVisibility
  ownerUserId: string | null
  isSystem: boolean
  systemKey: string | null
  createdByUserId: string
  updatedByUserId: string | null
  createdAt: string
  updatedAt: string
  widgets: DashboardWidget[]
  viewerAssignments: DashboardPageViewer[]
  viewerUserIds: string[]
  canEdit: boolean
  isOwner: boolean
}

export interface DashboardPageListResponse {
  items: DashboardPage[]
}

export interface DashboardScopeContextResponse {
  scopeType: DashboardScopeType
  scopeRefId: string
  organizationId: string | null
  canEditTeamWide: boolean
}

export interface DashboardTemplateWidget {
  widgetType: string
  widgetTitle: string | null
  configJson: Record<string, unknown>
  gridX: number
  gridY: number
  gridW: number
  gridH: number
  sortOrder: number
}

export interface DashboardTemplatePage {
  name: string
  slug: string
  visibility: DashboardTemplateVisibility
  sortOrder: number
  widgets: DashboardTemplateWidget[]
}

export interface DashboardTemplate {
  id: string
  scopeType: DashboardScopeType
  scopeRefId: string
  name: string
  slug: string
  description: string | null
  source: DashboardTemplateSource
  visibility: DashboardTemplateVisibility
  ownerUserId: string | null
  canEdit: boolean
  canDelete: boolean
  pages: DashboardTemplatePage[]
}

export interface DashboardTemplateListResponse {
  items: DashboardTemplate[]
  canManageTemplates: boolean
  canApplyTemplates: boolean
}

export interface DashboardTemplateApplyResponse {
  success: boolean
  source: DashboardTemplateSource
  mode: DashboardTemplateApplyMode
  createdPageIds: string[]
  replacedPageIds: string[]
}
