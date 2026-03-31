DO $$
BEGIN
  CREATE TYPE "public"."dashboard_viewer_access_role" AS ENUM ('viewer', 'editor');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "dashboard_page_viewers"
  ADD COLUMN IF NOT EXISTS "access_role" "dashboard_viewer_access_role" DEFAULT 'viewer' NOT NULL;

CREATE INDEX IF NOT EXISTS "dashboard_page_viewers_role_idx"
  ON "dashboard_page_viewers" ("access_role");
