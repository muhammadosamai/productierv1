CREATE TABLE IF NOT EXISTS "initiative_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "initiative_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "assigned_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "initiative_member_unique" UNIQUE("initiative_id", "user_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'initiative_members_initiative_id_initiatives_id_fk'
  ) THEN
    ALTER TABLE "initiative_members"
      ADD CONSTRAINT "initiative_members_initiative_id_initiatives_id_fk"
      FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'initiative_members_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "initiative_members"
      ADD CONSTRAINT "initiative_members_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'initiative_members_assigned_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "initiative_members"
      ADD CONSTRAINT "initiative_members_assigned_by_user_id_users_id_fk"
      FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "initiative_teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "initiative_id" uuid NOT NULL,
  "organization_team_id" uuid NOT NULL,
  "assigned_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "initiative_team_unique" UNIQUE("initiative_id", "organization_team_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'initiative_teams_initiative_id_initiatives_id_fk'
  ) THEN
    ALTER TABLE "initiative_teams"
      ADD CONSTRAINT "initiative_teams_initiative_id_initiatives_id_fk"
      FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'initiative_teams_organization_team_id_organization_teams_id_fk'
  ) THEN
    ALTER TABLE "initiative_teams"
      ADD CONSTRAINT "initiative_teams_organization_team_id_organization_teams_id_fk"
      FOREIGN KEY ("organization_team_id") REFERENCES "public"."organization_teams"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'initiative_teams_assigned_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "initiative_teams"
      ADD CONSTRAINT "initiative_teams_assigned_by_user_id_users_id_fk"
      FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "initiative_members_initiative_idx" ON "initiative_members" ("initiative_id");
CREATE INDEX IF NOT EXISTS "initiative_members_user_idx" ON "initiative_members" ("user_id");
CREATE INDEX IF NOT EXISTS "initiative_teams_initiative_idx" ON "initiative_teams" ("initiative_id");
CREATE INDEX IF NOT EXISTS "initiative_teams_team_idx" ON "initiative_teams" ("organization_team_id");
