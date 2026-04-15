import { Elysia, t } from 'elysia'
import { db } from '../db'
import { initiatives, initiativeAttachments, users, productMembers } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import {
  resolveProductByScope,
  whereDenormProductMatches,
  denormalizedProductScopeValue,
} from '../lib/resolveProductScope'
import { jwt } from '@elysiajs/jwt'
import { logActivity, computeChanges } from '../lib/logActivity'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { validateAttachmentFileName, validateAttachmentContent } from '../lib/allowedAttachments'
import { ensureInitiativeStatusArchivedEnum } from '../lib/ensureInitiativeStatusEnum'

const JWT_SECRET = process.env.JWT_SECRET || 'productier-secret-key-change-in-production'

const initiativeBody = t.Object({
  title: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  status: t.Optional(t.Union([
    t.Literal('planning'), t.Literal('active'),
    t.Literal('paused'), t.Literal('completed'), t.Literal('archived'),
  ])),
  period: t.Optional(t.Nullable(t.String())),
  periodStart: t.Optional(t.Nullable(t.String())),
  periodEnd: t.Optional(t.Nullable(t.String())),
  leader: t.Optional(t.Nullable(t.String())),
  leaderAvatar: t.Optional(t.Nullable(t.String())),
  priority: t.Optional(t.Union([
    t.Literal('low'), t.Literal('medium'),
    t.Literal('high')
  ])),
  product: t.Optional(t.String()),
})

async function getUserFromHeader(jwtVerify: any, headers: Record<string, string | undefined>) {
  const authHeader = headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const payload = await jwtVerify(token)
  if (!payload?.userId) return null
  const user = await db.query.users.findFirst({ where: eq(users.id, payload.userId as string) })
  return user || null
}

async function userCanAccessInitiativeAttachment(
  user: { id: string; role: string } | null,
  initiativeId: string,
): Promise<boolean> {
  if (!user) return false
  if (user.role === 'super_admin') return true
  const ini = await db.query.initiatives.findFirst({
    where: eq(initiatives.id, initiativeId),
    columns: { product: true },
  })
  if (!ini) return false
  const scopeRow = await resolveProductByScope(ini.product)
  if (!scopeRow) return false
  const member = await db.query.productMembers.findFirst({
    where: and(whereDenormProductMatches(productMembers.product, scopeRow), eq(productMembers.userId, user.id)),
  })
  return !!member
}

