ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "muted_at" timestamp with time zone;

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "snoozed_until" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "notifications_recipient_active_idx"
  ON "notifications" ("recipient_user_id","archived_at","muted_at","snoozed_until","created_at");
