DO $$
BEGIN
  CREATE TYPE "organization_member_role" AS ENUM ('owner', 'admin', 'member', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "organization_invite_status" AS ENUM ('pending', 'accepted', 'expired', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "onboarding_step" AS ENUM ('account', 'organization', 'workspace', 'invites', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizations_created_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "organizations"
      ADD CONSTRAINT "organizations_created_by_user_id_users_id_fk"
      FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "organization_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" "organization_member_role" DEFAULT 'member' NOT NULL,
  "invited_by_user_id" uuid,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_member_unique" UNIQUE("organization_id", "user_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_members_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "organization_members"
      ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_members_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "organization_members"
      ADD CONSTRAINT "organization_members_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_members_invited_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "organization_members"
      ADD CONSTRAINT "organization_members_invited_by_user_id_users_id_fk"
      FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "organization_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "email" varchar(255) NOT NULL,
  "token_hash" varchar(255) NOT NULL,
  "role" "organization_member_role" DEFAULT 'member' NOT NULL,
  "status" "organization_invite_status" DEFAULT 'pending' NOT NULL,
  "invited_by_user_id" uuid NOT NULL,
  "accepted_by_user_id" uuid,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_invites_token_hash_unique" UNIQUE("token_hash")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_invites_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "organization_invites"
      ADD CONSTRAINT "organization_invites_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_invites_invited_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "organization_invites"
      ADD CONSTRAINT "organization_invites_invited_by_user_id_users_id_fk"
      FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_invites_accepted_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "organization_invites"
      ADD CONSTRAINT "organization_invites_accepted_by_user_id_users_id_fk"
      FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "onboarding_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "organization_id" uuid,
  "current_step" "onboarding_step" DEFAULT 'account' NOT NULL,
  "is_completed" boolean DEFAULT false NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "onboarding_progress_user_unique" UNIQUE("user_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'onboarding_progress_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "onboarding_progress"
      ADD CONSTRAINT "onboarding_progress_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'onboarding_progress_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "onboarding_progress"
      ADD CONSTRAINT "onboarding_progress_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid;

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
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "organization_members_org_idx" ON "organization_members" ("organization_id");
CREATE INDEX IF NOT EXISTS "organization_members_user_idx" ON "organization_members" ("user_id");
CREATE INDEX IF NOT EXISTS "organization_invites_org_idx" ON "organization_invites" ("organization_id");
CREATE INDEX IF NOT EXISTS "organization_invites_email_idx" ON "organization_invites" ("email");
CREATE INDEX IF NOT EXISTS "organization_invites_status_idx" ON "organization_invites" ("status");
CREATE INDEX IF NOT EXISTS "onboarding_progress_org_idx" ON "onboarding_progress" ("organization_id");
CREATE INDEX IF NOT EXISTS "products_organization_idx" ON "products" ("organization_id");

INSERT INTO "organizations" ("name", "slug", "created_by_user_id", "created_at", "updated_at")
SELECT
  p."name",
  CONCAT('legacy-', REPLACE(p."id"::text, '-', '')),
  p."created_by_user_id",
  NOW(),
  NOW()
FROM "products" p
WHERE p."organization_id" IS NULL
ON CONFLICT ("slug") DO NOTHING;

UPDATE "products" p
SET "organization_id" = o."id"
FROM "organizations" o
WHERE p."organization_id" IS NULL
  AND o."slug" = CONCAT('legacy-', REPLACE(p."id"::text, '-', ''));

INSERT INTO "organization_members" (
  "organization_id",
  "user_id",
  "role",
  "joined_at",
  "created_at",
  "updated_at"
)
SELECT
  p."organization_id",
  p."created_by_user_id",
  'owner'::"organization_member_role",
  NOW(),
  NOW(),
  NOW()
FROM "products" p
WHERE p."organization_id" IS NOT NULL
ON CONFLICT ("organization_id", "user_id") DO NOTHING;

INSERT INTO "onboarding_progress" (
  "user_id",
  "organization_id",
  "current_step",
  "is_completed",
  "completed_at",
  "created_at",
  "updated_at"
)
SELECT
  u."id",
  (
    SELECT om."organization_id"
    FROM "organization_members" om
    WHERE om."user_id" = u."id"
    ORDER BY om."joined_at" ASC
    LIMIT 1
  ),
  'completed'::"onboarding_step",
  TRUE,
  NOW(),
  NOW(),
  NOW()
FROM "users" u
ON CONFLICT ("user_id") DO NOTHING;
