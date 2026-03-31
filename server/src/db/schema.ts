import { pgTable, uuid, text, varchar, timestamp, date, pgEnum, json, unique, integer, boolean, index, AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Enums (PG enum names kept unchanged for DB compatibility)
export const storyTypeEnum = pgEnum('item_type', [
  'feature', 'bug', 'improvement', 'technical_debt', 'research', 'infrastructure', 'testing', 'documentation'
])

export const storyPriorityEnum = pgEnum('item_priority', [
  'low', 'medium', 'high', 'critical'
])

export const storyStatusEnum = pgEnum('item_status', [
  'backlog', 'drafted', 'initialized', 'in_progress', 'completed', 'archived'
])

export const taskStatusEnum = pgEnum('task_status', [
  'created', 'assigned', 'in_progress', 'in_review', 'done', 'overdue', 'blocked', 'archived'
])

export const taskPriorityEnum = pgEnum('task_priority', [
  'low', 'medium', 'high', 'critical'
])

export const taskTypeEnum = pgEnum('task_type', [
  'design', 'development', 'testing', 'review', 'research', 'fix', 'documentation', 'deployment'
])

export const initiativeStatusEnum = pgEnum('initiative_status', [
  'planning', 'active', 'paused', 'completed', 'archived'
])

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'initialized', 'in_progress', 'overdue', 'blocked', 'completed', 'archived'
])

export const releaseStatusEnum = pgEnum('release_status', [
  'draft', 'planned', 'in_progress', 'completed', 'failed'
])

export const releaseTypeEnum = pgEnum('release_type', [
  'feature', 'hotfix', 'patch'
])

export const environmentEnum = pgEnum('environment', [
  'dev', 'stage', 'prod'
])

export const deploymentStatusEnum = pgEnum('deployment_status', [
  'pending', 'deploying', 'deployed', 'failed', 'rolled_back'
])

export const targetStatusEnum = pgEnum('target_status', [
  'pending', 'deploying', 'deployed', 'failed'
])

export const testCycleStatusEnum = pgEnum('test_cycle_status', [
  'planned', 'in_progress', 'completed', 'archived'
])

export const issueSeverityEnum = pgEnum('issue_severity', [
  'critical', 'major', 'minor', 'trivial'
])

export const issueStatusEnum = pgEnum('issue_status', [
  'open', 'in_progress', 'resolved', 'closed', 'deferred'
])

export const issueSourceEnum = pgEnum('issue_source', [
  'standalone', 'test_cycle'
])

export const integrationAuthTypeEnum = pgEnum('integration_auth_type', [
  'none', 'api_key', 'oauth2'
])

export const integrationConnectionStatusEnum = pgEnum('integration_connection_status', [
  'disconnected', 'connected', 'error'
])

export const integrationSyncRunStatusEnum = pgEnum('integration_sync_run_status', [
  'queued', 'running', 'success', 'failed'
])

export const integrationSyncEventLevelEnum = pgEnum('integration_sync_event_level', [
  'info', 'warn', 'error'
])

export const userRoleEnum = pgEnum('user_role', [
  'super_admin', 'admin', 'product_admin', 'product_manager',
  'business_analyst', 'developer', 'viewer'
])

export const organizationMemberRoleEnum = pgEnum('organization_member_role', [
  'owner', 'admin', 'member', 'viewer'
])

export const organizationTeamMemberRoleEnum = pgEnum('organization_team_member_role', [
  'member', 'lead'
])

export const organizationInviteStatusEnum = pgEnum('organization_invite_status', [
  'pending', 'accepted', 'expired', 'cancelled'
])

export const onboardingStepEnum = pgEnum('onboarding_step', [
  'account', 'organization', 'workspace', 'invites', 'completed'
])

export const notificationCategoryEnum = pgEnum('notification_category', [
  'assignment',
  'workflow',
  'risk',
  'quality',
  'release',
  'admin',
  'integration',
  'digest',
])

export const notificationSeverityEnum = pgEnum('notification_severity', [
  'critical',
  'high',
  'medium',
  'low',
  'info',
])

export const notificationUrgencyEnum = pgEnum('notification_urgency', [
  'action_required',
  'watch',
  'informational',
])

export const assetStatusEnum = pgEnum('asset_status', [
  'draft', 'active', 'deprecated', 'archived'
])

export const assetVisibilityEnum = pgEnum('asset_visibility', [
  'public', 'internal', 'private'
])

export const dashboardScopeTypeEnum = pgEnum('dashboard_scope_type', [
  'product', 'workspace'
])

export const dashboardVisibilityEnum = pgEnum('dashboard_visibility', [
  'personal', 'team', 'invited'
])

export const dashboardViewerAccessRoleEnum = pgEnum('dashboard_viewer_access_role', [
  'viewer', 'editor'
])

export const dashboardTemplateSourceEnum = pgEnum('dashboard_template_source', [
  'system', 'user'
])

export const dashboardTemplateVisibilityEnum = pgEnum('dashboard_template_visibility', [
  'personal', 'team'
])

