CREATE TABLE IF NOT EXISTS "titles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(100) NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "titles_key_unique" UNIQUE("key"),
  CONSTRAINT "titles_name_unique" UNIQUE("name")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'titles_created_by_user_fk'
  ) THEN
    ALTER TABLE "titles"
    ADD CONSTRAINT "titles_created_by_user_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "title_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title_id" uuid NOT NULL,
  "page" varchar(100) NOT NULL,
  "visible" boolean DEFAULT false NOT NULL,
  "can_create" boolean DEFAULT false NOT NULL,
  "can_edit" boolean DEFAULT false NOT NULL,
  "can_delete" boolean DEFAULT false NOT NULL,
  "self_view_only" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "title_permissions_unique" UNIQUE("title_id","page")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'title_permissions_title_fk'
  ) THEN
    ALTER TABLE "title_permissions"
    ADD CONSTRAINT "title_permissions_title_fk"
    FOREIGN KEY ("title_id") REFERENCES "titles"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "user_titles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "title_id" uuid NOT NULL,
  "assigned_by_user_id" uuid,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_titles_user_unique" UNIQUE("user_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_titles_user_fk'
  ) THEN
    ALTER TABLE "user_titles"
    ADD CONSTRAINT "user_titles_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_titles_title_fk'
  ) THEN
    ALTER TABLE "user_titles"
    ADD CONSTRAINT "user_titles_title_fk"
    FOREIGN KEY ("title_id") REFERENCES "titles"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_titles_assigned_by_user_fk'
  ) THEN
    ALTER TABLE "user_titles"
    ADD CONSTRAINT "user_titles_assigned_by_user_fk"
    FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "title_permissions_title_idx" ON "title_permissions" ("title_id");
CREATE INDEX IF NOT EXISTS "user_titles_title_idx" ON "user_titles" ("title_id");

WITH role_seed(role_key, role_name) AS (
  VALUES
    ('super_admin', 'Super Admin'),
    ('admin', 'Admin'),
    ('product_admin', 'Product Admin'),
    ('product_manager', 'Product Manager'),
    ('business_analyst', 'Business Analyst'),
    ('developer', 'Developer'),
    ('viewer', 'Viewer')
)
INSERT INTO "titles" (
  "key",
  "name",
  "description",
  "is_active",
  "is_system",
  "created_at",
  "updated_at"
)
SELECT
  role_seed.role_key,
  role_seed.role_name,
  CONCAT('System seed title mapped from role: ', role_seed.role_key),
  true,
  true,
  now(),
  now()
FROM role_seed
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "title_permissions" (
  "title_id",
  "page",
  "visible",
  "can_create",
  "can_edit",
  "can_delete",
  "self_view_only",
  "updated_at"
)
SELECT
  title_row.id,
  role_perm.page,
  role_perm.visible,
  role_perm.can_create,
  role_perm.can_edit,
  role_perm.can_delete,
  role_perm.self_view_only,
  now()
FROM "titles" AS title_row
JOIN "role_permissions" AS role_perm
  ON role_perm.role::text = title_row."key"
ON CONFLICT ("title_id","page") DO NOTHING;

INSERT INTO "user_titles" (
  "user_id",
  "title_id",
  "assigned_by_user_id",
  "assigned_at",
  "updated_at"
)
SELECT
  user_row.id,
  title_row.id,
  NULL,
  now(),
  now()
FROM "users" AS user_row
JOIN "titles" AS title_row
  ON title_row."key" = user_row.role::text
ON CONFLICT ("user_id") DO NOTHING;
