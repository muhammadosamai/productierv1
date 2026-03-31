import crypto from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import { getDatabaseConfig } from '../config/database'

interface JournalEntry {
  idx: number
  tag: string
  when: number
  breakpoints: boolean
}

interface JournalFile {
  version: string
  dialect: string
  entries: JournalEntry[]
}

interface RetiredMigrationRecord {
  tag: string
  reason?: string
}

interface RetiredMigrationsFile {
  version?: number
  retired?: RetiredMigrationRecord[]
}

type SchemaCheckKind = 'table' | 'column' | 'index' | 'trigger'

interface SchemaCheck {
  kind: SchemaCheckKind
  key: string
  exists: boolean
}

interface RequiredMigrationStatus {
  tag: string
  inJournal: boolean
  hash: string | null
  applied: boolean
}

export interface MigrationStatusReport {
  reconciled: boolean
  journalEntries: number
  appliedRows: number
  insertedRows: number
  latestAppliedCreatedAt: number | null
  orphanSqlFiles: string[]
  retiredOrphanSqlFiles: string[]
  unexpectedOrphanSqlFiles: string[]
  hasUnexpectedOrphanSqlFiles: boolean
  missingSqlForJournalTags: string[]
  hasJournalReferenceGap: boolean
  staleRetiredTags: string[]
  requiredNotificationMigrations: RequiredMigrationStatus[]
  hasRequiredNotificationLedgerGap: boolean
  requiredPlatformMigrations: RequiredMigrationStatus[]
  hasRequiredPlatformLedgerGap: boolean
  notificationSchemaChecks: SchemaCheck[]
  notificationSchemaReady: boolean
  platformSchemaChecks: SchemaCheck[]
  platformSchemaReady: boolean
}

const REQUIRED_NOTIFICATION_MIGRATION_TAGS = [
  '0014_roles_titles_foundation',
  '0015_notifications_foundation',
  '0017_notifications_lifecycle_controls',
  '0019_notifications_channels_product_preferences',
  '0020_notifications_reminder_preferences',
  '0023_notifications_daily_rollup_preferences',
] as const

const REQUIRED_PLATFORM_MIGRATION_TAGS = [
  '0003_update_story_statuses',
  '0010_p1_capability_foundations',
  '0011_add_role_permission_can_delete',
  '0011_metrics_snapshots_cache',
  '0016_global_search_documents',
  '0018_pgvector_semantic_cutover',
  '0019_search_relevance_tuning_indexes',
  '0031_platform_runtime_backfill',
  '0032_product_membership_org_enforcement',
] as const

function sqlFileToTag(fileName: string): string {
  return fileName.endsWith('.sql') ? fileName.slice(0, -4) : fileName
}

function loadJournal(migrationsDir: string): JournalEntry[] {
  const journalPath = join(migrationsDir, 'meta', '_journal.json')
  const raw = readFileSync(journalPath, 'utf8')
  const parsed = JSON.parse(raw) as JournalFile
  return [...parsed.entries].sort((left, right) => left.when - right.when)
}

function loadRetiredMigrationTags(migrationsDir: string): {
  retiredTags: Set<string>
  staleRetiredTags: string[]
} {
  const retiredPath = join(migrationsDir, 'meta', 'retired-migrations.json')
  if (!existsSync(retiredPath)) {
    return {
      retiredTags: new Set<string>(),
      staleRetiredTags: [],
    }
  }

  const parsed = JSON.parse(readFileSync(retiredPath, 'utf8')) as RetiredMigrationsFile
  const retiredEntries = Array.isArray(parsed.retired)
    ? parsed.retired.filter(
      (item): item is RetiredMigrationRecord => Boolean(item && typeof item.tag === 'string' && item.tag.trim())
    )
    : []
  const retiredTags = new Set(retiredEntries.map((item) => item.tag))
  const staleRetiredTags = retiredEntries
    .map((item) => item.tag)
    .filter((tag) => !existsSync(join(migrationsDir, `${tag}.sql`)))
    .sort((left, right) => left.localeCompare(right))

  return {
    retiredTags,
    staleRetiredTags,
  }
}