// Tables (SQL table/column names kept unchanged for DB compatibility)
export const stories = pgTable('backlog_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  type: storyTypeEnum('type').notNull().default('feature'),
  priority: storyPriorityEnum('priority').notNull().default('medium'),
  status: storyStatusEnum('status').notNull().default('backlog'),
  productId: uuid('product').notNull().references(() => products.id, { onDelete: 'cascade' }),
  initiativeId: uuid('initiative_id').references(() => initiatives.id),
  initiative: varchar('initiative', { length: 255 }),
  delivery: varchar('delivery', { length: 255 }),
  ownerUserId: uuid('owner_user_id').references(() => users.id),
  sortOrder: integer('sort_order').notNull().default(0),
  estimate: varchar('estimate', { length: 50 }),
  acceptanceCriteria: text('acceptance_criteria'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const storyComments = pgTable('story_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  initiativeId: uuid('initiative_id'),
  storyId: uuid('item_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  parentTaskId: uuid('parent_task_id').references((): AnyPgColumn => tasks.id, { onDelete: 'set null' }),
  deliveryId: uuid('delivery_id'),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: taskStatusEnum('status').notNull().default('created'),
  priority: taskPriorityEnum('priority').notNull().default('medium'),
  type: taskTypeEnum('type'),
  ownerUserId: uuid('owner_user_id').references(() => users.id),
  ownerTeamId: uuid('owner_team_id').references(() => organizationTeams.id, { onDelete: 'set null' }),
  assigneeUserIds: uuid('assignee_user_ids').array(),
  assigneeTeamIds: uuid('assignee_team_ids').array(),
  reviewerUserIds: uuid('reviewer_user_ids').array(),
  reviewerTeamIds: uuid('reviewer_team_ids').array(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  estimateValue: integer('estimate_value'),
  dependent: uuid('dependent').array(),
  blockedReason: text('blocked_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  dueAt: timestamp('due_at'),
}, (table) => [
  index('tasks_parent_task_idx').on(table.parentTaskId),
])

export const taskComments = pgTable('task_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const taskAttachments = pgTable('task_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  fileName: varchar('file_name', { length: 500 }).notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: varchar('mime_type', { length: 255 }).notNull(),
  filePath: varchar('file_path', { length: 1000 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const initiatives = pgTable('initiatives', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: initiativeStatusEnum('status').notNull().default('planning'),
  period: varchar('period', { length: 100 }),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  leaderUserId: uuid('leader_user_id').references(() => users.id),
  priority: storyPriorityEnum('priority').notNull().default('medium'),
  productId: uuid('product').notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const initiativeMembers = pgTable('initiative_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  initiativeId: uuid('initiative_id').notNull().references(() => initiatives.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('initiative_member_unique').on(table.initiativeId, table.userId),
  index('initiative_members_initiative_idx').on(table.initiativeId),
  index('initiative_members_user_idx').on(table.userId),
])

export const initiativeTeams = pgTable('initiative_teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  initiativeId: uuid('initiative_id').notNull().references(() => initiatives.id, { onDelete: 'cascade' }),
  organizationTeamId: uuid('organization_team_id').notNull().references(() => organizationTeams.id, { onDelete: 'cascade' }),
  assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('initiative_team_unique').on(table.initiativeId, table.organizationTeamId),
  index('initiative_teams_initiative_idx').on(table.initiativeId),
  index('initiative_teams_team_idx').on(table.organizationTeamId),
])

export const deliveries = pgTable('deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  status: deliveryStatusEnum('status').notNull().default('initialized'),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const deliveryInitiatives = pgTable('delivery_initiatives', {
  id: uuid('id').primaryKey().defaultRandom(),
  deliveryId: uuid('delivery_id').notNull().references(() => deliveries.id, { onDelete: 'cascade' }),
  initiativeId: uuid('initiative_id').notNull().references(() => initiatives.id, { onDelete: 'cascade' }),
}, (table) => [
  unique('delivery_initiative_unique').on(table.deliveryId, table.initiativeId),
])

export const releases = pgTable('releases', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }),
  version: varchar('version', { length: 50 }),
  title: varchar('title', { length: 255 }).notNull(),
  status: releaseStatusEnum('status').notNull().default('draft'),
  releaseType: releaseTypeEnum('release_type').notNull().default('feature'),
  plannedAt: timestamp('planned_at'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdByUserId: uuid('created_by_user_id').notNull(),
  releaseManagerId: uuid('release_manager_id'),
  notes: text('notes'),
  releaseNotes: text('release_notes'),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const releaseDeliveries = pgTable('release_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  releaseId: uuid('release_id').notNull().references(() => releases.id, { onDelete: 'cascade' }),
  deliveryId: uuid('delivery_id').notNull().references(() => deliveries.id, { onDelete: 'cascade' }),
  deploymentOrder: integer('deployment_order'),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  addedByUserId: uuid('added_by_user_id'),
}, (table) => [
  unique('release_delivery_unique').on(table.releaseId, table.deliveryId),
])

export const releaseDeployments = pgTable('release_deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  releaseId: uuid('release_id').notNull().references(() => releases.id, { onDelete: 'cascade' }),
  environment: environmentEnum('environment').notNull(),
  sequence: integer('sequence').notNull(),
  status: deploymentStatusEnum('status').notNull().default('pending'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  failedAt: timestamp('failed_at'),
  deployedByUserId: uuid('deployed_by_user_id'),
  notes: text('notes'),
}, (table) => [
  unique('release_deployment_env_unique').on(table.releaseId, table.environment),
])

export const servers = pgTable('servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  environment: environmentEnum('environment').notNull(),
  host: varchar('host', { length: 500 }),
  port: integer('port'),
  protocol: varchar('protocol', { length: 20 }),
  region: varchar('region', { length: 100 }),
  provider: varchar('provider', { length: 100 }),
  instanceId: varchar('instance_id', { length: 255 }),
  isActive: integer('is_active').notNull().default(1),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const deploymentTargets = pgTable('deployment_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  releaseDeploymentId: uuid('release_deployment_id').notNull().references(() => releaseDeployments.id, { onDelete: 'cascade' }),
  serverId: uuid('server_id').notNull().references(() => servers.id),
  status: targetStatusEnum('status').notNull().default('pending'),
  deployedAt: timestamp('deployed_at'),
  failedAt: timestamp('failed_at'),
  logsUrl: varchar('logs_url', { length: 1000 }),
}, (table) => [
  unique('deployment_target_unique').on(table.releaseDeploymentId, table.serverId),
])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  role: userRoleEnum('role').notNull().default('viewer'),
  isActive: boolean('is_active').notNull().default(true),
  avatar: varchar('avatar', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  logo: varchar('logo', { length: 500 }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: organizationMemberRoleEnum('role').notNull().default('member'),
  invitedByUserId: uuid('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('organization_member_unique').on(table.organizationId, table.userId),
  index('organization_members_org_idx').on(table.organizationId),
  index('organization_members_user_idx').on(table.userId),
])

export const organizationTeams = pgTable('organization_teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 160 }).notNull(),
  key: varchar('key', { length: 100 }).notNull(),
  description: text('description'),
  leadUserId: uuid('lead_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('organization_team_org_key_unique').on(table.organizationId, table.key),
  unique('organization_team_org_name_unique').on(table.organizationId, table.name),
  index('organization_teams_org_idx').on(table.organizationId),
  index('organization_teams_lead_idx').on(table.leadUserId),
])

export const organizationTeamMembers = pgTable('organization_team_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationTeamId: uuid('organization_team_id').notNull().references(() => organizationTeams.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: organizationTeamMemberRoleEnum('role').notNull().default('member'),
  addedByUserId: uuid('added_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('organization_team_member_unique').on(table.organizationTeamId, table.userId),
  index('organization_team_members_team_idx').on(table.organizationTeamId),
  index('organization_team_members_user_idx').on(table.userId),
])

export const organizationMemberReports = pgTable('organization_member_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  memberUserId: uuid('member_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  managerUserId: uuid('manager_user_id').references(() => users.id, { onDelete: 'set null' }),
  setByUserId: uuid('set_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('organization_member_reports_member_unique').on(table.organizationId, table.memberUserId),
  index('organization_member_reports_org_idx').on(table.organizationId),
  index('organization_member_reports_member_idx').on(table.memberUserId),
  index('organization_member_reports_manager_idx').on(table.managerUserId),
])

export const organizationInvites = pgTable('organization_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  inviteeName: varchar('invitee_name', { length: 255 }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  role: organizationMemberRoleEnum('role').notNull().default('member'),
  status: organizationInviteStatusEnum('status').notNull().default('pending'),
  invitedByUserId: uuid('invited_by_user_id').notNull().references(() => users.id),
  acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  workspaceProductId: uuid('workspace_product_id').references(() => products.id, { onDelete: 'set null' }),
  organizationTeamId: uuid('organization_team_id').references(() => organizationTeams.id, { onDelete: 'set null' }),
  titleId: uuid('title_id').references(() => titles.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('organization_invites_org_idx').on(table.organizationId),
  index('organization_invites_email_idx').on(table.email),
  index('organization_invites_status_idx').on(table.status),
  index('organization_invites_workspace_idx').on(table.workspaceProductId),
  index('organization_invites_team_idx').on(table.organizationTeamId),
  index('organization_invites_title_idx').on(table.titleId),
])

export const onboardingProgress = pgTable('onboarding_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  currentStep: onboardingStepEnum('current_step').notNull().default('account'),
  isCompleted: boolean('is_completed').notNull().default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('onboarding_progress_user_unique').on(table.userId),
  index('onboarding_progress_org_idx').on(table.organizationId),
])

export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 100 }).notNull(),
  value: json('value').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('user_settings_unique').on(table.userId, table.key),
])

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipientUserId: uuid('recipient_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
  page: varchar('page', { length: 100 }).notNull(),
  routePath: varchar('route_path', { length: 500 }),
  category: notificationCategoryEnum('category').notNull().default('workflow'),
  type: varchar('type', { length: 120 }).notNull(),
  severity: notificationSeverityEnum('severity').notNull().default('info'),
  urgency: notificationUrgencyEnum('urgency').notNull().default('informational'),
  entityType: varchar('entity_type', { length: 80 }),
  entityId: uuid('entity_id'),
  entityTitle: varchar('entity_title', { length: 255 }),
  message: text('message').notNull(),
  payload: json('payload'),
  subjectUserIds: uuid('subject_user_ids').array(),
  dedupeKey: varchar('dedupe_key', { length: 200 }).notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  mutedAt: timestamp('muted_at', { withTimezone: true }),
  snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('notifications_recipient_dedupe_unique').on(table.recipientUserId, table.dedupeKey),
  index('notifications_recipient_created_idx').on(table.recipientUserId, table.createdAt),
  index('notifications_recipient_unread_idx').on(table.recipientUserId, table.archivedAt, table.readAt, table.createdAt),
  index('notifications_recipient_active_idx').on(table.recipientUserId, table.archivedAt, table.mutedAt, table.snoozedUntil, table.createdAt),
  index('notifications_product_created_idx').on(table.productId, table.createdAt),
  index('notifications_recipient_category_created_idx').on(table.recipientUserId, table.category, table.createdAt),
])

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
  category: notificationCategoryEnum('category').notNull(),
  inAppEnabled: boolean('in_app_enabled').notNull().default(true),
  emailEnabled: boolean('email_enabled').notNull().default(false),
  slackEnabled: boolean('slack_enabled').notNull().default(false),
  quietHoursStart: varchar('quiet_hours_start', { length: 5 }),
  quietHoursEnd: varchar('quiet_hours_end', { length: 5 }),
  minimumSeverity: notificationSeverityEnum('minimum_severity').notNull().default('low'),
  reminderCadence: varchar('reminder_cadence', { length: 20 }).notNull().default('daily'),
  reminderCooldownMinutes: integer('reminder_cooldown_minutes').notNull().default(720),
  reminderDueSoonHours: integer('reminder_due_soon_hours').notNull().default(48),
  reminderOverdueEnabled: boolean('reminder_overdue_enabled').notNull().default(true),
  reminderDueSoonEnabled: boolean('reminder_due_soon_enabled').notNull().default(true),
  reminderStaleEnabled: boolean('reminder_stale_enabled').notNull().default(true),
  reminderReviewSlaEnabled: boolean('reminder_review_sla_enabled').notNull().default(true),
  dailyRollupEnabled: boolean('daily_rollup_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('notification_preferences_user_idx').on(table.userId),
  index('notification_preferences_user_product_idx').on(table.userId, table.productId),
  index('notification_preferences_user_category_idx').on(table.userId, table.category),
])

