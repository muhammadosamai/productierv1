ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "daily_rollup_enabled" boolean NOT NULL DEFAULT true;
