DO $$
BEGIN
  CREATE TYPE "dashboard_template_source" AS ENUM ('system', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "dashboard_template_visibility" AS ENUM ('personal', 'team');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "dashboard_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_type" "dashboard_scope_type" NOT NULL,
  "scope_ref_id" uuid NOT NULL,
  "name" varchar(160) NOT NULL,
  "slug" varchar(160) NOT NULL,
  "description" text,
  "source" "dashboard_template_source" DEFAULT 'user' NOT NULL,
  "visibility" "dashboard_template_visibility" DEFAULT 'personal' NOT NULL,
  "owner_user_id" uuid,
  "created_by_user_id" uuid NOT NULL,
  "updated_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_templates_owner_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "dashboard_templates"
      ADD CONSTRAINT "dashboard_templates_owner_user_id_users_id_fk"
      FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_templates_created_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "dashboard_templates"
      ADD CONSTRAINT "dashboard_templates_created_by_user_id_users_id_fk"
      FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_templates_updated_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "dashboard_templates"
      ADD CONSTRAINT "dashboard_templates_updated_by_user_id_users_id_fk"
      FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_templates_scope_source_slug_unique'
  ) THEN
    ALTER TABLE "dashboard_templates"
      ADD CONSTRAINT "dashboard_templates_scope_source_slug_unique"
      UNIQUE ("scope_type", "scope_ref_id", "source", "slug");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "dashboard_templates_scope_idx"
  ON "dashboard_templates" ("scope_type", "scope_ref_id");
CREATE INDEX IF NOT EXISTS "dashboard_templates_owner_idx"
  ON "dashboard_templates" ("owner_user_id");

CREATE TABLE IF NOT EXISTS "dashboard_template_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "template_id" uuid NOT NULL,
  "name" varchar(160) NOT NULL,
  "slug" varchar(160) NOT NULL,
  "visibility" "dashboard_template_visibility" DEFAULT 'personal' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_template_pages_template_id_dashboard_templates_id_fk'
  ) THEN
    ALTER TABLE "dashboard_template_pages"
      ADD CONSTRAINT "dashboard_template_pages_template_id_dashboard_templates_id_fk"
      FOREIGN KEY ("template_id") REFERENCES "public"."dashboard_templates"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_template_pages_template_slug_unique'
  ) THEN
    ALTER TABLE "dashboard_template_pages"
      ADD CONSTRAINT "dashboard_template_pages_template_slug_unique"
      UNIQUE ("template_id", "slug");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "dashboard_template_pages_template_idx"
  ON "dashboard_template_pages" ("template_id");
CREATE INDEX IF NOT EXISTS "dashboard_template_pages_template_sort_idx"
  ON "dashboard_template_pages" ("template_id", "sort_order");

CREATE TABLE IF NOT EXISTS "dashboard_template_widgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "template_page_id" uuid NOT NULL,
  "widget_type" varchar(100) NOT NULL,
  "widget_title" varchar(160),
  "config_json" json DEFAULT '{}'::json NOT NULL,
  "grid_x" integer DEFAULT 0 NOT NULL,
  "grid_y" integer DEFAULT 0 NOT NULL,
  "grid_w" integer DEFAULT 1 NOT NULL,
  "grid_h" integer DEFAULT 1 NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_template_widgets_template_page_id_dashboard_template_pages_id_fk'
  ) THEN
    ALTER TABLE "dashboard_template_widgets"
      ADD CONSTRAINT "dashboard_template_widgets_template_page_id_dashboard_template_pages_id_fk"
      FOREIGN KEY ("template_page_id") REFERENCES "public"."dashboard_template_pages"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "dashboard_template_widgets_page_idx"
  ON "dashboard_template_widgets" ("template_page_id");
CREATE INDEX IF NOT EXISTS "dashboard_template_widgets_page_sort_idx"
  ON "dashboard_template_widgets" ("template_page_id", "sort_order");