export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product').references(() => products.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id),
  userName: varchar('user_name', { length: 255 }).notNull(),
  userAvatar: varchar('user_avatar', { length: 500 }),
  action: varchar('action', { length: 50 }).notNull(), // created, updated, deleted
  entityType: varchar('entity_type', { length: 50 }).notNull(), // initiative, story, task
  entityId: uuid('entity_id'),
  entityTitle: varchar('entity_title', { length: 255 }).notNull(),
  changes: json('changes').$type<{ field: string; from: string | null; to: string | null }[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  logo: varchar('logo', { length: 500 }),
  description: text('description'),
  metricsOverloadWipThreshold: integer('metrics_overload_wip_threshold').notNull().default(5),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('products_organization_idx').on(table.organizationId),
  index('products_org_id_idx').on(table.organizationId, table.id),
  unique('products_org_name_unique').on(table.organizationId, table.name),
])

export const productMembers = pgTable('product_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product').notNull().references(() => products.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).notNull().default('member'),
  addedAt: timestamp('added_at').notNull().defaultNow(),
}, (table) => [
  unique('product_user_unique').on(table.productId, table.userId),
])

export const dashboardPages = pgTable('dashboard_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  scopeType: dashboardScopeTypeEnum('scope_type').notNull(),
  scopeRefId: uuid('scope_ref_id').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  name: varchar('name', { length: 160 }).notNull(),
  slug: varchar('slug', { length: 160 }).notNull(),
  visibility: dashboardVisibilityEnum('visibility').notNull().default('personal'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  isSystem: boolean('is_system').notNull().default(false),
  systemKey: varchar('system_key', { length: 120 }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('dashboard_pages_scope_slug_unique').on(table.scopeType, table.scopeRefId, table.slug),
  unique('dashboard_pages_scope_system_key_unique').on(table.scopeType, table.scopeRefId, table.systemKey),
  index('dashboard_pages_scope_idx').on(table.scopeType, table.scopeRefId),
  index('dashboard_pages_scope_sort_idx').on(table.scopeType, table.scopeRefId, table.sortOrder),
  index('dashboard_pages_owner_idx').on(table.ownerUserId),
])

export const dashboardWidgets = pgTable('dashboard_widgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageId: uuid('page_id').notNull().references(() => dashboardPages.id, { onDelete: 'cascade' }),
  widgetType: varchar('widget_type', { length: 100 }).notNull(),
  widgetTitle: varchar('widget_title', { length: 160 }),
  configJson: json('config_json').$type<Record<string, unknown>>().notNull().default({}),
  gridX: integer('grid_x').notNull().default(0),
  gridY: integer('grid_y').notNull().default(0),
  gridW: integer('grid_w').notNull().default(1),
  gridH: integer('grid_h').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('dashboard_widgets_page_idx').on(table.pageId),
  index('dashboard_widgets_page_sort_idx').on(table.pageId, table.sortOrder),
])

export const dashboardPageViewers = pgTable('dashboard_page_viewers', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageId: uuid('page_id').notNull().references(() => dashboardPages.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessRole: dashboardViewerAccessRoleEnum('access_role').notNull().default('viewer'),
  invitedByUserId: uuid('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('dashboard_page_viewers_page_user_unique').on(table.pageId, table.userId),
  index('dashboard_page_viewers_page_idx').on(table.pageId),
  index('dashboard_page_viewers_user_idx').on(table.userId),
])

export const dashboardTemplates = pgTable('dashboard_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  scopeType: dashboardScopeTypeEnum('scope_type').notNull(),
  scopeRefId: uuid('scope_ref_id').notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  slug: varchar('slug', { length: 160 }).notNull(),
  description: text('description'),
  source: dashboardTemplateSourceEnum('source').notNull().default('user'),
  visibility: dashboardTemplateVisibilityEnum('visibility').notNull().default('personal'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('dashboard_templates_scope_source_slug_unique').on(table.scopeType, table.scopeRefId, table.source, table.slug),
  index('dashboard_templates_scope_idx').on(table.scopeType, table.scopeRefId),
  index('dashboard_templates_owner_idx').on(table.ownerUserId),
])

export const dashboardTemplatePages = pgTable('dashboard_template_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id').notNull().references(() => dashboardTemplates.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 160 }).notNull(),
  slug: varchar('slug', { length: 160 }).notNull(),
  visibility: dashboardTemplateVisibilityEnum('visibility').notNull().default('personal'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('dashboard_template_pages_template_slug_unique').on(table.templateId, table.slug),
  index('dashboard_template_pages_template_idx').on(table.templateId),
  index('dashboard_template_pages_template_sort_idx').on(table.templateId, table.sortOrder),
])

export const dashboardTemplateWidgets = pgTable('dashboard_template_widgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  templatePageId: uuid('template_page_id').notNull().references(() => dashboardTemplatePages.id, { onDelete: 'cascade' }),
  widgetType: varchar('widget_type', { length: 100 }).notNull(),
  widgetTitle: varchar('widget_title', { length: 160 }),
  configJson: json('config_json').$type<Record<string, unknown>>().notNull().default({}),
  gridX: integer('grid_x').notNull().default(0),
  gridY: integer('grid_y').notNull().default(0),
  gridW: integer('grid_w').notNull().default(1),
  gridH: integer('grid_h').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('dashboard_template_widgets_page_idx').on(table.templatePageId),
  index('dashboard_template_widgets_page_sort_idx').on(table.templatePageId, table.sortOrder),
])

export const favorites = pgTable('favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('favorites_user_entity_unique').on(table.userId, table.entityType, table.entityId),
])

