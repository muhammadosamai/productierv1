DO $$
DECLARE
  null_product_count bigint;
BEGIN
  SELECT count(*)
  INTO null_product_count
  FROM "products"
  WHERE "organization_id" IS NULL;

  IF null_product_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce strict organization isolation: % products have NULL organization_id. Backfill these rows before applying migration 0025.',
      null_product_count;
  END IF;
END
$$;

DO $$
DECLARE
  duplicate_name_count bigint;
BEGIN
  SELECT count(*)
  INTO duplicate_name_count
  FROM (
    SELECT "organization_id", lower("name") AS normalized_name
    FROM "products"
    GROUP BY "organization_id", lower("name")
    HAVING count(*) > 1
  ) AS duplicate_names;

  IF duplicate_name_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce organization product-name uniqueness: found % duplicate organization/name pairs.',
      duplicate_name_count;
  END IF;
END
$$;

ALTER TABLE "products"
  DROP CONSTRAINT IF EXISTS "products_organization_id_organizations_id_fk";

ALTER TABLE "products"
  ALTER COLUMN "organization_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "products"
      ADD CONSTRAINT "products_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;

ALTER TABLE "products"
  DROP CONSTRAINT IF EXISTS "products_name_unique";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_org_name_unique'
  ) THEN
    ALTER TABLE "products"
      ADD CONSTRAINT "products_org_name_unique" UNIQUE ("organization_id", "name");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "products_org_id_idx" ON "products" ("organization_id", "id");
