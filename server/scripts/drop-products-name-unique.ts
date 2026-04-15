/**
 * Drops the legacy UNIQUE constraint on products.name so multiple products can share a display name.
 * Idempotent. Same effect as drizzle migration 0017_drop_products_name_unique.sql.
 *
 * Use when `bun run db:migrate` has not reached migration 0017 yet (e.g. blocked on 0015 until backfill).
 *
 * From server/: `DATABASE_URL=... bun run db:drop-products-name-unique`
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/index'

async function main() {
  await db.execute(
    sql`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_name_unique`,
  )
  console.log(
    'OK: dropped constraint products_name_unique if it existed. Duplicate product display names are now allowed (project_key stays unique).',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
