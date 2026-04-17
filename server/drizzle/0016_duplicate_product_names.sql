-- Allow duplicate product display names: add product_id FKs and drop global unique on products.name

-- 1) product_members
ALTER TABLE "product_members" ADD COLUMN IF NOT EXISTS "product_id" uuid REFERENCES "products"("id") ON DELETE CASCADE;
UPDATE "product_members" pm SET "product_id" = p."id" FROM "products" p WHERE p."name" = pm."product" AND pm."product_id" IS NULL;
ALTER TABLE "product_members" ALTER COLUMN "product_id" SET NOT NULL;
ALTER TABLE "product_members" DROP CONSTRAINT IF EXISTS "product_user_unique";
ALTER TABLE "product_members" ADD CONSTRAINT "product_members_product_id_user_id_unique" UNIQUE ("product_id", "user_id");

-- 2) product_invites
ALTER TABLE "product_invites" ADD COLUMN IF NOT EXISTS "product_id" uuid REFERENCES "products"("id") ON DELETE CASCADE;
UPDATE "product_invites" pi SET "product_id" = p."id" FROM "products" p WHERE p."name" = pi."product" AND pi."product_id" IS NULL;
ALTER TABLE "product_invites" ALTER COLUMN "product_id" SET NOT NULL;

-- 3) form_configs
ALTER TABLE "form_configs" ADD COLUMN IF NOT EXISTS "product_id" uuid REFERENCES "products"("id") ON DELETE CASCADE;
UPDATE "form_configs" fc SET "product_id" = p."id" FROM "products" p WHERE p."name" = fc."product" AND fc."product_id" IS NULL;
ALTER TABLE "form_configs" ALTER COLUMN "product_id" SET NOT NULL;
ALTER TABLE "form_configs" DROP CONSTRAINT IF EXISTS "form_config_product_entity_unique";
ALTER TABLE "form_configs" ADD CONSTRAINT "form_config_product_id_entity_unique" UNIQUE ("product_id", "entity_type");

-- 4) backlog_items (stories)
ALTER TABLE "backlog_items" ADD COLUMN IF NOT EXISTS "product_id" uuid REFERENCES "products"("id") ON DELETE CASCADE;
UPDATE "backlog_items" s SET "product_id" = p."id" FROM "products" p WHERE p."name" = s."product" AND s."product_id" IS NULL;
ALTER TABLE "backlog_items" ALTER COLUMN "product_id" SET NOT NULL;

-- 5) issues
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "product_id" uuid REFERENCES "products"("id") ON DELETE CASCADE;
UPDATE "issues" i SET "product_id" = p."id" FROM "products" p WHERE p."name" = i."product" AND i."product_id" IS NULL;
ALTER TABLE "issues" ALTER COLUMN "product_id" SET NOT NULL;

-- 6) initiatives
ALTER TABLE "initiatives" ADD COLUMN IF NOT EXISTS "product_id" uuid REFERENCES "products"("id") ON DELETE CASCADE;
UPDATE "initiatives" i SET "product_id" = p."id" FROM "products" p WHERE p."name" = i."product" AND i."product_id" IS NULL;
ALTER TABLE "initiatives" ALTER COLUMN "product_id" SET NOT NULL;

-- 7) activities
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "product_id" uuid REFERENCES "products"("id") ON DELETE CASCADE;
UPDATE "activities" a SET "product_id" = p."id" FROM "products" p WHERE p."name" = a."product" AND a."product_id" IS NULL;
ALTER TABLE "activities" ALTER COLUMN "product_id" SET NOT NULL;

-- 8) Stable project_key for resolution (fill nulls with deterministic unique token from id)
UPDATE "products" SET "project_key" = UPPER(SUBSTRING(REPLACE("id"::text, '-', ''), 1, 16))
WHERE "project_key" IS NULL OR TRIM(COALESCE("project_key", '')) = '';

-- Resolve duplicate project_key (if any) so unique index can be created
WITH ranked AS (
  SELECT "id", "project_key",
    ROW_NUMBER() OVER (PARTITION BY "project_key" ORDER BY "created_at" NULLS LAST, "id") AS rn
  FROM "products"
)
UPDATE "products" p
SET "project_key" = UPPER(SUBSTRING(REPLACE(p."id"::text, '-', ''), 1, 16))
FROM ranked r
WHERE p."id" = r."id" AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "products_project_key_unique" ON "products" ("project_key");

-- 9) Drop global unique on product display name
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_name_unique";
