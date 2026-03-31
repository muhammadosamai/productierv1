import { eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  assets,
  deliveries,
  initiatives,
  stories,
  tasks,
} from '../../db/schema'
import { getSearchConfig } from '../../config/search'
import { embeddingToVectorLiteral, generateEmbedding } from './searchEmbeddingProvider'
import { pageKeyForSearchType, routePathForDocumentType } from './searchRouting'
import type { SearchDocumentEntityType } from './searchTypes'

interface SearchDocumentInput {
  productId: string
  entityType: SearchDocumentEntityType
  entityId: string
  title: string
  subtitle?: string | null
  description?: string | null
  routePath?: string
  metadata?: Record<string, unknown> | null
  updatedAt?: string | null
}

interface ReindexOptions {
  productId?: string
  chunkSize?: number
}

function clipText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null
  const normalized = value.trim()
  if (!normalized) return null
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized
}

function compactText(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part || '').trim())
    .filter((part) => part.length > 0)
    .join('\n')
}

function toIsoTimestamp(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  return null
}

async function upsertSearchDocument(input: SearchDocumentInput): Promise<void> {
  const title = clipText(input.title, 300)
  if (!title) return

  const subtitle = clipText(input.subtitle, 240)
  const description = clipText(input.description, 2000)
  const searchableText = compactText([title, subtitle, description])
  const routePath = input.routePath || routePathForDocumentType(input.entityType, input.entityId)
  const metadataPayload = input.metadata ?? null
  const config = getSearchConfig()
  const embedding = config.semanticEnabled
    ? await generateEmbedding(searchableText, {
      timeoutMs: config.semanticTimeoutMs,
      useCache: false,
    })
    : null
  const embeddingLiteral = embedding ? embeddingToVectorLiteral(embedding) : null

  try {
    await db.execute(sql`
      INSERT INTO search_documents (
        product_id,
        entity_type,
        entity_id,
        page_key,
        title,
        subtitle,
        description,
        searchable_text,
        route_path,
        metadata,
        embedding,
        embedding_updated_at,
        updated_at
      ) VALUES (
        ${input.productId}::uuid,
        ${input.entityType},
        ${input.entityId}::uuid,
        ${pageKeyForSearchType(input.entityType)},
        ${title},
        ${subtitle},
        ${description},
        ${searchableText},
        ${routePath},
        ${metadataPayload ? sql`${JSON.stringify(metadataPayload)}::jsonb` : sql`null::jsonb`},
        ${embeddingLiteral ? sql`${embeddingLiteral}::vector` : sql`null::vector`},
        ${embeddingLiteral ? sql`now()` : sql`null::timestamptz`},
        ${input.updatedAt ? sql`${input.updatedAt}::timestamptz` : sql`now()`}
      )
      ON CONFLICT (entity_type, entity_id)
      DO UPDATE SET
        product_id = EXCLUDED.product_id,
        page_key = EXCLUDED.page_key,
        title = EXCLUDED.title,
        subtitle = EXCLUDED.subtitle,
        description = EXCLUDED.description,
        searchable_text = EXCLUDED.searchable_text,
        route_path = EXCLUDED.route_path,
        metadata = EXCLUDED.metadata,
        embedding = COALESCE(EXCLUDED.embedding, search_documents.embedding),
        embedding_updated_at = CASE
          WHEN EXCLUDED.embedding IS NULL THEN search_documents.embedding_updated_at
          ELSE EXCLUDED.embedding_updated_at
        END,
        updated_at = EXCLUDED.updated_at
    `)
  } catch (error) {
    console.warn('[search-index] Failed to upsert search document', {
      entityType: input.entityType,
      entityId: input.entityId,
      error: (error as Error).message,
    })
  }
}

export async function removeSearchDocument(
  entityType: SearchDocumentEntityType,
  entityId: string,
): Promise<void> {
  try {
    await db.execute(sql`
      DELETE FROM search_documents
      WHERE entity_type = ${entityType}
        AND entity_id = ${entityId}::uuid
    `)
  } catch (error) {
    console.warn('[search-index] Failed to remove search document', {
      entityType,
      entityId,
      error: (error as Error).message,
    })
  }
}

