import postgres from 'postgres'
import { collectMigrationStatus } from '../../src/db/migration-status'

const configuredUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL

if (!configuredUrl) {
  throw new Error(
    'Integration tests require TEST_DATABASE_URL (or DATABASE_URL) to be set.'
  )
}

// Safety rail: avoid truncating non-test databases by accident.
if (!/test/i.test(configuredUrl)) {
  throw new Error(
    'Refusing to run integration tests against a non-test database. ' +
      'Use a database name that contains "test".'
  )
}

process.env.TEST_DATABASE_URL = configuredUrl
process.env.DATABASE_URL = configuredUrl
process.env.NODE_ENV = 'test'

const parsedTestUrl = new URL(configuredUrl)
const testDatabaseName = decodeURIComponent(parsedTestUrl.pathname.replace(/^\//, ''))

if (!testDatabaseName) {
  throw new Error('TEST_DATABASE_URL must include a database name in the URL path.')
}

function getAdminDatabaseUrl() {
  if (process.env.TEST_DATABASE_ADMIN_URL) {
    return process.env.TEST_DATABASE_ADMIN_URL
  }

  const adminUrl = new URL(configuredUrl)
  adminUrl.pathname = `/${process.env.TEST_DATABASE_ADMIN_DB || 'postgres'}`
  return adminUrl.toString()
}

async function ensureTestDatabaseExists() {
  const adminSql = postgres(getAdminDatabaseUrl(), { max: 1 })

  try {
    const [row] = await adminSql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_database
        WHERE datname = ${testDatabaseName}
      ) AS "exists"
    `

    if (!row?.exists) {
      const escapedDbName = testDatabaseName.replace(/"/g, '""')
      await adminSql.unsafe(`CREATE DATABASE "${escapedDbName}"`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to ensure test database "${testDatabaseName}" exists. ` +
        'Set TEST_DATABASE_URL to an existing test DB, or provide TEST_DATABASE_ADMIN_URL ' +
        'with credentials that can create databases. ' +
        `Original error: ${message}`,
      { cause: error }
    )
  } finally {
    await adminSql.end({ timeout: 5 })
  }
}

await ensureTestDatabaseExists()

const sql = postgres(configuredUrl, { max: 1 })
let migrationIntegrityChecked = false

async function ensureMigrationIntegrity() {
  if (migrationIntegrityChecked) return

  const report = await collectMigrationStatus()
  const failures: string[] = []

  if (report.hasJournalReferenceGap) {
    failures.push('journal has missing SQL references or stale retired tags')
  }
  if (report.hasUnexpectedOrphanSqlFiles) {
    failures.push('journal has unexpected orphan SQL migrations')
  }
  if (report.hasRequiredPlatformLedgerGap) {
    failures.push('required platform migrations are missing from ledger')
  }
  if (report.hasRequiredNotificationLedgerGap) {
    failures.push('required notification migrations are missing from ledger')
  }
  if (!report.platformSchemaReady) {
    failures.push('platform schema checks failed')
  }
  if (!report.notificationSchemaReady) {
    failures.push('notification schema checks failed')
  }

  if (failures.length > 0) {
    throw new Error(
      'Integration test bootstrap failed migration integrity checks: ' +
      `${failures.join('; ')}. ` +
      'Run "bun run db:migrate" and "bun run db:migration:status:strict" before running tests.'
    )
  }

  migrationIntegrityChecked = true
}

export async function resetDatabase() {
  await ensureMigrationIntegrity()

  const tables = await sql<{ schemaname: string; tablename: string }[]>`
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  `

  if (tables.length === 0) return

  const tableList = tables
    .map((table) => `"${table.schemaname}"."${table.tablename}"`)
    .join(', ')

  await sql.unsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`)
}

export async function closeDatabase() {
  await sql.end({ timeout: 5 })
}
