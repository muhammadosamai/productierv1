DO $$
BEGIN
  CREATE TYPE "dashboard_scope_type" AS ENUM ('product', 'workspace');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "dashboard_visibility" AS ENUM ('personal', 'team', 'invited');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "dashboard_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_type" "dashboard_scope_type" NOT NULL,
  "scope_ref_id" uuid NOT NULL,
  "name" varchar(160) NOT NULL,
  "slug" varchar(160) NOT NULL,
  "visibility" "dashboard_visibility" DEFAULT 'personal' NOT NULL,
  "owner_user_id" uuid,
  "is_system" boolean DEFAULT false NOT NULL,
  "system_key" varchar(120),
  "created_by_user_id" uuid NOT NULL,
  "updated_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_pages_owner_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "dashboard_pages"
      ADD CONSTRAINT "dashboard_pages_owner_user_id_users_id_fk"
      FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_pages_created_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "dashboard_pages"
      ADD CONSTRAINT "dashboard_pages_created_by_user_id_users_id_fk"
      FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_pages_updated_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "dashboard_pages"
      ADD CONSTRAINT "dashboard_pages_updated_by_user_id_users_id_fk"
      FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_pages_scope_slug_unique'
  ) THEN
    ALTER TABLE "dashboard_pages"
      ADD CONSTRAINT "dashboard_pages_scope_slug_unique" UNIQUE ("scope_type", "scope_ref_id", "slug");
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_pages_scope_system_key_unique'
  ) THEN
    ALTER TABLE "dashboard_pages"
      ADD CONSTRAINT "dashboard_pages_scope_system_key_unique" UNIQUE ("scope_type", "scope_ref_id", "system_key");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "dashboard_pages_scope_idx" ON "dashboard_pages" ("scope_type", "scope_ref_id");
CREATE INDEX IF NOT EXISTS "dashboard_pages_owner_idx" ON "dashboard_pages" ("owner_user_id");

CREATE TABLE IF NOT EXISTS "dashboard_widgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "page_id" uuid NOT NULL,
  "widget_type" varchar(100) NOT NULL,
  "widget_title" varchar(160),
  "config_json" json DEFAULT '{}'::json NOT NULL,
  "grid_x" integer DEFAULT 0 NOT NULL,
  "grid_y" integer DEFAULT 0 NOT NULL,
  "grid_w" integer DEFAULT 1 NOT NULL,
  "grid_h" integer DEFAULT 1 NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_widgets_page_id_dashboard_pages_id_fk'
  ) THEN
    ALTER TABLE "dashboard_widgets"
      ADD CONSTRAINT "dashboard_widgets_page_id_dashboard_pages_id_fk"
      FOREIGN KEY ("page_id") REFERENCES "public"."dashboard_pages"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_widgets_created_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "dashboard_widgets"
      ADD CONSTRAINT "dashboard_widgets_created_by_user_id_users_id_fk"
      FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_widgets_updated_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "dashboard_widgets"
      ADD CONSTRAINT "dashboard_widgets_updated_by_user_id_users_id_fk"
      FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "dashboard_widgets_page_idx" ON "dashboard_widgets" ("page_id");
CREATE INDEX IF NOT EXISTS "dashboard_widgets_page_sort_idx" ON "dashboard_widgets" ("page_id", "sort_order");

CREATE TABLE IF NOT EXISTS "dashboard_page_viewers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "page_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "invited_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_page_viewers_page_id_dashboard_pages_id_fk'
  ) THEN
    ALTER TABLE "dashboard_page_viewers"
      ADD CONSTRAINT "dashboard_page_viewers_page_id_dashboard_pages_id_fk"
      FOREIGN KEY ("page_id") REFERENCES "public"."dashboard_pages"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_page_viewers_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "dashboard_page_viewers"
      ADD CONSTRAINT "dashboard_page_viewers_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_page_viewers_invited_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "dashboard_page_viewers"
      ADD CONSTRAINT "dashboard_page_viewers_invited_by_user_id_users_id_fk"
      FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_page_viewers_page_user_unique'
  ) THEN
    ALTER TABLE "dashboard_page_viewers"
      ADD CONSTRAINT "dashboard_page_viewers_page_user_unique" UNIQUE ("page_id", "user_id");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "dashboard_page_viewers_page_idx" ON "dashboard_page_viewers" ("page_id");
CREATE INDEX IF NOT EXISTS "dashboard_page_viewers_user_idx" ON "dashboard_page_viewers" ("user_id");
