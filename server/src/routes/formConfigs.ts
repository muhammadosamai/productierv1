import { Elysia, t } from 'elysia'
import { db } from '../db'
import { formConfigs, customFieldValues, users, issues, productMembers } from '../db/schema'
import { eq, and, count } from 'drizzle-orm'
import {
  resolveProductByScope,
  whereDenormProductMatches,
  denormalizedProductScopeValue,
} from '../lib/resolveProductScope'
import { jwt } from '@elysiajs/jwt'
import { getDefaultConfig } from '../lib/builtInFields'
import {
  mergeIssueFormConfig,
  getIssueStatusCatalogFromMerged,
  normalizeIssueStatusOptionsList,
  normalizeIssueStatusToCanonicalId,
  resolveIssueStatusDisplayLabel,
  type IssueFormFieldConfig,
} from '../lib/issueFormConfig'
import { ensureFormConfigsSchema } from '../lib/ensureFormConfigsSchema'

const JWT_SECRET = process.env.JWT_SECRET || 'productier-secret-key-change-in-production'

async function getUserFromHeader(jwtVerify: any, headers: Record<string, string | undefined>) {
  const authHeader = headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const payload = await jwtVerify(token)
  if (!payload?.userId) return null
  const user = await db.query.users.findFirst({ where: eq(users.id, payload.userId as string) })
  return user || null
}

async function isProductAdmin(userId: string, productRef: string): Promise<boolean> {
  const scopeRow = await resolveProductByScope(productRef)
  if (!scopeRow) return false
  const member = await db.query.productMembers.findFirst({
    where: and(whereDenormProductMatches(productMembers.product, scopeRow), eq(productMembers.userId, userId)),
  })
  return member?.role === 'admin'
}

/** Global staff roles or product member admin for this product. */
async function canModifyFormConfig(user: { id: string; role: string }, product: string): Promise<boolean> {
  if (['super_admin', 'admin', 'product_admin'].includes(user.role)) return true
  return isProductAdmin(user.id, product)
}

