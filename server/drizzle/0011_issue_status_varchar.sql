-- Issue status: allow custom values per product (form config); store as varchar.
ALTER TABLE "issues" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "issues" ALTER COLUMN "status" TYPE varchar(64) USING ("status"::text);
ALTER TABLE "issues" ALTER COLUMN "status" SET DEFAULT 'open';

ALTER TABLE "test_cycle_issues" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "test_cycle_issues" ALTER COLUMN "status" TYPE varchar(64) USING ("status"::text);
ALTER TABLE "test_cycle_issues" ALTER COLUMN "status" SET DEFAULT 'open';

-- Drop enum if nothing references it (both columns migrated off it).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_status') THEN
    DROP TYPE "public"."issue_status";
  END IF;
END $$;
