ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "reminder_cadence" varchar(20) NOT NULL DEFAULT 'daily';

ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "reminder_cooldown_minutes" integer NOT NULL DEFAULT 720;

ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "reminder_due_soon_hours" integer NOT NULL DEFAULT 48;

ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "reminder_overdue_enabled" boolean NOT NULL DEFAULT true;

ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "reminder_due_soon_enabled" boolean NOT NULL DEFAULT true;

ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "reminder_stale_enabled" boolean NOT NULL DEFAULT true;

ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "reminder_review_sla_enabled" boolean NOT NULL DEFAULT true;
