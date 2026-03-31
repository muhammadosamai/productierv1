ALTER TABLE "organization_invites"
ADD COLUMN IF NOT EXISTS "invitee_name" varchar(255);

ALTER TABLE "organization_invites"
ADD COLUMN IF NOT EXISTS "workspace_product_id" uuid;

ALTER TABLE "organization_invites"
ADD COLUMN IF NOT EXISTS "organization_team_id" uuid;

ALTER TABLE "organization_invites"
ADD COLUMN IF NOT EXISTS "title_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_invites_workspace_fk'
  ) THEN
    ALTER TABLE "organization_invites"
      ADD CONSTRAINT "organization_invites_workspace_fk"
      FOREIGN KEY ("workspace_product_id") REFERENCES "public"."products"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_invites_team_fk'
  ) THEN
    ALTER TABLE "organization_invites"
      ADD CONSTRAINT "organization_invites_team_fk"
      FOREIGN KEY ("organization_team_id") REFERENCES "public"."organization_teams"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_invites_title_fk'
  ) THEN
    ALTER TABLE "organization_invites"
      ADD CONSTRAINT "organization_invites_title_fk"
      FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "organization_invites_workspace_idx"
ON "organization_invites" USING btree ("workspace_product_id");

CREATE INDEX IF NOT EXISTS "organization_invites_team_idx"
ON "organization_invites" USING btree ("organization_team_id");

CREATE INDEX IF NOT EXISTS "organization_invites_title_idx"
ON "organization_invites" USING btree ("title_id");
