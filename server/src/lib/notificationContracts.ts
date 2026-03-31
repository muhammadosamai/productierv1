import type { ControllablePageKey } from './pageCatalog'

export const NOTIFICATION_CATEGORIES = [
  'assignment',
  'workflow',
  'risk',
  'quality',
  'release',
  'admin',
  'integration',
  'digest',
] as const

export const NOTIFICATION_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const
export const NOTIFICATION_URGENCIES = ['action_required', 'watch', 'informational'] as const

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number]
export type NotificationUrgency = (typeof NOTIFICATION_URGENCIES)[number]

export interface NotificationContractDefinition {
  type: string
  category: NotificationCategory
  severity: NotificationSeverity
  urgency: NotificationUrgency
  page: ControllablePageKey
}

export type ActivityChange = {
  field: string
  from: string | null
  to: string | null
}

export interface NotificationContractInput {
  action: string
  entityType?: string | null
  changes?: ActivityChange[] | null
}

const ENTITY_PAGE_MAP: Record<string, ControllablePageKey> = {
  initiative: 'initiatives',
  story: 'stories',
  task: 'tasks',
  delivery: 'deliveries',
  release: 'releases',
  issue: 'issues',
  test_cycle: 'test-cycles',
  test_cycle_issue: 'issues',
  feature_request: 'feature-requests',
  consumer_feedback: 'feedbacks',
  product: 'home',
  server: 'integrations',
  user: 'users',
  title: 'settings',
  integration_connection: 'integrations',
  integration_sync: 'integrations',
  wiki_asset: 'wiki',
  wiki_revision: 'wiki',
}

const ENTITY_ROUTE_PREFIX_MAP: Record<string, string> = {
  initiative: '/initiatives',
  story: '/stories',
  task: '/tasks',
  delivery: '/deliveries',
  release: '/releases',
  issue: '/issues',
  test_cycle: '/test-cycles',
  test_cycle_issue: '/test-cycles',
  feature_request: '/feature-requests',
  consumer_feedback: '/feedbacks',
  product: '/home',
  server: '/integrations',
  user: '/users',
  title: '/settings',
  integration_connection: '/integrations',
  integration_sync: '/integrations',
  wiki_asset: '/wiki',
  wiki_revision: '/wiki',
}

const ASSIGNMENT_FIELDS = new Set([
  'ownerUserId',
  'assigneeUserIds',
  'reviewerUserIds',
  'assignedToUserId',
  'titleId',
])

const DEPENDENCY_FIELDS = new Set([
  'dependent',
  'blockedReason',
  'dependencyStatus',
])

const SCOPE_CHANGE_FIELDS = new Set([
  'initiativeId',
  'initiative',
  'deliveryId',
  'delivery',
  'estimate',
  'estimateValue',
  'acceptanceCriteria',
  'periodStart',
  'periodEnd',
])

const REVIEW_HANDOFF_STATUSES = new Set([
  'in_review',
  'ready_for_review',
  'done',
  'completed',
])

const COMMENT_FIELDS = new Set([
  'commentId',
  'commentPreview',
  'comment',
])

const ATTACHMENT_FIELDS = new Set([
  'attachmentId',
  'attachmentName',
  'attachmentMimeType',
  'attachmentSize',
  'attachment',
])

const DEADLINE_FIELDS = new Set([
  'dueAt',
  'dueDate',
])

const REMINDER_KIND_FIELD = 'reminderKind'

const FAVORITE_FIELDS = new Set([
  'favoriteState',
])

const RELEASE_DEPLOYMENT_FIELDS = new Set([
  'deploymentId',
  'deploymentTargetId',
  'deploymentEnvironment',
  'deploymentTargetsAdded',
  'deploymentNotes',
])

function inferType(action: string, entityType: string | null, suffix?: string): string {
  const entityToken = entityType || 'entity'
  const normalizedAction = action || 'updated'
  const base = `${entityToken}.${normalizedAction}`
  return suffix ? `${base}.${suffix}` : base
}