export async function upsertTaskSearchDocument(taskId: string): Promise<void> {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    with: {
      story: { columns: { id: true, title: true } },
      delivery: { columns: { id: true, title: true } },
    },
  })

  if (!task) {
    await removeSearchDocument('task', taskId)
    return
  }

  await upsertSearchDocument({
    productId: task.productId,
    entityType: 'task',
    entityId: task.id,
    title: task.title,
    subtitle: compactText([
      `Status: ${task.status}`,
      task.story?.title ? `Story: ${task.story.title}` : null,
      task.delivery?.title ? `Delivery: ${task.delivery.title}` : null,
    ]) || null,
    description: task.description || task.blockedReason || null,
    metadata: {
      status: task.status,
      priority: task.priority,
      storyId: task.storyId,
      deliveryId: task.deliveryId,
      ownerUserId: task.ownerUserId,
      ownerTeamId: task.ownerTeamId,
      createdByUserId: task.createdByUserId,
      assigneeUserIds: task.assigneeUserIds || [],
      assigneeTeamIds: task.assigneeTeamIds || [],
      reviewerUserIds: task.reviewerUserIds || [],
      reviewerTeamIds: task.reviewerTeamIds || [],
    },
    updatedAt: toIsoTimestamp(task.updatedAt),
  })
}

export async function upsertStorySearchDocument(storyId: string): Promise<void> {
  const story = await db.query.stories.findFirst({
    where: eq(stories.id, storyId),
    with: {
      ownerUser: { columns: { id: true, name: true } },
    },
  })

  if (!story) {
    await removeSearchDocument('story', storyId)
    return
  }

  await upsertSearchDocument({
    productId: story.productId,
    entityType: 'story',
    entityId: story.id,
    title: story.title,
    subtitle: compactText([
      `Status: ${story.status}`,
      `Priority: ${story.priority}`,
      story.ownerUser?.name ? `Owner: ${story.ownerUser.name}` : null,
    ]) || null,
    description: story.description || story.acceptanceCriteria || null,
    metadata: {
      status: story.status,
      priority: story.priority,
      type: story.type,
      ownerUserId: story.ownerUserId,
    },
    updatedAt: toIsoTimestamp(story.updatedAt),
  })
}

export async function upsertInitiativeSearchDocument(initiativeId: string): Promise<void> {
  const initiative = await db.query.initiatives.findFirst({
    where: eq(initiatives.id, initiativeId),
    with: {
      leaderUser: { columns: { id: true, name: true } },
    },
  })

  if (!initiative) {
    await removeSearchDocument('initiative', initiativeId)
    return
  }

  await upsertSearchDocument({
    productId: initiative.productId,
    entityType: 'initiative',
    entityId: initiative.id,
    title: initiative.title,
    subtitle: compactText([
      `Status: ${initiative.status}`,
      `Priority: ${initiative.priority}`,
      initiative.leaderUser?.name ? `Leader: ${initiative.leaderUser.name}` : null,
    ]) || null,
    description: initiative.description,
    metadata: {
      status: initiative.status,
      priority: initiative.priority,
      leaderUserId: initiative.leaderUserId,
    },
    updatedAt: toIsoTimestamp(initiative.updatedAt),
  })
}

export async function upsertDeliverySearchDocument(deliveryId: string): Promise<void> {
  const delivery = await db.query.deliveries.findFirst({
    where: eq(deliveries.id, deliveryId),
    with: {
      createdByUser: { columns: { id: true, name: true } },
    },
  })

  if (!delivery) {
    await removeSearchDocument('delivery', deliveryId)
    return
  }

  await upsertSearchDocument({
    productId: delivery.productId,
    entityType: 'delivery',
    entityId: delivery.id,
    title: delivery.title,
    subtitle: compactText([
      `Status: ${delivery.status}`,
      delivery.createdByUser?.name ? `Owner: ${delivery.createdByUser.name}` : null,
    ]) || null,
    description: delivery.description,
    metadata: {
      status: delivery.status,
      startDate: delivery.startDate,
      endDate: delivery.endDate,
      createdByUserId: delivery.createdByUserId,
    },
    updatedAt: toIsoTimestamp(delivery.updatedAt),
  })
}

