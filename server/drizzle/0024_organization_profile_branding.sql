ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "description" text,
  ADD COLUMN IF NOT EXISTS "logo" varchar(500);