export const testCycles = pgTable('test_cycles', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: testCycleStatusEnum('status').notNull().default('planned'),
  deliveryId: uuid('delivery_id').references(() => deliveries.id),
  releaseId: uuid('release_id').references(() => releases.id),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  startDate: date('start_date'),
  endDate: date('end_date'),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const testCycleIssues = pgTable('test_cycle_issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  testCycleId: uuid('test_cycle_id').notNull().references(() => testCycles.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  severity: issueSeverityEnum('severity').notNull().default('minor'),
  status: issueStatusEnum('status').notNull().default('open'),
  storyId: uuid('story_id').references(() => stories.id),
  reportedByUserId: uuid('reported_by_user_id').notNull().references(() => users.id),
  assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
  assignedToTeamId: uuid('assigned_to_team_id').references(() => organizationTeams.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const issues = pgTable('issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  severity: issueSeverityEnum('severity').notNull().default('minor'),
  status: issueStatusEnum('status').notNull().default('open'),
  source: issueSourceEnum('source').notNull().default('standalone'),
  storyId: uuid('story_id').references(() => stories.id),
  initiativeId: uuid('initiative_id').references(() => initiatives.id),
  deliveryId: uuid('delivery_id').references(() => deliveries.id),
  testCycleId: uuid('test_cycle_id').references(() => testCycles.id),
  reportedByUserId: uuid('reported_by_user_id').notNull().references(() => users.id),
  assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
  assignedToTeamId: uuid('assigned_to_team_id').references(() => organizationTeams.id, { onDelete: 'set null' }),
  resolutionSummary: text('resolution_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const integrationCatalog = pgTable('integration_catalog', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectorKey: varchar('connector_key', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 100 }).notNull().default('general'),
  authType: integrationAuthTypeEnum('auth_type').notNull().default('none'),
  enabled: boolean('enabled').notNull().default(true),
  metadata: json('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const integrationConnections = pgTable('integration_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  connectorKey: varchar('connector_key', { length: 100 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  status: integrationConnectionStatusEnum('status').notNull().default('disconnected'),
  metadata: json('metadata'),
  lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  connectedByUserId: uuid('connected_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('integration_connection_product_connector_unique').on(table.productId, table.connectorKey),
])

export const integrationCredentials = pgTable('integration_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connection_id').notNull().references(() => integrationConnections.id, { onDelete: 'cascade' }),
  secretCiphertext: text('secret_ciphertext').notNull(),
  secretIv: varchar('secret_iv', { length: 128 }),
  secretAuthTag: varchar('secret_auth_tag', { length: 128 }),
  keyVersion: varchar('key_version', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('integration_credentials_connection_unique').on(table.connectionId),
])

export const integrationSyncRuns = pgTable('integration_sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connection_id').notNull().references(() => integrationConnections.id, { onDelete: 'cascade' }),
  triggerType: varchar('trigger_type', { length: 30 }).notNull().default('manual'),
  status: integrationSyncRunStatusEnum('status').notNull().default('queued'),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id),
  summary: json('summary'),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const integrationSyncEvents = pgTable('integration_sync_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => integrationSyncRuns.id, { onDelete: 'cascade' }),
  level: integrationSyncEventLevelEnum('level').notNull().default('info'),
  message: text('message').notNull(),
  details: json('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Wiki Asset tables
export const assetTypes = pgTable('asset_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  category: varchar('category', { length: 100 }).notNull().default('business'),
  icon: varchar('icon', { length: 50 }),
  color: varchar('color', { length: 20 }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('asset_type_slug_product_unique').on(table.slug, table.productId),
])

export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  assetTypeId: uuid('asset_type_id').notNull().references(() => assetTypes.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }),
  description: text('description'),
  content: text('content'),
  status: assetStatusEnum('status').notNull().default('draft'),
  visibility: assetVisibilityEnum('visibility').notNull().default('internal'),
  ownerUserId: uuid('owner_user_id').references(() => users.id),
  tags: text('tags').array(),
  parentId: uuid('parent_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const assetRevisions = pgTable('asset_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  revisionNumber: integer('revision_number').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  content: text('content'),
  status: assetStatusEnum('status').notNull(),
  visibility: assetVisibilityEnum('visibility').notNull(),
  tags: text('tags').array(),
  changedByUserId: uuid('changed_by_user_id').references(() => users.id),
  changeSummary: text('change_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('asset_revision_number_unique').on(table.assetId, table.revisionNumber),
])

export const assetRelations_table = pgTable('asset_relations', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceAssetId: uuid('source_asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  targetAssetId: uuid('target_asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  relationType: varchar('relation_type', { length: 50 }).notNull().default('related_to'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('asset_relation_unique').on(table.sourceAssetId, table.targetAssetId, table.relationType),
])

// Relations
export const assetTypesRelations = relations(assetTypes, ({ many }) => ({
  assets: many(assets),
}))

export const assetsRelations = relations(assets, ({ one, many }) => ({
  assetType: one(assetTypes, { fields: [assets.assetTypeId], references: [assetTypes.id] }),
  ownerUser: one(users, { fields: [assets.ownerUserId], references: [users.id], relationName: 'assetOwner' }),
  createdByUser: one(users, { fields: [assets.createdByUserId], references: [users.id], relationName: 'assetCreator' }),
  parent: one(assets, { fields: [assets.parentId], references: [assets.id], relationName: 'assetParent' }),
  children: many(assets, { relationName: 'assetParent' }),
  sourceRelations: many(assetRelations_table, { relationName: 'sourceAsset' }),
  targetRelations: many(assetRelations_table, { relationName: 'targetAsset' }),
  revisions: many(assetRevisions),
}))

export const assetRelationsRelations = relations(assetRelations_table, ({ one }) => ({
  sourceAsset: one(assets, { fields: [assetRelations_table.sourceAssetId], references: [assets.id], relationName: 'sourceAsset' }),
  targetAsset: one(assets, { fields: [assetRelations_table.targetAssetId], references: [assets.id], relationName: 'targetAsset' }),
}))

export const assetRevisionsRelations = relations(assetRevisions, ({ one }) => ({
  asset: one(assets, { fields: [assetRevisions.assetId], references: [assets.id] }),
  changedByUser: one(users, { fields: [assetRevisions.changedByUserId], references: [users.id], relationName: 'assetRevisionChangedBy' }),
}))

export const storiesRelations = relations(stories, ({ one, many }) => ({
  initiativeRef: one(initiatives, {
    fields: [stories.initiativeId],
    references: [initiatives.id],
  }),
  ownerUser: one(users, {
    fields: [stories.ownerUserId],
    references: [users.id],
    relationName: 'storyOwner',
  }),
  tasks: many(tasks),
  comments: many(storyComments),
}))

export const initiativesRelations = relations(initiatives, ({ one, many }) => ({
  leaderUser: one(users, {
    fields: [initiatives.leaderUserId],
    references: [users.id],
    relationName: 'initiativeLeader',
  }),
  stories: many(stories),
  deliveryInitiatives: many(deliveryInitiatives),
  members: many(initiativeMembers),
  teams: many(initiativeTeams),
  issues: many(issues),
}))

export const initiativeMembersRelations = relations(initiativeMembers, ({ one }) => ({
  initiative: one(initiatives, {
    fields: [initiativeMembers.initiativeId],
    references: [initiatives.id],
  }),
  user: one(users, {
    fields: [initiativeMembers.userId],
    references: [users.id],
    relationName: 'initiativeMemberUser',
  }),
  assignedByUser: one(users, {
    fields: [initiativeMembers.assignedByUserId],
    references: [users.id],
    relationName: 'initiativeMemberAssignedBy',
  }),
}))

export const initiativeTeamsRelations = relations(initiativeTeams, ({ one }) => ({
  initiative: one(initiatives, {
    fields: [initiativeTeams.initiativeId],
    references: [initiatives.id],
  }),
  team: one(organizationTeams, {
    fields: [initiativeTeams.organizationTeamId],
    references: [organizationTeams.id],
  }),
  assignedByUser: one(users, {
    fields: [initiativeTeams.assignedByUserId],
    references: [users.id],
    relationName: 'initiativeTeamAssignedBy',
  }),
}))

export const storyCommentsRelations = relations(storyComments, ({ one }) => ({
  story: one(stories, {
    fields: [storyComments.storyId],
    references: [stories.id],
  }),
  user: one(users, {
    fields: [storyComments.userId],
    references: [users.id],
  }),
}))

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  story: one(stories, {
    fields: [tasks.storyId],
    references: [stories.id],
  }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: 'taskParent',
  }),
  subtasks: many(tasks, { relationName: 'taskParent' }),
  initiativeRef: one(initiatives, {
    fields: [tasks.initiativeId],
    references: [initiatives.id],
  }),
  delivery: one(deliveries, {
    fields: [tasks.deliveryId],
    references: [deliveries.id],
  }),
  createdByUser: one(users, {
    fields: [tasks.createdByUserId],
    references: [users.id],
    relationName: 'taskCreatedBy',
  }),
  ownerUser: one(users, {
    fields: [tasks.ownerUserId],
    references: [users.id],
    relationName: 'taskOwner',
  }),
  ownerTeam: one(organizationTeams, {
    fields: [tasks.ownerTeamId],
    references: [organizationTeams.id],
    relationName: 'taskOwnerTeam',
  }),
  comments: many(taskComments),
  attachments: many(taskAttachments),
}))

export const taskAttachmentsRelations = relations(taskAttachments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskAttachments.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskAttachments.userId],
    references: [users.id],
  }),
}))

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskComments.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskComments.userId],
    references: [users.id],
  }),
}))

