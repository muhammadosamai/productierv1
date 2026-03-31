ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "product_id" uuid REFERENCES "products"("id") ON DELETE cascade;

ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "slack_enabled" boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_preferences_user_category_unique'
  ) THEN
    ALTER TABLE "notification_preferences"
      DROP CONSTRAINT "notification_preferences_user_category_unique";
  END IF;
END $$;

DROP INDEX IF EXISTS "notification_preferences_user_category_unique";

CREATE INDEX IF NOT EXISTS "notification_preferences_user_product_idx"
  ON "notification_preferences" ("user_id", "product_id");

CREATE INDEX IF NOT EXISTS "notification_preferences_user_category_idx"
  ON "notification_preferences" ("user_id", "category");

CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_user_global_category_unique"
  ON "notification_preferences" ("user_id", "category")
  WHERE "product_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_user_product_category_unique"
  ON "notification_preferences" ("user_id", "product_id", "category")
  WHERE "product_id" IS NOT NULL;
