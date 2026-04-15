-- Phase 1 (final): run ONLY after `bun run db:backfill-project-keys` and no null keys remain.
-- Fails intentionally if any product still has project_key IS NULL.

ALTER TABLE "products" ALTER COLUMN "project_key" SET NOT NULL;

DROP INDEX IF EXISTS "products_project_key_unique_not_null";

CREATE UNIQUE INDEX IF NOT EXISTS "products_project_key_unique" ON "products" ("project_key");
