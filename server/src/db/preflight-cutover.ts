import { db } from '.'
import {
  activities,
  assetTypes,
  assets,
  consumerFeedbacks,
  deliveries,
  favorites,
  featureRequests,
  initiatives,
  productMembers,
  products,
  releases,
  servers,
  stories,
  taskStatusHistory,
  tasks,
  testCycles,
  users,
} from './schema'
import { sql } from 'drizzle-orm'

interface NameReferenceIssue {
  entity: 'stories.owner' | 'initiatives.leader'
  recordId: string
  referencedName: string
  problem: 'unmatched_user_name' | 'ambiguous_user_name'
  candidateUserIds: string[]
}

interface ProductReferenceIssue {
  source: string
  distinctValues: string[]
  unmatchedValues: string[]
}

interface CutoverPreflightReport {
  ok: boolean
  generatedAt: string
  summary: {
    productsInCatalog: number
    nameReferenceIssues: number
    productReferenceSourcesWithIssues: number
    totalUnmatchedProductValues: number
  }
  nameReferenceIssues: NameReferenceIssue[]
  productReferenceIssues: ProductReferenceIssue[]
}

function normalizeText(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  return trimmed.length > 0 ? trimmed : null
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

async function collectProductReferenceIssue(
  source: string,
  rowsPromise: Promise<Array<{ value: string | null }>>,
  productNameSet: Set<string>,
): Promise<ProductReferenceIssue> {
  const rows = await rowsPromise
  const values = uniqueSorted(
    rows
      .map((r) => normalizeText(r.value))
      .filter((v): v is string => !!v),
  )

  const unmatchedValues = values.filter((value) => !productNameSet.has(value))
  return { source, distinctValues: values, unmatchedValues }
}

async function runCutoverPreflight(): Promise<void> {
  console.log('Running data consistency cutover preflight...')

  const [allUsers, productRows, storyOwnerRowsRaw, initiativeLeaderRowsRaw] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users),
    db.select({ id: products.id, name: products.name }).from(products),
    db.execute(sql`select id::text as id, owner as value from backlog_items`),
    db.execute(sql`select id::text as id, leader as value from initiatives`),
  ])
  const storyOwnerRows = storyOwnerRowsRaw as unknown as Array<{ id: string; value: string | null }>
  const initiativeLeaderRows = initiativeLeaderRowsRaw as unknown as Array<{ id: string; value: string | null }>

  const usersByName = new Map<string, string[]>()
  for (const user of allUsers) {
    const normalizedName = normalizeText(user.name)
    if (!normalizedName) continue
    const current = usersByName.get(normalizedName) || []
    current.push(user.id)
    usersByName.set(normalizedName, current)
  }

  const productNameSet = new Set(
    productRows
      .flatMap((p) => [normalizeText(p.id), normalizeText(p.name)])
      .filter((name): name is string => !!name),
  )

  const nameReferenceIssues: NameReferenceIssue[] = []

  for (const row of storyOwnerRows) {
    const owner = normalizeText(row.value)
    if (!owner) continue
    const candidates = usersByName.get(owner) || []
    if (candidates.length === 0) {
      nameReferenceIssues.push({
        entity: 'stories.owner',
        recordId: row.id,
        referencedName: owner,
        problem: 'unmatched_user_name',
        candidateUserIds: [],
      })
      continue
    }
    if (candidates.length > 1) {
      nameReferenceIssues.push({
        entity: 'stories.owner',
        recordId: row.id,
        referencedName: owner,
        problem: 'ambiguous_user_name',
        candidateUserIds: uniqueSorted(candidates),
      })
    }
  }

  for (const row of initiativeLeaderRows) {
    const leader = normalizeText(row.value)
    if (!leader) continue
    const candidates = usersByName.get(leader) || []
    if (candidates.length === 0) {
      nameReferenceIssues.push({
        entity: 'initiatives.leader',
        recordId: row.id,
        referencedName: leader,
        problem: 'unmatched_user_name',
        candidateUserIds: [],
      })
      continue
    }
    if (candidates.length > 1) {
      nameReferenceIssues.push({
        entity: 'initiatives.leader',
        recordId: row.id,
        referencedName: leader,
        problem: 'ambiguous_user_name',
        candidateUserIds: uniqueSorted(candidates),
      })
    }
  }

  const productReferenceIssues = await Promise.all([
    collectProductReferenceIssue('stories.product', db.select({ value: stories.productId }).from(stories), productNameSet),
    collectProductReferenceIssue('initiatives.product', db.select({ value: initiatives.productId }).from(initiatives), productNameSet),
    collectProductReferenceIssue('activities.product', db.select({ value: activities.productId }).from(activities), productNameSet),
    collectProductReferenceIssue('product_members.product', db.select({ value: productMembers.productId }).from(productMembers), productNameSet),
    collectProductReferenceIssue('tasks.product_id', db.select({ value: tasks.productId }).from(tasks), productNameSet),
    collectProductReferenceIssue('deliveries.product_id', db.select({ value: deliveries.productId }).from(deliveries), productNameSet),
    collectProductReferenceIssue('releases.product_id', db.select({ value: releases.productId }).from(releases), productNameSet),
    collectProductReferenceIssue('servers.product_id', db.select({ value: servers.productId }).from(servers), productNameSet),
    collectProductReferenceIssue('task_status_history.product_id', db.select({ value: taskStatusHistory.productId }).from(taskStatusHistory), productNameSet),
    collectProductReferenceIssue('favorites.product_id', db.select({ value: favorites.productId }).from(favorites), productNameSet),
    collectProductReferenceIssue('test_cycles.product_id', db.select({ value: testCycles.productId }).from(testCycles), productNameSet),
    collectProductReferenceIssue('asset_types.product_id', db.select({ value: assetTypes.productId }).from(assetTypes), productNameSet),
    collectProductReferenceIssue('assets.product_id', db.select({ value: assets.productId }).from(assets), productNameSet),
    collectProductReferenceIssue('feature_requests.product_id', db.select({ value: featureRequests.productId }).from(featureRequests), productNameSet),
    collectProductReferenceIssue('consumer_feedbacks.product_id', db.select({ value: consumerFeedbacks.productId }).from(consumerFeedbacks), productNameSet),
  ])

  const productSourcesWithIssues = productReferenceIssues.filter((source) => source.unmatchedValues.length > 0)
  const totalUnmatchedProductValues = productSourcesWithIssues
    .reduce((sum, source) => sum + source.unmatchedValues.length, 0)

  const report: CutoverPreflightReport = {
    ok: nameReferenceIssues.length === 0 && productSourcesWithIssues.length === 0,
    generatedAt: new Date().toISOString(),
    summary: {
      productsInCatalog: productRows.length,
      nameReferenceIssues: nameReferenceIssues.length,
      productReferenceSourcesWithIssues: productSourcesWithIssues.length,
      totalUnmatchedProductValues,
    },
    nameReferenceIssues: nameReferenceIssues
      .sort((a, b) =>
        a.entity.localeCompare(b.entity) ||
        a.referencedName.localeCompare(b.referencedName) ||
        a.recordId.localeCompare(b.recordId),
      ),
    productReferenceIssues: productReferenceIssues
      .sort((a, b) => a.source.localeCompare(b.source)),
  }

  const reportJson = JSON.stringify(report, null, 2)
  console.log(reportJson)

  if (!report.ok) {
    console.error('Cutover preflight failed. Resolve reported data issues before running migrations.')
    process.exit(1)
  }

  console.log('Cutover preflight passed.')
  process.exit(0)
}

runCutoverPreflight().catch((error) => {
  console.error('Cutover preflight crashed:', error)
  process.exit(1)
})