function inferSeverityFromStatusTransition(change: ActivityChange | undefined): NotificationSeverity | null {
  if (!change || change.field !== 'status') return null
  const next = (change.to || '').toLowerCase()
  if (!next) return null
  if (next === 'failed' || next === 'blocked' || next === 'overdue' || next === 'critical') return 'high'
  if (next === 'done' || next === 'completed' || next === 'resolved' || next === 'closed') return 'low'
  return 'medium'
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isPastDate(value: string | null | undefined): boolean {
  const timestamp = parseTimestamp(value)
  if (timestamp == null) return false
  return timestamp < Date.now()
}

export function resolveContractForEvent(input: NotificationContractInput): Omit<NotificationContractDefinition, 'page'> {
  const entityType = input.entityType || null
  const changes = input.changes || []
  const statusChange = changes.find((change) => change.field === 'status')
  const reminderKindChange = changes.find((change) => change.field === REMINDER_KIND_FIELD)
  const commentChange = changes.find((change) => COMMENT_FIELDS.has(change.field))
  const attachmentChange = changes.find((change) => ATTACHMENT_FIELDS.has(change.field))
  const deadlineChange = changes.find((change) => DEADLINE_FIELDS.has(change.field))
  const favoriteChange = changes.find((change) => FAVORITE_FIELDS.has(change.field))
  const releaseDeploymentChange = changes.find((change) => RELEASE_DEPLOYMENT_FIELDS.has(change.field))

  if (reminderKindChange) {
    const reminderKind = (reminderKindChange.to || '').trim().toLowerCase()
    if (reminderKind === 'overdue') {
      return {
        type: inferType(input.action, entityType, 'reminder_overdue'),
        category: 'risk',
        severity: 'high',
        urgency: 'action_required',
      }
    }
    if (reminderKind === 'due_soon') {
      return {
        type: inferType(input.action, entityType, 'reminder_due_soon'),
        category: 'risk',
        severity: 'medium',
        urgency: 'watch',
      }
    }
    if (reminderKind === 'stale_in_progress') {
      return {
        type: inferType(input.action, entityType, 'reminder_stale_in_progress'),
        category: 'risk',
        severity: 'medium',
        urgency: 'watch',
      }
    }
    if (reminderKind === 'review_sla') {
      return {
        type: inferType(input.action, entityType, 'reminder_review_sla'),
        category: 'workflow',
        severity: 'medium',
        urgency: 'action_required',
      }
    }
    if (reminderKind === 'blocked_dependency') {
      return {
        type: inferType(input.action, entityType, 'reminder_blocked_dependency'),
        category: 'risk',
        severity: 'high',
        urgency: 'action_required',
      }
    }
    if (reminderKind === 'unassigned_work') {
      return {
        type: inferType(input.action, entityType, 'reminder_unassigned_work'),
        category: 'assignment',
        severity: 'high',
        urgency: 'action_required',
      }
    }
    if (reminderKind === 'release_risk') {
      return {
        type: inferType(input.action, entityType, 'reminder_release_risk'),
        category: 'release',
        severity: 'high',
        urgency: 'watch',
      }
    }
    if (reminderKind === 'release_failure') {
      return {
        type: inferType(input.action, entityType, 'reminder_release_failure'),
        category: 'release',
        severity: 'critical',
        urgency: 'action_required',
      }
    }
    if (reminderKind === 'daily_cross_view_rollup') {
      return {
        type: 'digest.daily_cross_view',
        category: 'digest',
        severity: 'medium',
        urgency: 'watch',
      }
    }
  }

  if (entityType === 'user' || entityType === 'title') {
    if (input.action === 'failed') {
      return {
        type: inferType(input.action, entityType, 'governance_failed'),
        category: 'admin',
        severity: 'critical',
        urgency: 'action_required',
      }
    }
    return {
      type: inferType(input.action, entityType, 'governance'),
      category: 'admin',
      severity: 'high',
      urgency: 'watch',
    }
  }

  if (entityType === 'product') {
    const metricsChange = changes.find((change) => change.field === 'metricsOverloadWipThreshold')
    return {
      type: inferType(input.action, entityType, metricsChange ? 'metrics_policy' : 'governance'),
      category: 'admin',
      severity: input.action === 'deleted' ? 'high' : 'medium',
      urgency: input.action === 'deleted' ? 'action_required' : 'watch',
    }
  }

  if (entityType === 'integration_connection' || entityType === 'integration_sync' || entityType === 'server') {
    const failedStatus = (statusChange?.to || '').toLowerCase() === 'failed'
    const isFailure = input.action === 'failed' || failedStatus
    return {
      type: inferType(input.action, entityType, 'health'),
      category: 'integration',
      severity: input.action === 'deleted' || isFailure ? 'high' : 'medium',
      urgency: input.action === 'deleted' || isFailure ? 'action_required' : 'watch',
    }
  }

  if (entityType === 'release') {
    const severity = input.action === 'failed'
      ? 'high'
      : inferSeverityFromStatusTransition(statusChange) || 'medium'
    const suffix = releaseDeploymentChange ? 'deployment' : 'lifecycle'
    return {
      type: inferType(input.action, entityType, suffix),
      category: 'release',
      severity,
      urgency: severity === 'high' ? 'action_required' : 'watch',
    }
  }

  if (commentChange) {
    const isDeletedComment = input.action === 'deleted'
    return {
      type: inferType(input.action, entityType, isDeletedComment ? 'comment_removed' : 'comment_added'),
      category: 'workflow',
      severity: isDeletedComment ? 'low' : 'medium',
      urgency: isDeletedComment ? 'watch' : 'action_required',
    }
  }

  if (attachmentChange) {
    const isDeletedAttachment = input.action === 'deleted' || !attachmentChange.to
    return {
      type: inferType(input.action, entityType, isDeletedAttachment ? 'attachment_removed' : 'attachment_added'),
      category: 'workflow',
      severity: 'low',
      urgency: 'watch',
    }
  }

  if (favoriteChange) {
    const favorited = (favoriteChange.to || '').toLowerCase() === 'starred'
    return {
      type: inferType(input.action, entityType, favorited ? 'favorited' : 'unfavorited'),
      category: 'workflow',
      severity: 'info',
      urgency: 'informational',
    }
  }

  if (entityType === 'issue' || entityType === 'test_cycle_issue' || entityType === 'consumer_feedback') {
    return {
      type: inferType(input.action, entityType, 'quality'),
      category: 'quality',
      severity: input.action === 'created' ? 'high' : 'medium',
      urgency: input.action === 'created' ? 'action_required' : 'watch',
    }
  }

  if (deadlineChange) {
    const clearedDeadline = !deadlineChange.to
    const becameOverdue = isPastDate(deadlineChange.to)
    return {
      type: inferType(input.action, entityType, 'deadline_changed'),
      category: 'risk',
      severity: becameOverdue ? 'high' : clearedDeadline ? 'low' : 'medium',
      urgency: becameOverdue ? 'action_required' : 'watch',
    }
  }

  const dependencyChange = changes.find((change) => DEPENDENCY_FIELDS.has(change.field))
  if (dependencyChange) {
    const nextValue = (dependencyChange.to || '').toLowerCase()
    const becameUnblocked = nextValue === 'null'
      || nextValue === ''
      || nextValue === 'unblocked'
      || nextValue === 'resolved'
    return {
      type: inferType(input.action, entityType, becameUnblocked ? 'dependency_unblocked' : 'dependency_blocked'),
      category: 'risk',
      severity: becameUnblocked ? 'low' : 'high',
      urgency: becameUnblocked ? 'watch' : 'action_required',
    }
  }

  const scopeChange = changes.find((change) => SCOPE_CHANGE_FIELDS.has(change.field))
  if (scopeChange) {
    return {
      type: inferType(input.action, entityType, 'scope_change'),
      category: 'risk',
      severity: 'medium',
      urgency: 'watch',
    }
  }

  const assignmentChange = changes.find((change) => ASSIGNMENT_FIELDS.has(change.field))
  if (assignmentChange) {
    return {
      type: inferType(input.action, entityType, 'assignment'),
      category: 'assignment',
      severity: 'medium',
      urgency: 'action_required',
    }
  }

  const nextStatus = (statusChange?.to || '').toLowerCase()
  if (statusChange && REVIEW_HANDOFF_STATUSES.has(nextStatus)) {
    return {
      type: inferType(input.action, entityType, 'handoff'),
      category: 'workflow',
      severity: 'medium',
      urgency: 'action_required',
    }
  }

  const inferredStatusSeverity = inferSeverityFromStatusTransition(statusChange)
  if (inferredStatusSeverity === 'high') {
    return {
      type: inferType(input.action, entityType, 'risk'),
      category: 'risk',
      severity: 'high',
      urgency: 'action_required',
    }
  }

  return {
    type: inferType(input.action, entityType),
    category: 'workflow',
    severity: inferredStatusSeverity || 'info',
    urgency: inferredStatusSeverity ? 'watch' : 'informational',
  }
}

export function resolvePageForEntity(entityType: string | null | undefined): ControllablePageKey {
  if (!entityType) return 'home'
  return ENTITY_PAGE_MAP[entityType] || 'overview'
}

export function resolveRouteForEntity(entityType: string | null | undefined, entityId: string | null | undefined): string {
  if (!entityType) return '/home'

  const prefix = ENTITY_ROUTE_PREFIX_MAP[entityType] || '/home'
  if (!entityId) return prefix

  const encodedEntityId = encodeURIComponent(entityId)
  switch (entityType) {
    case 'task':
      return `/tasks?task=${encodedEntityId}`
    case 'story':
      return `/stories?story=${encodedEntityId}`
    case 'initiative':
    case 'delivery':
    case 'release':
    case 'test_cycle':
      return `${prefix}/${encodedEntityId}`
    case 'issue':
    case 'test_cycle_issue':
      return `/issues?issue=${encodedEntityId}`
    case 'user':
      return `/users?user=${encodedEntityId}`
    case 'title':
      return '/settings/organization/titles'
    case 'feature_request':
      return '/feature-requests'
    case 'consumer_feedback':
      return '/feedbacks'
    default:
      return prefix
  }
}

export function formatNotificationMessage(input: {
  actorName?: string | null
  action: string
  entityType?: string | null
  entityTitle?: string | null
  type?: string | null
  category?: NotificationCategory
  changes?: ActivityChange[] | null
}): string {
  const actor = input.actorName?.trim() || 'System'
  const normalizedAction = (input.action || 'updated').trim().toLowerCase()
  const entityType = (input.entityType || 'item').replace(/_/g, ' ')
  const entityTitle = input.entityTitle?.trim()
  const entityRef = entityTitle ? `${entityType} "${entityTitle}"` : `this ${entityType}`
  const normalizedType = (input.type || '').toLowerCase()
  const changes = Array.isArray(input.changes) ? input.changes : []

  if (normalizedType.includes('comment_added')) {
    return `${actor} added a comment on ${entityRef}.`
  }
  if (normalizedType.includes('comment_removed')) {
    return `${actor} removed a comment from ${entityRef}.`
  }
  if (normalizedType.includes('attachment_added')) {
    return `${actor} added an attachment to ${entityRef}.`
  }
  if (normalizedType.includes('attachment_removed')) {
    return `${actor} removed an attachment from ${entityRef}.`
  }
  if (normalizedType.includes('assignment')) {
    return `${actor} updated assignment on ${entityRef}.`
  }
  if (normalizedType.includes('reminder_overdue')) {
    return `${entityRef} is overdue and needs attention.`
  }
  if (normalizedType.includes('reminder_due_soon')) {
    return `${entityRef} is due soon and may require action.`
  }
  if (normalizedType.includes('reminder_stale_in_progress')) {
    return `${entityRef} has been in progress too long without updates.`
  }
  if (normalizedType.includes('reminder_review_sla')) {
    return `${entityRef} has been waiting for review beyond SLA.`
  }
  if (normalizedType.includes('reminder_blocked_dependency')) {
    return `${entityRef} is blocked by a dependency and needs intervention.`
  }
  if (normalizedType.includes('reminder_unassigned_work')) {
    return `${entityRef} is unassigned and needs an owner.`
  }
  if (normalizedType.includes('reminder_release_risk')) {
    return `Release risk: ${entityRef} may miss schedule and needs attention.`
  }
  if (normalizedType.includes('reminder_release_failure')) {
    return `Release alert: ${entityRef} has a failure requiring immediate action.`
  }
  if (normalizedType.includes('digest.daily_cross_view')) {
    return `Daily rollup: ${entityRef} has cross-view work signals to review.`
  }
  if (normalizedType.includes('handoff')) {
    return `${actor} moved ${entityRef} into review workflow.`
  }
  if (normalizedType.includes('dependency_blocked')) {
    return `${entityRef} is now blocked after a dependency update by ${actor}.`
  }
  if (normalizedType.includes('dependency_unblocked')) {
    return `${entityRef} is unblocked after a dependency update by ${actor}.`
  }
  if (normalizedType.includes('deadline_changed')) {
    const dueChange = changes.find((change) => DEADLINE_FIELDS.has(change.field))
    if (!dueChange?.to) {
      return `${actor} removed the due date for ${entityRef}.`
    }
    if (isPastDate(dueChange.to)) {
      return `${entityRef} is behind schedule after ${actor} changed its due date.`
    }
    return `${actor} updated the due date for ${entityRef}.`
  }
  if (input.category === 'release') {
    const failedStatus = changes.some((change) =>
      change.field === 'status' && (change.to || '').toLowerCase() === 'failed'
    )
    if (normalizedAction === 'failed' || failedStatus) {
      return `Release alert: ${actor} reported a failed deployment for ${entityRef}.`
    }
    return `${actor} updated release lifecycle for ${entityRef}.`
  }
  if (input.category === 'admin') {
    return `Admin update: ${actor} ${normalizedAction} ${entityRef}.`
  }
  if (normalizedAction === 'failed') {
    return `${actor} reported a failure for ${entityRef}.`
  }
  if (normalizedAction === 'created') {
    return `${actor} created ${entityRef}.`
  }
  if (normalizedAction === 'deleted') {
    return `${actor} deleted ${entityRef}.`
  }
  return `${actor} updated ${entityRef}.`
}

const TYPE_SUFFIX_LABELS: Record<string, string> = {
  assignment: 'Assignment',
  handoff: 'Review handoff',
  comment_added: 'Comment added',
  comment_removed: 'Comment removed',
  attachment_added: 'Attachment added',
  attachment_removed: 'Attachment removed',
  dependency_blocked: 'Dependency blocked',
  dependency_unblocked: 'Dependency unblocked',
  scope_change: 'Scope change',
  deployment: 'Deployment update',
  lifecycle: 'Lifecycle update',
  governance: 'Governance update',
  governance_failed: 'Governance failure',
  quality: 'Quality update',
  metrics_policy: 'Metrics policy update',
  health: 'Integration health',
  favorited: 'Favorited',
  unfavorited: 'Unfavorited',
  reminder_overdue: 'Overdue reminder',
  reminder_due_soon: 'Due soon reminder',
  reminder_stale_in_progress: 'Stale work reminder',
  reminder_review_sla: 'Review SLA reminder',
  reminder_blocked_dependency: 'Blocked dependency reminder',
  reminder_unassigned_work: 'Unassigned work reminder',
  reminder_release_risk: 'Release risk reminder',
  reminder_release_failure: 'Release failure reminder',
  daily_cross_view: 'Daily cross-view rollup',
}

export function humanizeNotificationType(type: string): string {
  const trimmed = type.trim()
  if (!trimmed) return 'Update'
  const suffix = trimmed.split('.').pop() || trimmed
  const labeled = TYPE_SUFFIX_LABELS[suffix]
  if (labeled) return labeled
  return suffix
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
