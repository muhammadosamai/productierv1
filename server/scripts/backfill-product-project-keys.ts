/**
 * One-time / maintenance: set products.project_key for any row where it is NULL.
 *
 * Run from server/: `DATABASE_URL=... bun scripts/backfill-product-project-keys.ts`
 * Or: `bun run db:backfill-project-keys` (see server/package.json)
 *
 * Safe with existing data: does not change child tables (still keyed by product name until Phase 2).
 */
import { isNull } from 'drizzle-orm'
import { db } from '../src/db/index'
import { products } from '../src/db/schema'
import { ensureProjectKey } from '../src/lib/publicIds'

async function main() {
  const rows = await db.query.products.findMany({
    where: isNull(products.projectKey),
    columns: { id: true, name: true, projectKey: true },
  })

  if (rows.length === 0) {
    console.log('No products with null project_key. Nothing to do.')
    return
  }

  console.log(`Backfilling project_key for ${rows.length} product(s)...`)

  for (const row of rows) {
    const key = await ensureProjectKey(row.id, row.name)
    console.log(`  ${row.name} -> ${key}`)
  }

  const stillNull = await db.query.products.findMany({
    where: isNull(products.projectKey),
    columns: { id: true, name: true },
  })
  if (stillNull.length > 0) {
    console.error('Still have null project_key:', stillNull)
    process.exit(1)
  }

  console.log('Done.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