export const deliveriesRelations = relations(deliveries, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [deliveries.createdByUserId],
    references: [users.id],
  }),
  tasks: many(tasks),
  deliveryInitiatives: many(deliveryInitiatives),
}))

export const deliveryInitiativesRelations = relations(deliveryInitiatives, ({ one }) => ({
  delivery: one(deliveries, {
    fields: [deliveryInitiatives.deliveryId],
    references: [deliveries.id],
  }),
  initiative: one(initiatives, {
    fields: [deliveryInitiatives.initiativeId],
    references: [initiatives.id],
  }),
}))

export const taskStatusHistory = pgTable('task_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  fromStatus: taskStatusEnum('from_status'),
  toStatus: taskStatusEnum('to_status').notNull(),
  changedByUserId: uuid('changed_by_user_id').references(() => users.id),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
})

export const taskStatusHistoryRelations = relations(taskStatusHistory, ({ one }) => ({
  task: one(tasks, {
    fields: [taskStatusHistory.taskId],
    references: [tasks.id],
  }),
  changedByUser: one(users, {
    fields: [taskStatusHistory.changedByUserId],
    references: [users.id],
  }),
}))

export const releasesRelations = relations(releases, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [releases.createdByUserId],
    references: [users.id],
    relationName: 'releaseCreatedBy',
  }),
  releaseManager: one(users, {
    fields: [releases.releaseManagerId],
    references: [users.id],
    relationName: 'releaseManager',
  }),
  releaseDeliveries: many(releaseDeliveries),
  releaseDeployments: many(releaseDeployments),
}))

export const releaseDeliveriesRelations = relations(releaseDeliveries, ({ one }) => ({
  release: one(releases, {
    fields: [releaseDeliveries.releaseId],
    references: [releases.id],
  }),
  delivery: one(deliveries, {
    fields: [releaseDeliveries.deliveryId],
    references: [deliveries.id],
  }),
  addedByUser: one(users, {
    fields: [releaseDeliveries.addedByUserId],
    references: [users.id],
  }),
}))

export const releaseDeploymentsRelations = relations(releaseDeployments, ({ one, many }) => ({
  release: one(releases, {
    fields: [releaseDeployments.releaseId],
    references: [releases.id],
  }),
  deployedByUser: one(users, {
    fields: [releaseDeployments.deployedByUserId],
    references: [users.id],
  }),
  deploymentTargets: many(deploymentTargets),
}))

export const serversRelations = relations(servers, ({ many }) => ({
  deploymentTargets: many(deploymentTargets),
}))

export const deploymentTargetsRelations = relations(deploymentTargets, ({ one }) => ({
  releaseDeployment: one(releaseDeployments, {
    fields: [deploymentTargets.releaseDeploymentId],
    references: [releaseDeployments.id],
  }),
  server: one(servers, {
    fields: [deploymentTargets.serverId],
    references: [servers.id],
  }),
}))

export const testCyclesRelations = relations(testCycles, ({ one, many }) => ({
  delivery: one(deliveries, {
    fields: [testCycles.deliveryId],
    references: [deliveries.id],
  }),
  release: one(releases, {
    fields: [testCycles.releaseId],
    references: [releases.id],
  }),
  createdByUser: one(users, {
    fields: [testCycles.createdByUserId],
    references: [users.id],
  }),
  issues: many(testCycleIssues),
}))

export const testCycleIssuesRelations = relations(testCycleIssues, ({ one }) => ({
  testCycle: one(testCycles, {
    fields: [testCycleIssues.testCycleId],
    references: [testCycles.id],
  }),
  story: one(stories, {
    fields: [testCycleIssues.storyId],
    references: [stories.id],
  }),
  reportedByUser: one(users, {
    fields: [testCycleIssues.reportedByUserId],
    references: [users.id],
    relationName: 'issueReportedBy',
  }),
  assignedToUser: one(users, {
    fields: [testCycleIssues.assignedToUserId],
    references: [users.id],
    relationName: 'issueAssignedTo',
  }),
  assignedToTeam: one(organizationTeams, {
    fields: [testCycleIssues.assignedToTeamId],
    references: [organizationTeams.id],
    relationName: 'testCycleIssueAssignedTeam',
  }),
}))

export const issuesRelations = relations(issues, ({ one }) => ({
  story: one(stories, {
    fields: [issues.storyId],
    references: [stories.id],
  }),
  initiative: one(initiatives, {
    fields: [issues.initiativeId],
    references: [initiatives.id],
  }),
  delivery: one(deliveries, {
    fields: [issues.deliveryId],
    references: [deliveries.id],
  }),
  testCycle: one(testCycles, {
    fields: [issues.testCycleId],
    references: [testCycles.id],
  }),
  reportedByUser: one(users, {
    fields: [issues.reportedByUserId],
    references: [users.id],
    relationName: 'issueReporter',
  }),
  assignedToUser: one(users, {
    fields: [issues.assignedToUserId],
    references: [users.id],
    relationName: 'issueAssignee',
  }),
  assignedToTeam: one(organizationTeams, {
    fields: [issues.assignedToTeamId],
    references: [organizationTeams.id],
    relationName: 'issueAssignedTeam',
  }),
}))

export const integrationConnectionsRelations = relations(integrationConnections, ({ one, many }) => ({
  connectedByUser: one(users, {
    fields: [integrationConnections.connectedByUserId],
    references: [users.id],
    relationName: 'integrationConnectedBy',
  }),
  credentials: one(integrationCredentials, {
    fields: [integrationConnections.id],
    references: [integrationCredentials.connectionId],
  }),
  syncRuns: many(integrationSyncRuns),
}))

export const integrationCredentialsRelations = relations(integrationCredentials, ({ one }) => ({
  connection: one(integrationConnections, {
    fields: [integrationCredentials.connectionId],
    references: [integrationConnections.id],
  }),
}))

export const integrationSyncRunsRelations = relations(integrationSyncRuns, ({ one, many }) => ({
  connection: one(integrationConnections, {
    fields: [integrationSyncRuns.connectionId],
    references: [integrationConnections.id],
  }),
  requestedByUser: one(users, {
    fields: [integrationSyncRuns.requestedByUserId],
    references: [users.id],
    relationName: 'integrationSyncRequestedBy',
  }),
  events: many(integrationSyncEvents),
}))