function computeMigrationHash(migrationsDir: string, tag: string): string {
  const migrationPath = join(migrationsDir, `${tag}.sql`)
  const query = readFileSync(migrationPath, 'utf8')
  return crypto.createHash('sha256').update(query).digest('hex')
}

function computeMigrationHashIfPresent(migrationsDir: string, tag: string): string | null {
  try {
    return computeMigrationHash(migrationsDir, tag)
  } catch {
    return null
  }
}

function findOrphanSqlFiles(migrationsDir: string, entries: JournalEntry[]): string[] {
  const journalFileSet = new Set(entries.map((entry) => `${entry.tag}.sql`))
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql') && !journalFileSet.has(name))
    .sort((left, right) => left.localeCompare(right))
}

function findMissingSqlForJournal(migrationsDir: string, entries: JournalEntry[]): string[] {
  return entries
    .filter((entry) => !existsSync(join(migrationsDir, `${entry.tag}.sql`)))
    .map((entry) => entry.tag)
    .sort((left, right) => left.localeCompare(right))
}

function collectRequiredMigrationStatus(
  tags: readonly string[],
  journalTagSet: Set<string>,
  existingHashes: Set<string>,
  migrationsDir: string
): RequiredMigrationStatus[] {
  return tags.map((tag) => {
    const hash = computeMigrationHashIfPresent(migrationsDir, tag)
    return {
      tag,
      inJournal: journalTagSet.has(tag),
      hash,
      applied: hash ? existingHashes.has(hash) : false,
    }
  })
}

async function ensureMigrationLedger(sqlClient: postgres.Sql) {
  const schemaRows = await sqlClient<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.schemata
      WHERE schema_name = 'drizzle'
    ) AS exists
  `
  if (!schemaRows[0]?.exists) {
    await sqlClient`CREATE SCHEMA drizzle`
  }

  const tableRows = await sqlClient<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'drizzle'
        AND table_name = '__drizzle_migrations'
    ) AS exists
  `
  if (!tableRows[0]?.exists) {
    await sqlClient`
      CREATE TABLE drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `
  }
}

async function relationExists(sqlClient: postgres.Sql, relationName: string): Promise<boolean> {
  const rows = await sqlClient<{ relation: string | null }[]>`
    SELECT to_regclass(${relationName})::text AS relation
  `
  return rows[0]?.relation != null
}

async function columnExists(
  sqlClient: postgres.Sql,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const rows = await sqlClient<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS exists
  `
  return Boolean(rows[0]?.exists)
}

async function columnTypeExists(
  sqlClient: postgres.Sql,
  tableName: string,
  columnName: string,
  udtName: string
): Promise<boolean> {
  const rows = await sqlClient<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
        AND udt_name = ${udtName}
    ) AS exists
  `
  return Boolean(rows[0]?.exists)
}

