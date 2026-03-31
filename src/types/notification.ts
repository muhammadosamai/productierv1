export type NotificationCategory =
  | 'assignment'
  | 'workflow'
  | 'risk'
  | 'quality'
  | 'release'
  | 'admin'
  | 'integration'
  | 'digest'

export type NotificationSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export type NotificationUrgency = 'action_required' | 'watch' | 'informational'

export interface NotificationItem {
  id: string
  recipientUserId: string
  actorUserId: string | null
  productId: string | null
  page: string
  routePath: string | null
  category: NotificationCategory
  type: string
  severity: NotificationSeverity
  urgency: NotificationUrgency
  entityType: string | null
  entityId: string | null
  entityTitle: string | null
  message: string
  payload: unknown
  subjectUserIds: string[] | null
  dedupeKey: string
  readAt: string | null
  archivedAt: string | null
  mutedAt: string | null
  snoozedUntil: string | null
  createdAt: string
  updatedAt: string
}

export interface NotificationPreference {
  productId?: string | null
  category: NotificationCategory
  inAppEnabled: boolean
  emailEnabled: boolean
  slackEnabled: boolean
  quietHoursStart: string | null
  quietHoursEnd: string | null
  minimumSeverity: NotificationSeverity
  reminderCadence: 'immediate' | 'daily' | 'weekly'
  reminderCooldownMinutes: number
  reminderDueSoonHours: number
  reminderOverdueEnabled: boolean
  reminderDueSoonEnabled: boolean
  reminderStaleEnabled: boolean
  reminderReviewSlaEnabled: boolean
  dailyRollupEnabled: boolean
}

export interface NotificationPreferencePreset {
  persona: 'executive' | 'manager' | 'developer' | 'quality' | 'admin' | 'viewer'
  source: 'role_only' | 'title_only' | 'role_and_title'
  titleKey: string | null
  titleName: string | null
  defaults: NotificationPreference[]
}

export interface NotificationInboxResponse {
  items: NotificationItem[]
  nextCursor: string | null
  unreadCount: number
}

export interface NotificationTypeFacet {
  type: string
  label: string
  count: number
}

export interface NotificationInboxFacetsResponse {
  filteredUnreadCount: number
  typeFacets: NotificationTypeFacet[]
}
