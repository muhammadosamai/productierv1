ALTER TABLE "dashboard_pages"
  ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;

WITH ranked_pages AS (
  SELECT
    id,
    (row_number() OVER (
      PARTITION BY scope_type, scope_ref_id
      ORDER BY is_system DESC, name ASC, created_at ASC
    ) - 1) * 10 AS normalized_order
  FROM "dashboard_pages"
)
UPDATE "dashboard_pages" pages
SET "sort_order" = ranked_pages.normalized_order
FROM ranked_pages
WHERE pages.id = ranked_pages.id;

CREATE INDEX IF NOT EXISTS "dashboard_pages_scope_sort_idx"
  ON "dashboard_pages" ("scope_type", "scope_ref_id", "sort_order");
