DO $$
BEGIN
  CREATE TYPE "organization_team_member_role" AS ENUM ('member', 'lead');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "organization_teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "name" varchar(160) NOT NULL,
  "key" varchar(100) NOT NULL,
  "description" text,
  "lead_user_id" uuid,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_team_org_key_unique" UNIQUE("organization_id", "key"),
  CONSTRAINT "organization_team_org_name_unique" UNIQUE("organization_id", "name")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_teams_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "organization_teams"
      ADD CONSTRAINT "organization_teams_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_teams_lead_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "organization_teams"
      ADD CONSTRAINT "organization_teams_lead_user_id_users_id_fk"
      FOREIGN KEY ("lead_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_teams_created_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "organization_teams"
      ADD CONSTRAINT "organization_teams_created_by_user_id_users_id_fk"
      FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "organization_team_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_team_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" "organization_team_member_role" DEFAULT 'member' NOT NULL,
  "added_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_team_member_unique" UNIQUE("organization_team_id", "user_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_team_members_organization_team_id_organization_teams_id_fk'
  ) THEN
    ALTER TABLE "organization_team_members"
      ADD CONSTRAINT "organization_team_members_organization_team_id_organization_teams_id_fk"
      FOREIGN KEY ("organization_team_id") REFERENCES "public"."organization_teams"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_team_members_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "organization_team_members"
      ADD CONSTRAINT "organization_team_members_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_team_members_added_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "organization_team_members"
      ADD CONSTRAINT "organization_team_members_added_by_user_id_users_id_fk"
      FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "organization_member_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "member_user_id" uuid NOT NULL,
  "manager_user_id" uuid,
  "set_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_member_reports_member_unique" UNIQUE("organization_id", "member_user_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_member_reports_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "organization_member_reports"
      ADD CONSTRAINT "organization_member_reports_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_member_reports_member_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "organization_member_reports"
      ADD CONSTRAINT "organization_member_reports_member_user_id_users_id_fk"
      FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_member_reports_manager_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "organization_member_reports"
      ADD CONSTRAINT "organization_member_reports_manager_user_id_users_id_fk"
      FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_member_reports_set_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "organization_member_reports"
      ADD CONSTRAINT "organization_member_reports_set_by_user_id_users_id_fk"
      FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "owner_team_id" uuid,
  ADD COLUMN IF NOT EXISTS "assignee_team_ids" uuid[],
  ADD COLUMN IF NOT EXISTS "reviewer_team_ids" uuid[];

ALTER TABLE "issues"
  ADD COLUMN IF NOT EXISTS "assigned_to_team_id" uuid;

ALTER TABLE "test_cycle_issues"
  ADD COLUMN IF NOT EXISTS "assigned_to_team_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tasks_owner_team_id_organization_teams_id_fk'
  ) THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "tasks_owner_team_id_organization_teams_id_fk"
      FOREIGN KEY ("owner_team_id") REFERENCES "public"."organization_teams"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'issues_assigned_to_team_id_organization_teams_id_fk'
  ) THEN
    ALTER TABLE "issues"
      ADD CONSTRAINT "issues_assigned_to_team_id_organization_teams_id_fk"
      FOREIGN KEY ("assigned_to_team_id") REFERENCES "public"."organization_teams"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'test_cycle_issues_assigned_to_team_id_organization_teams_id_fk'
  ) THEN
    ALTER TABLE "test_cycle_issues"
      ADD CONSTRAINT "test_cycle_issues_assigned_to_team_id_organization_teams_id_fk"
      FOREIGN KEY ("assigned_to_team_id") REFERENCES "public"."organization_teams"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "organization_teams_org_idx" ON "organization_teams" ("organization_id");
CREATE INDEX IF NOT EXISTS "organization_teams_lead_idx" ON "organization_teams" ("lead_user_id");
CREATE INDEX IF NOT EXISTS "organization_team_members_team_idx" ON "organization_team_members" ("organization_team_id");
CREATE INDEX IF NOT EXISTS "organization_team_members_user_idx" ON "organization_team_members" ("user_id");
CREATE INDEX IF NOT EXISTS "organization_member_reports_org_idx" ON "organization_member_reports" ("organization_id");
CREATE INDEX IF NOT EXISTS "organization_member_reports_member_idx" ON "organization_member_reports" ("member_user_id");
CREATE INDEX IF NOT EXISTS "organization_member_reports_manager_idx" ON "organization_member_reports" ("manager_user_id");

