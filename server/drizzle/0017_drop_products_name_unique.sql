-- Phase 3: allow duplicate display names; canonical scope is project_key (unique).
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_name_unique";
