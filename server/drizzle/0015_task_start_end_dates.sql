-- Parent task schedule: calendar dates (optional). Legacy due_at retained.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "start_date" date;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "end_date" date;

-- One-time backfill: map existing deadline into end_date for UI continuity
UPDATE "tasks"
SET "end_date" = ("due_at" AT TIME ZONE 'UTC')::date
WHERE "end_date" IS NULL AND "due_at" IS NOT NULL;
