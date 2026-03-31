import { sql } from 'drizzle-orm'
import { db } from './index'

interface IntegritySnapshot {
  initiativeStatuses: string[]
  legacyDeliveryRows: Array<{ status: string; count: number }>
  orphanStories: number
  orphanStoryOwners: number
  orphanInitiativeLeaders: number
  orphanProductMembers: number
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') return Number.parseInt(value, 10)
  return Number.NaN
}

async function main() {
  const statusRows = await db.execute(sql`
    select enumlabel
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'initiative_status'
    order by enumsortorder
  `)
  const legacyDeliveryRows = await db.execute(sql`
    select status::text as status, count(*)::int as count
    from deliveries
    group by status
    having status::text in ('active', 'pending')
  `)
  const [orphanStoriesRow] = await db.execute(sql`
    select count(*)::int as count
    from backlog_items s
    left join products p on p.id = s.product
    where p.id is null
  `)
  const [orphanStoryOwnersRow] = await db.execute(sql`
    select count(*)::int as count
    from backlog_items s
    left join users u on u.id = s.owner_user_id
    where s.owner_user_id is not null and u.id is null
  `)
  const [orphanInitiativeLeadersRow] = await db.execute(sql`
    select count(*)::int as count
    from initiatives i
    left join users u on u.id = i.leader_user_id
    where i.leader_user_id is not null and u.id is null
  `)
  const [orphanProductMembersRow] = await db.execute(sql`
    select count(*)::int as count
    from product_members pm
    left join products p on p.id = pm.product
    where p.id is null
  `)

  const snapshot: IntegritySnapshot = {
    initiativeStatuses: statusRows.map((row: any) => String(row.enumlabel)),
    legacyDeliveryRows: legacyDeliveryRows.map((row: any) => ({
      status: String(row.status),
      count: toNumber(row.count),
    })),
    orphanStories: toNumber((orphanStoriesRow as any)?.count),
    orphanStoryOwners: toNumber((orphanStoryOwnersRow as any)?.count),
    orphanInitiativeLeaders: toNumber((orphanInitiativeLeadersRow as any)?.count),
    orphanProductMembers: toNumber((orphanProductMembersRow as any)?.count),
  }

  const ok = snapshot.initiativeStatuses.includes('archived')
    && snapshot.legacyDeliveryRows.length === 0
    && snapshot.orphanStories === 0
    && snapshot.orphanStoryOwners === 0
    && snapshot.orphanInitiativeLeaders === 0
    && snapshot.orphanProductMembers === 0

  console.log(JSON.stringify({ ok, snapshot }, null, 2))
  process.exit(ok ? 0 : 1)
}

main().catch((error) => {
  console.error('Post-cutover integrity check failed:', error)
  process.exit(1)
})