export const integrationSyncEventsRelations = relations(integrationSyncEvents, ({ one }) => ({
  run: one(integrationSyncRuns, {
    fields: [integrationSyncEvents.runId],
    references: [integrationSyncRuns.id],
  }),
}))

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [organizations.createdByUserId],
    references: [users.id],
    relationName: 'organizationCreatedBy',
  }),
  members: many(organizationMembers),
  teams: many(organizationTeams),
  memberReports: many(organizationMemberReports),
  invites: many(organizationInvites),
  products: many(products),
  onboardingEntries: many(onboardingProgress),
}))

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
    relationName: 'organizationMembershipUser',
  }),
  invitedByUser: one(users, {
    fields: [organizationMembers.invitedByUserId],
    references: [users.id],
    relationName: 'organizationMembershipInvitedBy',
  }),
}))

export const organizationTeamsRelations = relations(organizationTeams, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [organizationTeams.organizationId],
    references: [organizations.id],
  }),
  leadUser: one(users, {
    fields: [organizationTeams.leadUserId],
    references: [users.id],
    relationName: 'organizationTeamLead',
  }),
  createdByUser: one(users, {
    fields: [organizationTeams.createdByUserId],
    references: [users.id],
    relationName: 'organizationTeamCreatedBy',
  }),
  members: many(organizationTeamMembers),
  initiativeAssignments: many(initiativeTeams),
}))

export const organizationTeamMembersRelations = relations(organizationTeamMembers, ({ one }) => ({
  team: one(organizationTeams, {
    fields: [organizationTeamMembers.organizationTeamId],
    references: [organizationTeams.id],
  }),
  user: one(users, {
    fields: [organizationTeamMembers.userId],
    references: [users.id],
    relationName: 'organizationTeamMemberUser',
  }),
  addedByUser: one(users, {
    fields: [organizationTeamMembers.addedByUserId],
    references: [users.id],
    relationName: 'organizationTeamMemberAddedBy',
  }),
}))

export const organizationMemberReportsRelations = relations(organizationMemberReports, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMemberReports.organizationId],
    references: [organizations.id],
  }),
  memberUser: one(users, {
    fields: [organizationMemberReports.memberUserId],
    references: [users.id],
    relationName: 'organizationMemberReportMember',
  }),
  managerUser: one(users, {
    fields: [organizationMemberReports.managerUserId],
    references: [users.id],
    relationName: 'organizationMemberReportManager',
  }),
  setByUser: one(users, {
    fields: [organizationMemberReports.setByUserId],
    references: [users.id],
    relationName: 'organizationMemberReportSetBy',
  }),
}))

export const organizationInvitesRelations = relations(organizationInvites, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationInvites.organizationId],
    references: [organizations.id],
  }),
  invitedByUser: one(users, {
    fields: [organizationInvites.invitedByUserId],
    references: [users.id],
    relationName: 'organizationInviteSender',
  }),
  acceptedByUser: one(users, {
    fields: [organizationInvites.acceptedByUserId],
    references: [users.id],
    relationName: 'organizationInviteAcceptor',
  }),
}))

export const onboardingProgressRelations = relations(onboardingProgress, ({ one }) => ({
  user: one(users, {
    fields: [onboardingProgress.userId],
    references: [users.id],
    relationName: 'onboardingProgressUser',
  }),
  organization: one(organizations, {
    fields: [onboardingProgress.organizationId],
    references: [organizations.id],
  }),
}))

export const productsRelations = relations(products, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [products.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [products.createdByUserId],
    references: [users.id],
    relationName: 'productCreatedBy',
  }),
  members: many(productMembers),
}))

export const usersRelations = relations(users, ({ many }) => ({
  ledInitiatives: many(initiatives, { relationName: 'initiativeLeader' }),
  initiativeMemberships: many(initiativeMembers, { relationName: 'initiativeMemberUser' }),
  initiativeMembershipAssignments: many(initiativeMembers, { relationName: 'initiativeMemberAssignedBy' }),
  initiativeTeamAssignments: many(initiativeTeams, { relationName: 'initiativeTeamAssignedBy' }),
  ownedStories: many(stories, { relationName: 'storyOwner' }),
  createdTasks: many(tasks, { relationName: 'taskCreatedBy' }),
  ownedTasks: many(tasks, { relationName: 'taskOwner' }),
  reportedIssues: many(issues, { relationName: 'issueReporter' }),
  assignedIssues: many(issues, { relationName: 'issueAssignee' }),
  connectedIntegrations: many(integrationConnections, { relationName: 'integrationConnectedBy' }),
  requestedIntegrationSyncRuns: many(integrationSyncRuns, { relationName: 'integrationSyncRequestedBy' }),
  changedAssetRevisions: many(assetRevisions, { relationName: 'assetRevisionChangedBy' }),
  createdOrganizations: many(organizations, { relationName: 'organizationCreatedBy' }),
  organizationMemberships: many(organizationMembers, { relationName: 'organizationMembershipUser' }),
  organizationMembershipInvites: many(organizationMembers, { relationName: 'organizationMembershipInvitedBy' }),
  ledOrganizationTeams: many(organizationTeams, { relationName: 'organizationTeamLead' }),
  createdOrganizationTeams: many(organizationTeams, { relationName: 'organizationTeamCreatedBy' }),
  organizationTeamMemberships: many(organizationTeamMembers, { relationName: 'organizationTeamMemberUser' }),
  organizationTeamMembershipsAdded: many(organizationTeamMembers, { relationName: 'organizationTeamMemberAddedBy' }),
  organizationReportAsMember: many(organizationMemberReports, { relationName: 'organizationMemberReportMember' }),
  organizationReportAsManager: many(organizationMemberReports, { relationName: 'organizationMemberReportManager' }),
  organizationReportUpdates: many(organizationMemberReports, { relationName: 'organizationMemberReportSetBy' }),
  sentOrganizationInvites: many(organizationInvites, { relationName: 'organizationInviteSender' }),
  acceptedOrganizationInvites: many(organizationInvites, { relationName: 'organizationInviteAcceptor' }),
  onboardingProgressEntries: many(onboardingProgress, { relationName: 'onboardingProgressUser' }),
  createdProducts: many(products, { relationName: 'productCreatedBy' }),
  ownedDashboardPages: many(dashboardPages, { relationName: 'dashboardPageOwner' }),
  createdDashboardPages: many(dashboardPages, { relationName: 'dashboardPageCreatedBy' }),
  updatedDashboardPages: many(dashboardPages, { relationName: 'dashboardPageUpdatedBy' }),
  createdDashboardWidgets: many(dashboardWidgets, { relationName: 'dashboardWidgetCreatedBy' }),
  updatedDashboardWidgets: many(dashboardWidgets, { relationName: 'dashboardWidgetUpdatedBy' }),
  dashboardViewerInvitesSent: many(dashboardPageViewers, { relationName: 'dashboardViewerInvitedBy' }),
  dashboardViewerEntries: many(dashboardPageViewers, { relationName: 'dashboardViewerUser' }),
  ownedDashboardTemplates: many(dashboardTemplates, { relationName: 'dashboardTemplateOwner' }),
  createdDashboardTemplates: many(dashboardTemplates, { relationName: 'dashboardTemplateCreatedBy' }),
  updatedDashboardTemplates: many(dashboardTemplates, { relationName: 'dashboardTemplateUpdatedBy' }),
}))

export const dashboardPagesRelations = relations(dashboardPages, ({ one, many }) => ({
  ownerUser: one(users, {
    fields: [dashboardPages.ownerUserId],
    references: [users.id],
    relationName: 'dashboardPageOwner',
  }),
  createdByUser: one(users, {
    fields: [dashboardPages.createdByUserId],
    references: [users.id],
    relationName: 'dashboardPageCreatedBy',
  }),
  updatedByUser: one(users, {
    fields: [dashboardPages.updatedByUserId],
    references: [users.id],
    relationName: 'dashboardPageUpdatedBy',
  }),
  widgets: many(dashboardWidgets),
  viewers: many(dashboardPageViewers),
}))

