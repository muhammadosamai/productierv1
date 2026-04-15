-- Phase 1: allow multiple NULL project_key until backfill script runs.
-- After backfill, apply 0015 for NOT NULL + full unique index.
CREATE UNIQUE INDEX IF NOT EXISTS "products_project_key_unique_not_null"
ON "products" ("project_key")
WHERE "project_key" IS NOT NULL;
