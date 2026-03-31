DO $$ BEGIN
  CREATE TYPE "issue_source" AS ENUM ('standalone', 'test_cycle');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "integration_auth_type" AS ENUM ('none', 'api_key', 'oauth2');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "integration_connection_status" AS ENUM ('disconnected', 'connected', 'error');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "integration_sync_run_status" AS ENUM ('queued', 'running', 'success', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "integration_sync_event_level" AS ENUM ('info', 'warn', 'error');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;

ALTER TABLE "backlog_items"
ADD COLUMN IF NOT EXISTS "initiative_id" uuid;

DO $$ BEGIN
  ALTER TABLE "backlog_items"
    ADD CONSTRAINT "backlog_items_initiative_id_initiatives_id_fk"
    FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "issues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" varchar(255) NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "severity" "issue_severity" DEFAULT 'minor' NOT NULL,
  "status" "issue_status" DEFAULT 'open' NOT NULL,
  "source" "issue_source" DEFAULT 'standalone' NOT NULL,
  "story_id" uuid,
  "initiative_id" uuid,
  "delivery_id" uuid,
  "test_cycle_id" uuid,
  "reported_by_user_id" uuid NOT NULL,
  "assigned_to_user_id" uuid,
  "resolution_summary" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "issues"
    ADD CONSTRAINT "issues_story_id_backlog_items_id_fk"
    FOREIGN KEY ("story_id") REFERENCES "public"."backlog_items"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "issues"
    ADD CONSTRAINT "issues_initiative_id_initiatives_id_fk"
    FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "issues"
    ADD CONSTRAINT "issues_delivery_id_deliveries_id_fk"
    FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "issues"
    ADD CONSTRAINT "issues_test_cycle_id_test_cycles_id_fk"
    FOREIGN KEY ("test_cycle_id") REFERENCES "public"."test_cycles"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "issues"
    ADD CONSTRAINT "issues_reported_by_user_id_users_id_fk"
    FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "issues"
    ADD CONSTRAINT "issues_assigned_to_user_id_users_id_fk"
    FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "issues_product_status_idx"
ON "issues" ("product_id", "status");

CREATE TABLE IF NOT EXISTS "integration_catalog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connector_key" varchar(100) NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "category" varchar(100) DEFAULT 'general' NOT NULL,
  "auth_type" "integration_auth_type" DEFAULT 'none' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "metadata" json,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "integration_catalog_connector_key_unique" UNIQUE("connector_key")
);

CREATE TABLE IF NOT EXISTS "integration_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" varchar(255) NOT NULL,
  "connector_key" varchar(100) NOT NULL,
  "display_name" varchar(255),
  "status" "integration_connection_status" DEFAULT 'disconnected' NOT NULL,
  "metadata" json,
  "last_tested_at" timestamp with time zone,
  "last_synced_at" timestamp with time zone,
  "connected_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "integration_connection_product_connector_unique" UNIQUE("product_id","connector_key")
);

DO $$ BEGIN
  ALTER TABLE "integration_connections"
    ADD CONSTRAINT "integration_connections_connected_by_user_id_users_id_fk"
    FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "integration_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connection_id" uuid NOT NULL,
  "secret_ciphertext" text NOT NULL,
  "secret_iv" varchar(128),
  "secret_auth_tag" varchar(128),
  "key_version" varchar(50),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "integration_credentials_connection_unique" UNIQUE("connection_id")
);

DO $$ BEGIN
  ALTER TABLE "integration_credentials"
    ADD CONSTRAINT "integration_credentials_connection_id_integration_connections_id_fk"
    FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "integration_sync_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connection_id" uuid NOT NULL,
  "trigger_type" varchar(30) DEFAULT 'manual' NOT NULL,
  "status" "integration_sync_run_status" DEFAULT 'queued' NOT NULL,
  "requested_by_user_id" uuid,
  "summary" json,
  "error" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "integration_sync_runs"
    ADD CONSTRAINT "integration_sync_runs_connection_id_integration_connections_id_fk"
    FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "integration_sync_runs"
    ADD CONSTRAINT "integration_sync_runs_requested_by_user_id_users_id_fk"
    FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "integration_sync_runs_connection_idx"
ON "integration_sync_runs" ("connection_id", "created_at");

CREATE TABLE IF NOT EXISTS "integration_sync_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "level" "integration_sync_event_level" DEFAULT 'info' NOT NULL,
  "message" text NOT NULL,
  "details" json,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "integration_sync_events"
    ADD CONSTRAINT "integration_sync_events_run_id_integration_sync_runs_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "public"."integration_sync_runs"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "integration_sync_events_run_idx"
ON "integration_sync_events" ("run_id", "created_at");

CREATE TABLE IF NOT EXISTS "asset_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL,
  "revision_number" integer NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "content" text,
  "status" "asset_status" NOT NULL,
  "visibility" "asset_visibility" NOT NULL,
  "tags" text[],
  "changed_by_user_id" uuid,
  "change_summary" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "asset_revision_number_unique" UNIQUE("asset_id","revision_number")
);

DO $$ BEGIN
  ALTER TABLE "asset_revisions"
    ADD CONSTRAINT "asset_revisions_asset_id_assets_id_fk"
    FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "asset_revisions"
    ADD CONSTRAINT "asset_revisions_changed_by_user_id_users_id_fk"
    FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
