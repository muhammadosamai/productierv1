ALTER TABLE "consumer_feedbacks"
ADD COLUMN IF NOT EXISTS "acknowledged_at" timestamp with time zone;

ALTER TABLE "consumer_feedbacks"
ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;

UPDATE "consumer_feedbacks"
SET "acknowledged_at" = COALESCE("acknowledged_at", "updated_at")
WHERE "acknowledged_at" IS NULL
  AND "status" IN ('acknowledged', 'investigating', 'resolved', 'wont_fix', 'duplicate');

UPDATE "consumer_feedbacks"
SET "resolved_at" = COALESCE("resolved_at", "updated_at")
WHERE "resolved_at" IS NULL
  AND "status" IN ('resolved', 'wont_fix', 'duplicate');

CREATE INDEX IF NOT EXISTS "consumer_feedbacks_product_created_idx"
ON "consumer_feedbacks" USING btree ("product_id", "created_at");

CREATE INDEX IF NOT EXISTS "consumer_feedbacks_product_priority_status_idx"
ON "consumer_feedbacks" USING btree ("product_id", "priority", "status");
