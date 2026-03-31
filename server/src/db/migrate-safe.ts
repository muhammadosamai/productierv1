import { spawn } from 'node:child_process'
import { URL } from 'node:url'
import postgres from 'postgres'
import { getDatabaseConfig } from '../config/database'
import { collectMigrationStatus } from './migration-status'

const SAFE_BACKUP_CONFIRM_ENV = 'SAFE_MIGRATION_BACKUP_CONFIRMED'

function logStep(message: string) {
  console.log(`[db:migrate:safe] ${message}`)
}

function fail(message: string): never {
  console.error(`[db:migrate:safe] ${message}`)
  process.exit(1)
}

function parseDatabaseHost(databaseUrl: string): string | null {
  try {
    const parsed = new URL(databaseUrl)
    return parsed.hostname || null
  } catch {
    return null
  }
}

function isLocalDatabaseHost(host: string | null): boolean {
  if (!host) return false
  const normalized = host.trim().toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function shouldRequireBackupConfirmation(databaseUrl: string): boolean {
  return !isLocalDatabaseHost(parseDatabaseHost(databaseUrl))
}

async function runScript(stepName: string, scriptName: string) {
  logStep(`Running ${stepName} (${scriptName})...`)
  await new Promise<void>((resolve, reject) => {
    const child = spawn('bun', ['run', scriptName], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.once('error', (error) => {
      reject(error)
    })
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${scriptName} exited with code ${code ?? 'unknown'}`))
    })
  })
}

async function shouldRunCutoverPreflight(databaseUrl: string): Promise<boolean> {
  const sqlClient = postgres(databaseUrl)
  try {
    const backlogOwnerRows = await sqlClient<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'backlog_items'
          AND column_name = 'owner'
      ) AS exists
    `

    const initiativeLeaderRows = await sqlClient<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'initiatives'
          AND column_name = 'leader'
      ) AS exists
    `

    return Boolean(backlogOwnerRows[0]?.exists) || Boolean(initiativeLeaderRows[0]?.exists)
  } finally {
    await sqlClient.end({ timeout: 5 })
  }
}

async function runSafeMigration() {
  const databaseUrl = getDatabaseConfig().url
  const databaseHost = parseDatabaseHost(databaseUrl)
  const isRemote = shouldRequireBackupConfirmation(databaseUrl)
  const backupConfirmed = String(process.env[SAFE_BACKUP_CONFIRM_ENV] || '').toLowerCase() === 'true'

  logStep(`Target database host: ${databaseHost || 'unknown'}`)
  if (isRemote && !backupConfirmed) {
    fail(
      `Refusing to run against non-local DATABASE_URL without explicit backup confirmation. ` +
      `Create a fresh snapshot/backup, then rerun with ${SAFE_BACKUP_CONFIRM_ENV}=true.`
    )
  }

  logStep('Running migration metadata precheck...')
  const precheckStatus = await collectMigrationStatus()
  if (precheckStatus.hasJournalReferenceGap || precheckStatus.hasUnexpectedOrphanSqlFiles) {
    fail(
      'Migration metadata precheck failed. Resolve journal/orphan migration file issues before applying migrations.'
    )
  }

  logStep('Migration metadata precheck passed.')

  if (await shouldRunCutoverPreflight(databaseUrl)) {
    await runScript('legacy cutover preflight', 'db:preflight:cutover')
  } else {
    logStep('Legacy cutover preflight skipped (legacy cutover columns not present).')
  }

  await runScript('schema migration apply', 'db:migrate')
  await runScript('strict migration verification', 'db:migration:status:strict')
  await runScript('post-cutover integrity verification', 'db:integrity:post-cutover')

  logStep('Safe migration completed successfully.')
}

runSafeMigration().catch((error) => {
  console.error('[db:migrate:safe] Failed to complete safe migration flow.', error)
  process.exit(1)
})