export const formConfigRoutes = new Elysia({ prefix: '/api/form-configs' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))
  .onBeforeHandle(async () => {
    await ensureFormConfigsSchema()
  })

  // GET /api/form-configs/:product/:entityType
  .get('/:product/:entityType', async ({ params: { product, entityType }, set }) => {
    const scopeRow = await resolveProductByScope(product)
    if (!scopeRow) {
      set.status = 404
      return { error: 'Product not found' }
    }

    const existing = await db.query.formConfigs.findFirst({
      where: and(
        whereDenormProductMatches(formConfigs.product, scopeRow),
        eq(formConfigs.entityType, entityType),
      ),
    })

    if (existing) {
      if (entityType === 'issue') {
        return mergeIssueFormConfig(existing.config as { fields?: { key: string }[] })
      }
      return existing.config
    }

    // Return default config
    const defaults = getDefaultConfig(entityType)
    if (entityType === 'issue') return mergeIssueFormConfig(defaults)
    return defaults
  })

  // PUT /api/form-configs/:product/:entityType
  .put('/:product/:entityType', async ({ params: { product, entityType }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const scopeRow = await resolveProductByScope(product)
    if (!scopeRow) {
      set.status = 404
      return { error: 'Product not found' }
    }
    const formProductScope = denormalizedProductScopeValue(scopeRow)

    if (!(await canModifyFormConfig(user, product))) {
      set.status = 403
      return { error: 'Only product admins or staff can modify form configurations' }
    }

    // Upsert
    const existing = await db.query.formConfigs.findFirst({
      where: and(
        whereDenormProductMatches(formConfigs.product, scopeRow),
        eq(formConfigs.entityType, entityType),
      ),
    })

    let configToSave = body.config as { fields?: { key: string; options?: string[] }[] }

    if (entityType === 'issue') {
      const prevMerged = mergeIssueFormConfig(existing?.config as { fields?: { key: string }[] } | undefined)
      const incoming = JSON.parse(JSON.stringify(body.config)) as { fields?: Array<{ key: string; options?: string[] } & Record<string, unknown>> }
      if (!incoming?.fields?.length) {
        set.status = 400
        return { error: 'Invalid config: fields required' }
      }
      const statusField = incoming.fields.find(f => f.key === 'status')
      if (statusField?.options?.length && !Array.isArray((statusField as any).issueStatusCatalog)) {
        statusField.options = normalizeIssueStatusOptionsList(statusField.options.map(String))
      }
      configToSave = mergeIssueFormConfig(incoming)
      const nextMerged = configToSave as { fields: IssueFormFieldConfig[] }

      const prevIds = getIssueStatusCatalogFromMerged(prevMerged).map(e => e.id)
      const nextIdSet = new Set(getIssueStatusCatalogFromMerged(nextMerged).map(e => e.id))
      const removedIds = prevIds.filter(id => !nextIdSet.has(id))
      if (removedIds.length > 0) {
        const rows = await db
          .select({
            status: issues.status,
            cnt: count(),
          })
          .from(issues)
          .where(and(whereDenormProductMatches(issues.product, scopeRow), eq(issues.archived, false)))
          .groupBy(issues.status)
        for (const row of rows) {
          const canon = normalizeIssueStatusToCanonicalId(prevMerged, row.status) ?? row.status
          if (removedIds.includes(canon) && Number(row.cnt) > 0) {
            set.status = 400
            const label = resolveIssueStatusDisplayLabel(prevMerged, row.status)
            return {
              error: `Cannot remove status "${label}" (${canon}): ${row.cnt} issue(s) still use it. Move them to another status first.`,
            }
          }
        }
      }
    }

    if (existing) {
      const [updated] = await db.update(formConfigs)
        .set({ config: configToSave, updatedByUserId: user.id })
        .where(eq(formConfigs.id, existing.id))
        .returning()
      return entityType === 'issue'
        ? mergeIssueFormConfig(updated!.config as { fields?: { key: string }[] })
        : updated!.config
    }

    const [created] = await db.insert(formConfigs).values({
      product: formProductScope,
      entityType,
      config: configToSave,
      updatedByUserId: user.id,
    }).returning()

    return entityType === 'issue'
      ? mergeIssueFormConfig(created!.config as { fields?: { key: string }[] })
      : created!.config
  }, {
    body: t.Object({
      config: t.Any(),
    }),
  })

// Custom field values routes
export const customFieldRoutes = new Elysia({ prefix: '/api/custom-fields' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))
  .onBeforeHandle(async () => {
    await ensureFormConfigsSchema()
  })

  // GET /api/custom-fields/:entityType/:entityId
  .get('/:entityType/:entityId', async ({ params: { entityType, entityId } }) => {
    const rows = await db.select().from(customFieldValues)
      .where(and(
        eq(customFieldValues.entityType, entityType),
        eq(customFieldValues.entityId, entityId),
      ))

    const values: Record<string, any> = {}
    for (const row of rows) {
      values[row.fieldKey] = row.value
    }
    return values
  })

  // PUT /api/custom-fields/:entityType/:entityId
  .put('/:entityType/:entityId', async ({ params: { entityType, entityId }, body, set, jwt: jwtInstance, headers }) => {
    const user = await getUserFromHeader(jwtInstance.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const values = body.values as Record<string, any>

    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === undefined) {
        // Delete
        await db.delete(customFieldValues)
          .where(and(
            eq(customFieldValues.entityType, entityType),
            eq(customFieldValues.entityId, entityId),
            eq(customFieldValues.fieldKey, key),
          ))
      } else {
        // Upsert
        const existing = await db.query.customFieldValues.findFirst({
          where: and(
            eq(customFieldValues.entityType, entityType),
            eq(customFieldValues.entityId, entityId),
            eq(customFieldValues.fieldKey, key),
          ),
        })

        if (existing) {
          await db.update(customFieldValues)
            .set({ value })
            .where(eq(customFieldValues.id, existing.id))
        } else {
          await db.insert(customFieldValues).values({
            entityType,
            entityId,
            fieldKey: key,
            value,
          })
        }
      }
    }

    return { success: true }
  }, {
    body: t.Object({
      values: t.Any(),
    }),
  })
