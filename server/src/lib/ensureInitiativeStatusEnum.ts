import { db } from '../db'
import { sql } from 'drizzle-orm'

/**
 * Deployments that never ran Drizzle migration `0008_initiative_status_archived` still have
 * the old PG enum without `archived`, which breaks archive in the UI.
 */
let initiativeStatusEnumBootstrapped = false

function firstRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result
  const rows = (result as { rows?: unknown[] })?.rows
  return Array.isArray(rows) ? rows : []
}

export async function ensureInitiativeStatusArchivedEnum() {
  if (initiativeStatusEnumBootstrapped) return

  const check = await db.execute(sql`
    SELECT 1 AS ok
    FROM pg_catalog.pg_enum e
    INNER JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'initiative_status'
      AND e.enumlabel = 'archived'
    LIMIT 1
  `)

  if (firstRows(check).length === 0) {
    await db.execute(sql`ALTER TYPE public.initiative_status ADD VALUE 'archived'`)
  }

  initiativeStatusEnumBootstrapped = true
}
