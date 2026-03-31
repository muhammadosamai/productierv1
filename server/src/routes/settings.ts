import { Elysia, t } from 'elysia'
import { db } from '../db'
import { userSettings } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { authPlugin } from '../plugins/auth'
import { requireAuth } from '../lib/authz'
import { isSchemaMismatchError } from '../lib/schemaMismatch'

function isSettingsStorageUnavailable(error: unknown): boolean {
  if (isSchemaMismatchError(error)) return true
  if (!error || typeof error !== 'object') return false
  const maybeErr = error as { code?: string; message?: string }
  const normalizedCode = (maybeErr.code || '').toUpperCase()
  if ([
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ECONNRESET',
  ].includes(normalizedCode)) {
    return true
  }

  const message = (maybeErr.message || '').toLowerCase()
  return message.includes('relation "user_settings" does not exist')
    || message.includes('connection refused')
    || message.includes('connection terminated')
    || message.includes('terminating connection')
}

export const settingsRoutes = new Elysia({ prefix: '/api/settings' })
  .use(authPlugin)

  // GET /api/settings/:key — Get a single setting by key
  .get('/:key', async ({ params: { key }, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    try {
      const setting = await db.query.userSettings.findFirst({
        where: and(
          eq(userSettings.userId, user.id),
          eq(userSettings.key, key),
        ),
      })

      return { key, value: setting?.value ?? null }
    } catch (error) {
      if (!isSettingsStorageUnavailable(error)) throw error
      console.warn('[settings] Falling back to null for key lookup.', { key, userId: user.id, error })
      return { key, value: null }
    }
  })

  // GET /api/settings — Get all settings for the current user
  .get('/', async ({ jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    try {
      const settings = await db.select()
        .from(userSettings)
        .where(eq(userSettings.userId, user.id))

      const result: Record<string, any> = {}
      for (const s of settings) {
        result[s.key] = s.value
      }
      return result
    } catch (error) {
      if (!isSettingsStorageUnavailable(error)) throw error
      console.warn('[settings] Falling back to empty settings map.', { userId: user.id, error })
      return {}
    }
  })

  // PUT /api/settings/:key — Upsert a setting
  .put('/:key', async ({ params: { key }, body, jwt: jwtInstance, headers, set }) => {
    const user = await requireAuth(jwtInstance.verify, headers, set)
    if (!user) return { error: 'Unauthorized' }

    // Local schemas may keep user_settings.value as NOT NULL. Normalize null writes
    // to an empty string to avoid surfacing 500s to the UI.
    const normalizedValue = body.value === null ? '' : body.value

    try {
      const existing = await db.query.userSettings.findFirst({
        where: and(
          eq(userSettings.userId, user.id),
          eq(userSettings.key, key),
        ),
      })

      if (existing) {
        await db.update(userSettings)
          .set({ value: normalizedValue, updatedAt: new Date() })
          .where(eq(userSettings.id, existing.id))
      } else {
        await db.insert(userSettings).values({
          userId: user.id,
          key,
          value: normalizedValue,
        })
      }

      return { key, value: normalizedValue }
    } catch (error) {
      if (!isSettingsStorageUnavailable(error)) throw error
      console.warn('[settings] Persist skipped because storage is unavailable.', { key, userId: user.id, error })
      return { key, value: normalizedValue, persisted: false }
    }
  }, {
    body: t.Object({
      value: t.Any(),
    }),
  })
