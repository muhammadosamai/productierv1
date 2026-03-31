import { pgTable, uuid, text, varchar, timestamp, date, pgEnum, json, unique, integer, boolean } from 'drizzle-orm/pg-core'
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
  'planning', 'active', 'paused', 'completed'
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

export const userRoleEnum = pgEnum('user_role', [
  'super_admin', 'admin', 'product_admin', 'product_manager',
  'business_analyst', 'developer', 'viewer'
])

export const assetStatusEnum = pgEnum('asset_status', [
  'draft', 'active', 'deprecated', 'archived'
])

export const assetVisibilityEnum = pgEnum('asset_visibility', [
  'public', 'internal', 'private'
])

// Tables (SQL table/column names kept unchanged for DB compatibility)
export const stories = pgTable('backlog_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  type: storyTypeEnum('type').notNull().default('feature'),
  priority: storyPriorityEnum('priority').notNull().default('medium'),
  status: storyStatusEnum('status').notNull().default('backlog'),
  product: varchar('product', { length: 255 }).notNull().default('Product'),
  initiative: varchar('initiative', { length: 255 }),
  delivery: varchar('delivery', { length: 255 }),
  owner: varchar('owner', { length: 255 }),
  ownerAvatar: varchar('owner_avatar', { length: 500 }),
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
  productId: varchar('product_id', { length: 255 }).notNull(),
  initiativeId: uuid('initiative_id'),
  storyId: uuid('item_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  deliveryId: uuid('delivery_id'),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: taskStatusEnum('status').notNull().default('created'),
  priority: taskPriorityEnum('priority').notNull().default('medium'),
  type: taskTypeEnum('type'),
  ownerUserId: uuid('owner_user_id').references(() => users.id),
  assigneeUserIds: uuid('assignee_user_ids').array(),
  reviewerUserIds: uuid('reviewer_user_ids').array(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  estimateValue: integer('estimate_value'),
  dependent: uuid('dependent').array(),
  blockedReason: text('blocked_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  dueAt: timestamp('due_at'),
})

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
  leader: varchar('leader', { length: 255 }),
  leaderAvatar: varchar('leader_avatar', { length: 500 }),
  priority: storyPriorityEnum('priority').notNull().default('medium'),
  product: varchar('product', { length: 255 }).notNull().default('Product'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const deliveries = pgTable('deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: varchar('product_id', { length: 255 }).notNull(),
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
  productId: varchar('product_id', { length: 255 }).notNull(),
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
  productId: varchar('product_id', { length: 255 }).notNull(),
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
  avatar: varchar('avatar', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 100 }).notNull(),
  value: json('value').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('user_settings_unique').on(table.userId, table.key),
])

export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  product: varchar('product', { length: 255 }).notNull(),
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
  name: varchar('name', { length: 255 }).notNull().unique(),
  logo: varchar('logo', { length: 500 }),
  description: text('description'),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const productMembers = pgTable('product_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  product: varchar('product', { length: 255 }).notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).notNull().default('member'),
  addedAt: timestamp('added_at').notNull().defaultNow(),
}, (table) => [
  unique('product_user_unique').on(table.product, table.userId),
])

export const inviteStatusEnum = pgEnum('invite_status', ['pending', 'accepted', 'expired'])

export const productInvites = pgTable('product_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  product: varchar('product', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('member'),
  token: varchar('token', { length: 255 }).notNull().unique(),
  status: inviteStatusEnum('status').notNull().default('pending'),
  invitedByUserId: uuid('invited_by_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const favorites = pgTable('favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  productId: varchar('product_id', { length: 255 }).notNull(),
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
  productId: varchar('product_id', { length: 255 }).notNull(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

// Wiki Asset tables
export const assetTypes = pgTable('asset_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  category: varchar('category', { length: 100 }).notNull().default('business'),
  icon: varchar('icon', { length: 50 }),
  color: varchar('color', { length: 20 }),
  productId: varchar('product_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('asset_type_slug_product_unique').on(table.slug, table.productId),
])

export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: varchar('product_id', { length: 255 }).notNull(),
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
}))

export const assetRelationsRelations = relations(assetRelations_table, ({ one }) => ({
  sourceAsset: one(assets, { fields: [assetRelations_table.sourceAssetId], references: [assets.id], relationName: 'sourceAsset' }),
  targetAsset: one(assets, { fields: [assetRelations_table.targetAssetId], references: [assets.id], relationName: 'targetAsset' }),
}))

export const storiesRelations = relations(stories, ({ many }) => ({
  tasks: many(tasks),
  comments: many(storyComments),
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
  productId: varchar('product_id', { length: 255 }).notNull(),
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
}))

export const usersRelations = relations(users, ({ many }) => ({
  createdTasks: many(tasks, { relationName: 'taskCreatedBy' }),
  ownedTasks: many(tasks, { relationName: 'taskOwner' }),
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
  productId: varchar('product_id', { length: 255 }).notNull(),
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
  productId: varchar('product_id', { length: 255 }).notNull(),
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
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Activity = typeof activities.$inferSelect
export type NewActivity = typeof activities.$inferInsert
export type ProductMember = typeof productMembers.$inferSelect
export type NewProductMember = typeof productMembers.$inferInsert
export type Delivery = typeof deliveries.$inferSelect
export type NewDelivery = typeof deliveries.$inferInsert
export type DeliveryInitiative = typeof deliveryInitiatives.$inferSelect
export type NewDeliveryInitiative = typeof deliveryInitiatives.$inferInsert
export type UserSetting = typeof userSettings.$inferSelect
export type NewUserSetting = typeof userSettings.$inferInsert
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

// Role-based page visibility permissions
export const rolePermissions = pgTable('role_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  role: userRoleEnum('role').notNull(),
  page: varchar('page', { length: 100 }).notNull(),
  visible: boolean('visible').notNull().default(true),
  canCreate: boolean('can_create').notNull().default(true),
  canEdit: boolean('can_edit').notNull().default(true),
  selfViewOnly: boolean('self_view_only').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('role_permissions_unique').on(table.role, table.page),
])

export type RolePermissionRecord = typeof rolePermissions.$inferSelect
export type NewRolePermission = typeof rolePermissions.$inferInsert