async function triggerExists(
  sqlClient: postgres.Sql,
  tableName: string,
  triggerName: string
): Promise<boolean> {
  const rows = await sqlClient<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_trigger trigger
      INNER JOIN pg_class relation ON relation.oid = trigger.tgrelid
      INNER JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = ${tableName}
        AND trigger.tgname = ${triggerName}
        AND NOT trigger.tgisinternal
    ) AS exists
  `
  return Boolean(rows[0]?.exists)
}

async function collectNotificationSchemaChecks(sqlClient: postgres.Sql): Promise<SchemaCheck[]> {
  const checks: SchemaCheck[] = []

  const requiredTables = [
    'role_permissions',
    'titles',
    'user_titles',
    'notifications',
    'notification_preferences',
  ]
  for (const tableName of requiredTables) {
    checks.push({
      kind: 'table',
      key: tableName,
      exists: await relationExists(sqlClient, `public.${tableName}`),
    })
  }

  const requiredColumns = [
    ['notifications', 'muted_at'],
    ['notifications', 'snoozed_until'],
    ['notification_preferences', 'product_id'],
    ['notification_preferences', 'slack_enabled'],
    ['notification_preferences', 'reminder_cadence'],
    ['notification_preferences', 'reminder_cooldown_minutes'],
    ['notification_preferences', 'reminder_due_soon_hours'],
    ['notification_preferences', 'reminder_overdue_enabled'],
    ['notification_preferences', 'reminder_due_soon_enabled'],
    ['notification_preferences', 'reminder_stale_enabled'],
    ['notification_preferences', 'reminder_review_sla_enabled'],
    ['notification_preferences', 'daily_rollup_enabled'],
  ] as const
  for (const [tableName, columnName] of requiredColumns) {
    checks.push({
      kind: 'column',
      key: `${tableName}.${columnName}`,
      exists: await columnExists(sqlClient, tableName, columnName),
    })
  }

  const requiredIndexes = [
    'notifications_recipient_active_idx',
    'notification_preferences_user_global_category_unique',
    'notification_preferences_user_product_category_unique',
  ]
  for (const indexName of requiredIndexes) {
    checks.push({
      kind: 'index',
      key: indexName,
      exists: await relationExists(sqlClient, `public.${indexName}`),
    })
  }

  return checks
}

async function collectPlatformSchemaChecks(sqlClient: postgres.Sql): Promise<SchemaCheck[]> {
  const checks: SchemaCheck[] = []

  const requiredTables = [
    'issues',
    'integration_catalog',
    'integration_connections',
    'metrics_snapshots',
    'search_documents',
    'asset_revisions',
  ]
  for (const tableName of requiredTables) {
    checks.push({
      kind: 'table',
      key: tableName,
      exists: await relationExists(sqlClient, `public.${tableName}`),
    })
  }

  const requiredColumns = [
    ['role_permissions', 'can_delete'],
    ['search_documents', 'embedding'],
    ['metrics_snapshots', 'cache_key'],
    ['issues', 'product_id'],
    ['integration_connections', 'product_id'],
  ] as const
  for (const [tableName, columnName] of requiredColumns) {
    checks.push({
      kind: 'column',
      key: `${tableName}.${columnName}`,
      exists: await columnExists(sqlClient, tableName, columnName),
    })
  }

  checks.push({
    kind: 'column',
    key: 'search_documents.embedding:vector',
    exists: await columnTypeExists(sqlClient, 'search_documents', 'embedding', 'vector'),
  })

  const requiredIndexes = [
    'search_documents_embedding_ivfflat_idx',
    'metrics_snapshots_cache_key_unique',
  ]
  for (const indexName of requiredIndexes) {
    checks.push({
      kind: 'index',
      key: indexName,
      exists: await relationExists(sqlClient, `public.${indexName}`),
    })
  }

  checks.push({
    kind: 'trigger',
    key: 'product_members_require_org_membership',
    exists: await triggerExists(sqlClient, 'product_members', 'product_members_require_org_membership'),
  })

  return checks
}

export async function collectMigrationStatus(options?: {
  reconcile?: boolean
  migrationsDir?: string
}): Promise<MigrationStatusReport> {
  const shouldReconcile = options?.reconcile ?? false
  const migrationsDir = options?.migrationsDir || join(process.cwd(), 'drizzle')
  const entries = loadJournal(migrationsDir)
  const journalTagSet = new Set(entries.map((entry) => entry.tag))
  const orphans = findOrphanSqlFiles(migrationsDir, entries)
  const missingSqlForJournalTags = findMissingSqlForJournal(migrationsDir, entries)

  const retiredManifest = loadRetiredMigrationTags(migrationsDir)
  const retiredOrphanSqlFiles = orphans.filter((fileName) =>
    retiredManifest.retiredTags.has(sqlFileToTag(fileName))
  )
  const unexpectedOrphanSqlFiles = orphans.filter(
    (fileName) => !retiredManifest.retiredTags.has(sqlFileToTag(fileName))
  )

  const sqlClient = postgres(getDatabaseConfig().url)
  try {
    await ensureMigrationLedger(sqlClient)

    const existingRows = await sqlClient<{ id: number; hash: string; created_at: number | null }[]>`
      SELECT id, hash, created_at
      FROM drizzle.__drizzle_migrations
      ORDER BY created_at ASC, id ASC
    `
    const existingCreatedAt = new Set(
      existingRows
        .map((row) => row.created_at)
        .filter((value): value is number => typeof value === 'number')
    )
    const existingHashes = new Set(existingRows.map((row) => row.hash))

    let inserted = 0
    if (shouldReconcile) {
      for (const entry of entries) {
        if (existingCreatedAt.has(entry.when)) continue
        const hash = computeMigrationHash(migrationsDir, entry.tag)
        await sqlClient`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${hash}, ${entry.when})
        `
        existingCreatedAt.add(entry.when)
        existingHashes.add(hash)
        inserted += 1
      }
    }

    const latestRow = await sqlClient<{ id: number; hash: string; created_at: number | null }[]>`
      SELECT id, hash, created_at
      FROM drizzle.__drizzle_migrations
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `

    const requiredNotificationMigrations = collectRequiredMigrationStatus(
      REQUIRED_NOTIFICATION_MIGRATION_TAGS,
      journalTagSet,
      existingHashes,
      migrationsDir
    )
    const requiredPlatformMigrations = collectRequiredMigrationStatus(
      REQUIRED_PLATFORM_MIGRATION_TAGS,
      journalTagSet,
      existingHashes,
      migrationsDir
    )

    const notificationSchemaChecks = await collectNotificationSchemaChecks(sqlClient)
    const platformSchemaChecks = await collectPlatformSchemaChecks(sqlClient)

    return {
      reconciled: shouldReconcile,
      journalEntries: entries.length,
      appliedRows: existingRows.length + inserted,
      insertedRows: inserted,
      latestAppliedCreatedAt: latestRow[0]?.created_at ?? null,
      orphanSqlFiles: orphans,
      retiredOrphanSqlFiles,
      unexpectedOrphanSqlFiles,
      hasUnexpectedOrphanSqlFiles: unexpectedOrphanSqlFiles.length > 0,
      missingSqlForJournalTags,
      hasJournalReferenceGap: missingSqlForJournalTags.length > 0 || retiredManifest.staleRetiredTags.length > 0,
      staleRetiredTags: retiredManifest.staleRetiredTags,
      requiredNotificationMigrations,
      hasRequiredNotificationLedgerGap: requiredNotificationMigrations.some(
        (item) => !item.inJournal || !item.applied
      ),
      requiredPlatformMigrations,
      hasRequiredPlatformLedgerGap: requiredPlatformMigrations.some(
        (item) => !item.inJournal || !item.hash
      ),
      notificationSchemaChecks,
      notificationSchemaReady: notificationSchemaChecks.every((item) => item.exists),
      platformSchemaChecks,
      platformSchemaReady: platformSchemaChecks.every((item) => item.exists),
    }
  } finally {
    await sqlClient.end({ timeout: 5 })
  }
}

async function main() {
  const shouldReconcile = process.argv.includes('--reconcile')
  const strictMode = process.argv.includes('--strict')
  const report = await collectMigrationStatus({
    reconcile: shouldReconcile,
  })
  console.log(JSON.stringify(report, null, 2))

  if (
    strictMode && (
      report.hasRequiredNotificationLedgerGap ||
      report.hasRequiredPlatformLedgerGap ||
      report.hasUnexpectedOrphanSqlFiles ||
      report.hasJournalReferenceGap ||
      !report.notificationSchemaReady ||
      !report.platformSchemaReady
    )
  ) {
    process.exit(2)
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('[db:migration-status] Failed', error)
    process.exit(1)
  })
}