export async function upsertWikiAssetSearchDocument(assetId: string): Promise<void> {
  const asset = await db.query.assets.findFirst({
    where: eq(assets.id, assetId),
    with: {
      assetType: { columns: { id: true, name: true, category: true } },
    },
  })

  if (!asset) {
    await removeSearchDocument('wiki_asset', assetId)
    return
  }

  await upsertSearchDocument({
    productId: asset.productId,
    entityType: 'wiki_asset',
    entityId: asset.id,
    title: asset.title,
    subtitle: compactText([
      asset.assetType?.name ? `Type: ${asset.assetType.name}` : null,
      `Status: ${asset.status}`,
    ]) || null,
    description: compactText([
      asset.description,
      asset.content ? clipText(asset.content, 1800) : null,
      asset.tags?.length ? `Tags: ${asset.tags.join(', ')}` : null,
    ]) || null,
    metadata: {
      status: asset.status,
      visibility: asset.visibility,
      assetTypeId: asset.assetTypeId,
      category: asset.assetType?.category || null,
    },
    updatedAt: toIsoTimestamp(asset.updatedAt),
  })
}

async function upsertChunk(ids: string[], worker: (id: string) => Promise<void>) {
  for (const id of ids) {
    await worker(id)
  }
}

function chunk<T>(values: T[], size: number): T[][] {
  const output: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size))
  }
  return output
}

export async function reindexSearchDocuments(options: ReindexOptions = {}) {
  const chunkSize = Math.max(1, options.chunkSize ?? 100)

  const [taskRows, storyRows, initiativeRows, deliveryRows, wikiRows] = await Promise.all([
    db.query.tasks.findMany({
      columns: { id: true },
      where: options.productId ? eq(tasks.productId, options.productId) : undefined,
    }),
    db.query.stories.findMany({
      columns: { id: true },
      where: options.productId ? eq(stories.productId, options.productId) : undefined,
    }),
    db.query.initiatives.findMany({
      columns: { id: true },
      where: options.productId ? eq(initiatives.productId, options.productId) : undefined,
    }),
    db.query.deliveries.findMany({
      columns: { id: true },
      where: options.productId ? eq(deliveries.productId, options.productId) : undefined,
    }),
    db.query.assets.findMany({
      columns: { id: true },
      where: options.productId ? eq(assets.productId, options.productId) : undefined,
    }),
  ])

  const totals = {
    tasks: taskRows.length,
    stories: storyRows.length,
    initiatives: initiativeRows.length,
    deliveries: deliveryRows.length,
    wikiAssets: wikiRows.length,
  }

  for (const batch of chunk(taskRows.map((row) => row.id), chunkSize)) {
    await upsertChunk(batch, upsertTaskSearchDocument)
  }
  for (const batch of chunk(storyRows.map((row) => row.id), chunkSize)) {
    await upsertChunk(batch, upsertStorySearchDocument)
  }
  for (const batch of chunk(initiativeRows.map((row) => row.id), chunkSize)) {
    await upsertChunk(batch, upsertInitiativeSearchDocument)
  }
  for (const batch of chunk(deliveryRows.map((row) => row.id), chunkSize)) {
    await upsertChunk(batch, upsertDeliverySearchDocument)
  }
  for (const batch of chunk(wikiRows.map((row) => row.id), chunkSize)) {
    await upsertChunk(batch, upsertWikiAssetSearchDocument)
  }

  if (options.productId) {
    // Cleanup stale docs for product if entity was deleted between id scan and upsert.
    await db.execute(sql`
      DELETE FROM search_documents sd
      WHERE sd.product_id = ${options.productId}::uuid
        AND NOT EXISTS (
          SELECT 1
          FROM tasks t
          WHERE sd.entity_type = 'task'
            AND t.id = sd.entity_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM backlog_items s
          WHERE sd.entity_type = 'story'
            AND s.id = sd.entity_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM initiatives i
          WHERE sd.entity_type = 'initiative'
            AND i.id = sd.entity_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM deliveries d
          WHERE sd.entity_type = 'delivery'
            AND d.id = sd.entity_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM assets a
          WHERE sd.entity_type = 'wiki_asset'
            AND a.id = sd.entity_id
        )
    `)
  }

  return totals
}
