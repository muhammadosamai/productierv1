ALTER TABLE "backlog_items"
ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "product", "status"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS rn
  FROM "backlog_items"
)
UPDATE "backlog_items" AS b
SET "sort_order" = ranked.rn
FROM ranked
WHERE ranked.id = b.id;

CREATE INDEX IF NOT EXISTS "backlog_items_product_status_sort_idx"
ON "backlog_items" ("product", "status", "sort_order", "id");
