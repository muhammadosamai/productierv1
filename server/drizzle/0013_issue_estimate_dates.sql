ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "estimate_value" double precision;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "start_date" date;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "end_date" date;