export const dashboardWidgetsRelations = relations(dashboardWidgets, ({ one }) => ({
  page: one(dashboardPages, {
    fields: [dashboardWidgets.pageId],
    references: [dashboardPages.id],
  }),
  createdByUser: one(users, {
    fields: [dashboardWidgets.createdByUserId],
    references: [users.id],
    relationName: 'dashboardWidgetCreatedBy',
  }),
  updatedByUser: one(users, {
    fields: [dashboardWidgets.updatedByUserId],
    references: [users.id],
    relationName: 'dashboardWidgetUpdatedBy',
  }),
}))

export const dashboardPageViewersRelations = relations(dashboardPageViewers, ({ one }) => ({
  page: one(dashboardPages, {
    fields: [dashboardPageViewers.pageId],
    references: [dashboardPages.id],
  }),
  user: one(users, {
    fields: [dashboardPageViewers.userId],
    references: [users.id],
    relationName: 'dashboardViewerUser',
  }),
  invitedByUser: one(users, {
    fields: [dashboardPageViewers.invitedByUserId],
    references: [users.id],
    relationName: 'dashboardViewerInvitedBy',
  }),
}))

export const dashboardTemplatesRelations = relations(dashboardTemplates, ({ one, many }) => ({
  ownerUser: one(users, {
    fields: [dashboardTemplates.ownerUserId],
    references: [users.id],
    relationName: 'dashboardTemplateOwner',
  }),
  createdByUser: one(users, {
    fields: [dashboardTemplates.createdByUserId],
    references: [users.id],
    relationName: 'dashboardTemplateCreatedBy',
  }),
  updatedByUser: one(users, {
    fields: [dashboardTemplates.updatedByUserId],
    references: [users.id],
    relationName: 'dashboardTemplateUpdatedBy',
  }),
  pages: many(dashboardTemplatePages),
}))

export const dashboardTemplatePagesRelations = relations(dashboardTemplatePages, ({ one, many }) => ({
  template: one(dashboardTemplates, {
    fields: [dashboardTemplatePages.templateId],
    references: [dashboardTemplates.id],
  }),
  widgets: many(dashboardTemplateWidgets),
}))

export const dashboardTemplateWidgetsRelations = relations(dashboardTemplateWidgets, ({ one }) => ({
  templatePage: one(dashboardTemplatePages, {
    fields: [dashboardTemplateWidgets.templatePageId],
    references: [dashboardTemplatePages.id],
  }),
}))

// ── Feature Requests ──

export const featureRequestStatusEnum = pgEnum('feature_request_status', [
  'open', 'under_review', 'planned', 'in_progress', 'completed', 'declined'
])

export const featureRequestCategoryEnum = pgEnum('feature_request_category', [
  'enhancement', 'new_feature', 'integration', 'ux_improvement', 'performance', 'other'
])