export const initiativeRoutes = new Elysia({ prefix: '/api/initiatives' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))
  .onBeforeHandle(async () => {
    await ensureInitiativeStatusArchivedEnum()
  })

  // GET /api/initiatives
  .get('/', async ({ query }) => {
    const product = query.product?.trim()
    const scopeRow = product ? await resolveProductByScope(product) : null
    return db.query.initiatives.findMany({
      where: scopeRow ? whereDenormProductMatches(initiatives.product, scopeRow) : undefined,
      orderBy: (items, { desc }) => [desc(items.createdAt)],
    })
  })

  // POST /api/initiatives
  .post('/', async ({ body, jwt, headers, set }) => {
    let values = { ...body } as typeof body
    if (body.product != null && String(body.product).trim() !== '') {
      const sr = await resolveProductByScope(String(body.product))
      if (!sr) {
        set.status = 404
        return { error: 'Product not found' }
      }
      values = { ...values, product: denormalizedProductScopeValue(sr) }
    }
    const [initiative] = await db.insert(initiatives).values(values).returning()
    const user = await getUserFromHeader(jwt.verify, headers)
    logActivity({
      product: initiative!.product,
      userName: user?.name || 'System',
      userAvatar: user?.avatar,
      userId: user?.id,
      action: 'created',
      entityType: 'initiative',
      entityId: initiative!.id,
      entityTitle: initiative!.title,
    })
    return initiative
  }, { body: initiativeBody })

  // ============ ATTACHMENTS (literal `attachments` before /:id) ============

  .get('/attachments/:attachmentId/download', async ({ params: { attachmentId }, set, jwt, headers }) => {
    const user = await getUserFromHeader(jwt.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    const att = await db.query.initiativeAttachments.findFirst({ where: eq(initiativeAttachments.id, attachmentId) })
    if (!att || !(await userCanAccessInitiativeAttachment(user, att.initiativeId))) {
      set.status = 404
      return { error: 'Attachment not found' }
    }

    const rel = att.filePath.replace(/^\/+/, '')
    const diskPath = path.join(process.cwd(), rel)
    const file = Bun.file(diskPath)
    if (!(await file.exists())) {
      set.status = 404
      return { error: 'File not found' }
    }

    const safeName = att.fileName.replace(/[\r\n"]/g, '_') || 'attachment'
    const utfName = encodeURIComponent(att.fileName).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    set.headers['Content-Type'] = att.mimeType || 'application/octet-stream'
    set.headers['Content-Disposition'] =
      `attachment; filename="${safeName}"; filename*=UTF-8''${utfName}`

    return file
  })

  .get('/:id/attachments', async ({ params: { id }, set, jwt, headers }) => {
    const user = await getUserFromHeader(jwt.verify, headers)
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    if (!(await userCanAccessInitiativeAttachment(user, id))) {
      set.status = 404
      return { error: 'Initiative not found' }
    }
    return db.query.initiativeAttachments.findMany({
      where: eq(initiativeAttachments.initiativeId, id),
      with: { user: true },
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    })
  })

  .post('/:id/attachments', async ({ params: { id }, body, set, jwt, headers }) => {
    const user = await getUserFromHeader(jwt.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    if (!(await userCanAccessInitiativeAttachment(user, id))) {
      set.status = 404
      return { error: 'Initiative not found' }
    }

    const file = (body as any).file as File
    if (!file) { set.status = 400; return { error: 'No file provided' } }

    const typeCheck = validateAttachmentFileName(file.name)
    if (!typeCheck.ok) { set.status = 400; return { error: typeCheck.error } }

    const uploadsDir = path.join(process.cwd(), 'uploads', 'attachments')
    const ext = path.extname(file.name) || ''
    const uniqueName = `${randomUUID()}${ext}`
    const filePath = path.join(uploadsDir, uniqueName)

    const arrayBuffer = await file.arrayBuffer()
    const contentCheck = await validateAttachmentContent(arrayBuffer, file.name)
    if (!contentCheck.ok) { set.status = 400; return { error: contentCheck.error } }

    await Bun.write(filePath, arrayBuffer)

    const [attachment] = await db.insert(initiativeAttachments).values({
      initiativeId: id,
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: contentCheck.mime,
      filePath: `/uploads/attachments/${uniqueName}`,
    }).returning()

    const ini = await db.query.initiatives.findFirst({ where: eq(initiatives.id, id) })
    if (ini) {
      logActivity({
        product: ini.product,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'initiative',
        entityId: ini.id,
        entityTitle: ini.title,
        changes: [{ field: 'attachment', from: null, to: file.name }],
      })
    }

    return db.query.initiativeAttachments.findFirst({
      where: eq(initiativeAttachments.id, attachment!.id),
      with: { user: true },
    })
  })

  .delete('/attachments/:attachmentId', async ({ params: { attachmentId }, set, jwt, headers }) => {
    const user = await getUserFromHeader(jwt.verify, headers)
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }

    const existing = await db.query.initiativeAttachments.findFirst({
      where: eq(initiativeAttachments.id, attachmentId),
    })
    if (!existing || !(await userCanAccessInitiativeAttachment(user, existing.initiativeId))) {
      set.status = 404
      return { error: 'Attachment not found' }
    }

    const [deleted] = await db.delete(initiativeAttachments)
      .where(eq(initiativeAttachments.id, attachmentId))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Attachment not found' } }

    const ini = await db.query.initiatives.findFirst({ where: eq(initiatives.id, deleted.initiativeId) })
    if (ini) {
      logActivity({
        product: ini.product,
        userName: user.name,
        userAvatar: user.avatar,
        userId: user.id,
        action: 'updated',
        entityType: 'initiative',
        entityId: ini.id,
        entityTitle: ini.title,
        changes: [{ field: 'attachment', from: deleted.fileName, to: null }],
      })
    }

    try {
      const rel = deleted.filePath.replace(/^\/+/, '')
      const fullPath = path.join(process.cwd(), rel)
      const { unlink } = await import('fs/promises')
      await unlink(fullPath)
    } catch {}

    return { success: true }
  })

  // GET /api/initiatives/:id
  .get('/:id', async ({ params: { id }, set }) => {
    const initiative = await db.query.initiatives.findFirst({
      where: eq(initiatives.id, id),
    })
    if (!initiative) { set.status = 404; return { error: 'Initiative not found' } }
    return initiative
  })

  // PUT /api/initiatives/:id
  .put('/:id', async ({ params: { id }, body, set, jwt, headers }) => {
    // Fetch old version for change tracking
    const old = await db.query.initiatives.findFirst({ where: eq(initiatives.id, id) })
    if (!old) { set.status = 404; return { error: 'Initiative not found' } }

    const [updated] = await db.update(initiatives)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(initiatives.id, id))
      .returning()

    const user = await getUserFromHeader(jwt.verify, headers)
    const changes = computeChanges(old, body, ['title', 'status', 'priority', 'leader', 'description', 'periodStart', 'periodEnd'])
    if (changes.length > 0) {
      logActivity({
        product: updated!.product,
        userName: user?.name || 'System',
        userAvatar: user?.avatar,
        userId: user?.id,
        action: 'updated',
        entityType: 'initiative',
        entityId: updated!.id,
        entityTitle: updated!.title,
        changes,
      })
    }
    return updated
  }, { body: t.Partial(initiativeBody) })

  // DELETE /api/initiatives/:id
  .delete('/:id', async ({ params: { id }, set, jwt, headers }) => {
    const [deleted] = await db.delete(initiatives)
      .where(eq(initiatives.id, id))
      .returning()
    if (!deleted) { set.status = 404; return { error: 'Initiative not found' } }

    const user = await getUserFromHeader(jwt.verify, headers)
    logActivity({
      product: deleted.product,
      userName: user?.name || 'System',
      userAvatar: user?.avatar,
      userId: user?.id,
      action: 'deleted',
      entityType: 'initiative',
      entityId: deleted.id,
      entityTitle: deleted.title,
    })
    return { success: true }
  })
