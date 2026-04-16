import { db } from '../db'
import { sql } from 'drizzle-orm'

/**
 * Ensures `tasks.start_date` / `tasks.end_date` exist (mirrors migration 0015).
 * Safe when columns already exist. Aligns DB with Drizzle schema so selects do not fail
 * if drizzle migrate was not run on this database.
 */
let taskScheduleColumnsEnsured = false

export async function ensureTaskScheduleColumns(): Promise<void> {
  if (taskScheduleColumnsEnsured) return
  await db.execute(sql`ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "start_date" date;`)
  await db.execute(sql`ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "end_date" date;`)
  await db.execute(sql`
    UPDATE "tasks"
    SET "end_date" = ("due_at" AT TIME ZONE 'UTC')::date
    WHERE "end_date" IS NULL AND "due_at" IS NOT NULL;
  `)
  taskScheduleColumnsEnsured = true
}