export const featureRequests = pgTable('feature_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: featureRequestStatusEnum('status').notNull().default('open'),
  category: featureRequestCategoryEnum('category').notNull().default('enhancement'),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  storyId: uuid('story_id').references(() => stories.id),
  tags: text('tags').array(),
  upvoteCount: integer('upvote_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const featureRequestUpvotes = pgTable('feature_request_upvotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  featureRequestId: uuid('feature_request_id').notNull().references(() => featureRequests.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('feature_request_upvote_unique').on(table.featureRequestId, table.userId),
])

export const featureRequestComments = pgTable('feature_request_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  featureRequestId: uuid('feature_request_id').notNull().references(() => featureRequests.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const featureRequestAttachments = pgTable('feature_request_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  featureRequestId: uuid('feature_request_id').notNull().references(() => featureRequests.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  filePath: varchar('file_path', { length: 500 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const featureRequestsRelations = relations(featureRequests, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [featureRequests.createdByUserId],
    references: [users.id],
    relationName: 'featureRequestCreatedBy',
  }),
  story: one(stories, {
    fields: [featureRequests.storyId],
    references: [stories.id],
  }),
  upvotes: many(featureRequestUpvotes),
  comments: many(featureRequestComments),
  attachments: many(featureRequestAttachments),
}))

export const featureRequestUpvotesRelations = relations(featureRequestUpvotes, ({ one }) => ({
  featureRequest: one(featureRequests, {
    fields: [featureRequestUpvotes.featureRequestId],
    references: [featureRequests.id],
  }),
  user: one(users, {
    fields: [featureRequestUpvotes.userId],
    references: [users.id],
  }),
}))

export const featureRequestCommentsRelations = relations(featureRequestComments, ({ one }) => ({
  featureRequest: one(featureRequests, {
    fields: [featureRequestComments.featureRequestId],
    references: [featureRequests.id],
  }),
  user: one(users, {
    fields: [featureRequestComments.userId],
    references: [users.id],
  }),
}))

export const featureRequestAttachmentsRelations = relations(featureRequestAttachments, ({ one }) => ({
  featureRequest: one(featureRequests, {
    fields: [featureRequestAttachments.featureRequestId],
    references: [featureRequests.id],
  }),
  user: one(users, {
    fields: [featureRequestAttachments.userId],
    references: [users.id],
  }),
}))

// ── Consumer Feedback ──

export const consumerFeedbackTypeEnum = pgEnum('consumer_feedback_type', [
  'bug', 'feature', 'enhancement'
])

export const consumerFeedbackStatusEnum = pgEnum('consumer_feedback_status', [
  'new', 'acknowledged', 'investigating', 'resolved', 'wont_fix', 'duplicate'
])

export const consumerFeedbackPriorityEnum = pgEnum('consumer_feedback_priority', [
  'low', 'medium', 'high', 'critical'
])

export const consumerFeedbacks = pgTable('consumer_feedbacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  type: consumerFeedbackTypeEnum('type').notNull().default('bug'),
  status: consumerFeedbackStatusEnum('status').notNull().default('new'),
  priority: consumerFeedbackPriorityEnum('priority').notNull().default('medium'),
  reporterName: varchar('reporter_name', { length: 255 }),
  reporterEmail: varchar('reporter_email', { length: 255 }),
  reporterDevice: varchar('reporter_device', { length: 255 }),
  reporterBrowser: varchar('reporter_browser', { length: 255 }),
  reporterOs: varchar('reporter_os', { length: 255 }),
  appVersion: varchar('app_version', { length: 50 }),
  pageUrl: varchar('page_url', { length: 500 }),
  stepsToReproduce: text('steps_to_reproduce'),
  expectedBehavior: text('expected_behavior'),
  actualBehavior: text('actual_behavior'),
  storyId: uuid('story_id').references(() => stories.id),
  assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
  tags: text('tags').array(),
  upvoteCount: integer('upvote_count').notNull().default(0),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const consumerFeedbackAttachments = pgTable('consumer_feedback_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  feedbackId: uuid('feedback_id').notNull().references(() => consumerFeedbacks.id, { onDelete: 'cascade' }),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  filePath: varchar('file_path', { length: 500 }).notNull(),
  fileType: varchar('file_type', { length: 50 }).notNull().default('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const consumerFeedbackComments = pgTable('consumer_feedback_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  feedbackId: uuid('feedback_id').notNull().references(() => consumerFeedbacks.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  isInternal: integer('is_internal').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const consumerFeedbacksRelations = relations(consumerFeedbacks, ({ one, many }) => ({
  assignedToUser: one(users, {
    fields: [consumerFeedbacks.assignedToUserId],
    references: [users.id],
    relationName: 'feedbackAssignedTo',
  }),
  story: one(stories, {
    fields: [consumerFeedbacks.storyId],
    references: [stories.id],
  }),
  attachments: many(consumerFeedbackAttachments),
  comments: many(consumerFeedbackComments),
}))

export const consumerFeedbackAttachmentsRelations = relations(consumerFeedbackAttachments, ({ one }) => ({
  feedback: one(consumerFeedbacks, {
    fields: [consumerFeedbackAttachments.feedbackId],
    references: [consumerFeedbacks.id],
  }),
}))

export const consumerFeedbackCommentsRelations = relations(consumerFeedbackComments, ({ one }) => ({
  feedback: one(consumerFeedbacks, {
    fields: [consumerFeedbackComments.feedbackId],
    references: [consumerFeedbacks.id],
  }),
  user: one(users, {
    fields: [consumerFeedbackComments.userId],
    references: [users.id],
  }),
}))

// Type exports
export type StoryRecord = typeof stories.$inferSelect
export type NewStory = typeof stories.$inferInsert
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type TaskComment = typeof taskComments.$inferSelect
export type NewTaskComment = typeof taskComments.$inferInsert
export type Initiative = typeof initiatives.$inferSelect
export type NewInitiative = typeof initiatives.$inferInsert
export type InitiativeMemberRecord = typeof initiativeMembers.$inferSelect
export type NewInitiativeMember = typeof initiativeMembers.$inferInsert
export type InitiativeTeamRecord = typeof initiativeTeams.$inferSelect
export type NewInitiativeTeam = typeof initiativeTeams.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type OrganizationRecord = typeof organizations.$inferSelect
export type NewOrganization = typeof organizations.$inferInsert
export type OrganizationMemberRecord = typeof organizationMembers.$inferSelect
export type NewOrganizationMember = typeof organizationMembers.$inferInsert
export type OrganizationTeamRecord = typeof organizationTeams.$inferSelect
export type NewOrganizationTeam = typeof organizationTeams.$inferInsert
export type OrganizationTeamMemberRecord = typeof organizationTeamMembers.$inferSelect
export type NewOrganizationTeamMember = typeof organizationTeamMembers.$inferInsert
export type OrganizationMemberReportRecord = typeof organizationMemberReports.$inferSelect
export type NewOrganizationMemberReport = typeof organizationMemberReports.$inferInsert
export type OrganizationInviteRecord = typeof organizationInvites.$inferSelect
export type NewOrganizationInvite = typeof organizationInvites.$inferInsert
export type OnboardingProgressRecord = typeof onboardingProgress.$inferSelect
export type NewOnboardingProgress = typeof onboardingProgress.$inferInsert
export type Activity = typeof activities.$inferSelect
export type NewActivity = typeof activities.$inferInsert
export type ProductMember = typeof productMembers.$inferSelect
export type NewProductMember = typeof productMembers.$inferInsert
export type DashboardPageRecord = typeof dashboardPages.$inferSelect
export type NewDashboardPage = typeof dashboardPages.$inferInsert
export type DashboardWidgetRecord = typeof dashboardWidgets.$inferSelect
export type NewDashboardWidget = typeof dashboardWidgets.$inferInsert
export type DashboardPageViewerRecord = typeof dashboardPageViewers.$inferSelect
export type NewDashboardPageViewer = typeof dashboardPageViewers.$inferInsert
export type DashboardTemplateRecord = typeof dashboardTemplates.$inferSelect
export type NewDashboardTemplate = typeof dashboardTemplates.$inferInsert
export type DashboardTemplatePageRecord = typeof dashboardTemplatePages.$inferSelect
export type NewDashboardTemplatePage = typeof dashboardTemplatePages.$inferInsert
export type DashboardTemplateWidgetRecord = typeof dashboardTemplateWidgets.$inferSelect
export type NewDashboardTemplateWidget = typeof dashboardTemplateWidgets.$inferInsert
export type Delivery = typeof deliveries.$inferSelect
export type NewDelivery = typeof deliveries.$inferInsert
export type DeliveryInitiative = typeof deliveryInitiatives.$inferSelect
export type NewDeliveryInitiative = typeof deliveryInitiatives.$inferInsert
export type UserSetting = typeof userSettings.$inferSelect
export type NewUserSetting = typeof userSettings.$inferInsert
export type NotificationRecord = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert
export type NotificationPreferenceRecord = typeof notificationPreferences.$inferSelect
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert
export type TaskAttachment = typeof taskAttachments.$inferSelect
export type NewTaskAttachment = typeof taskAttachments.$inferInsert
export type ProductRecord = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
export type TaskStatusHistory = typeof taskStatusHistory.$inferSelect
export type NewTaskStatusHistory = typeof taskStatusHistory.$inferInsert
export type ReleaseRecord = typeof releases.$inferSelect
export type NewRelease = typeof releases.$inferInsert
export type ReleaseDeliveryRecord = typeof releaseDeliveries.$inferSelect
export type NewReleaseDelivery = typeof releaseDeliveries.$inferInsert
export type ReleaseDeploymentRecord = typeof releaseDeployments.$inferSelect
export type NewReleaseDeployment = typeof releaseDeployments.$inferInsert
export type ServerRecord = typeof servers.$inferSelect
export type NewServer = typeof servers.$inferInsert
export type DeploymentTargetRecord = typeof deploymentTargets.$inferSelect
export type NewDeploymentTarget = typeof deploymentTargets.$inferInsert
export type FavoriteRecord = typeof favorites.$inferSelect
export type NewFavorite = typeof favorites.$inferInsert
export type IssueRecord = typeof issues.$inferSelect
export type NewIssue = typeof issues.$inferInsert
export type IntegrationCatalogRecord = typeof integrationCatalog.$inferSelect
export type NewIntegrationCatalog = typeof integrationCatalog.$inferInsert
export type IntegrationConnectionRecord = typeof integrationConnections.$inferSelect
export type NewIntegrationConnection = typeof integrationConnections.$inferInsert
export type IntegrationCredentialRecord = typeof integrationCredentials.$inferSelect
export type NewIntegrationCredential = typeof integrationCredentials.$inferInsert
export type IntegrationSyncRunRecord = typeof integrationSyncRuns.$inferSelect
export type NewIntegrationSyncRun = typeof integrationSyncRuns.$inferInsert
export type IntegrationSyncEventRecord = typeof integrationSyncEvents.$inferSelect
export type NewIntegrationSyncEvent = typeof integrationSyncEvents.$inferInsert
export type AssetRevisionRecord = typeof assetRevisions.$inferSelect
export type NewAssetRevision = typeof assetRevisions.$inferInsert

// Role-based page visibility permissions
export const rolePermissions = pgTable('role_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  role: userRoleEnum('role').notNull(),
  page: varchar('page', { length: 100 }).notNull(),
  visible: boolean('visible').notNull().default(false),
  canCreate: boolean('can_create').notNull().default(false),
  canEdit: boolean('can_edit').notNull().default(false),
  canDelete: boolean('can_delete').notNull().default(false),
  selfViewOnly: boolean('self_view_only').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('role_permissions_unique').on(table.role, table.page),
])

export type RolePermissionRecord = typeof rolePermissions.$inferSelect
export type NewRolePermission = typeof rolePermissions.$inferInsert

export const titles = pgTable('titles', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 100 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  isSystem: boolean('is_system').notNull().default(false),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('titles_key_unique').on(table.key),
  unique('titles_name_unique').on(table.name),
])

export const titlePermissions = pgTable('title_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  titleId: uuid('title_id').notNull().references(() => titles.id, { onDelete: 'cascade' }),
  page: varchar('page', { length: 100 }).notNull(),
  visible: boolean('visible').notNull().default(false),
  canCreate: boolean('can_create').notNull().default(false),
  canEdit: boolean('can_edit').notNull().default(false),
  canDelete: boolean('can_delete').notNull().default(false),
  selfViewOnly: boolean('self_view_only').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('title_permissions_unique').on(table.titleId, table.page),
])

export const userTitles = pgTable('user_titles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  titleId: uuid('title_id').notNull().references(() => titles.id, { onDelete: 'cascade' }),
  assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('user_titles_user_unique').on(table.userId),
])

export type TitleRecord = typeof titles.$inferSelect
export type NewTitle = typeof titles.$inferInsert
export type TitlePermissionRecord = typeof titlePermissions.$inferSelect
export type NewTitlePermission = typeof titlePermissions.$inferInsert
export type UserTitleRecord = typeof userTitles.$inferSelect
export type NewUserTitle = typeof userTitles.$inferInsert
