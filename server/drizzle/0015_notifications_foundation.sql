DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'notification_category'
  ) THEN
    CREATE TYPE "notification_category" AS ENUM (
      'assignment',
      'workflow',
      'risk',
      'quality',
      'release',
      'admin',
      'integration',
      'digest'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'notification_severity'
  ) THEN
    CREATE TYPE "notification_severity" AS ENUM (
      'critical',
      'high',
      'medium',
      'low',
      'info'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'notification_urgency'
  ) THEN
    CREATE TYPE "notification_urgency" AS ENUM (
      'action_required',
      'watch',
      'informational'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_user_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "product_id" uuid,
  "page" varchar(100) NOT NULL,
  "route_path" varchar(500),
  "category" "notification_category" NOT NULL DEFAULT 'workflow',
  "type" varchar(120) NOT NULL,
  "severity" "notification_severity" NOT NULL DEFAULT 'info',
  "urgency" "notification_urgency" NOT NULL DEFAULT 'informational',
  "entity_type" varchar(80),
  "entity_id" uuid,
  "entity_title" varchar(255),
  "message" text NOT NULL,
  "payload" json,
  "subject_user_ids" uuid[],
  "dedupe_key" varchar(200) NOT NULL,
  "read_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "notifications_recipient_dedupe_unique" UNIQUE("recipient_user_id","dedupe_key")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_recipient_user_fk'
  ) THEN
    ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_recipient_user_fk"
    FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_actor_user_fk'
  ) THEN
    ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_actor_user_fk"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_product_fk'
  ) THEN
    ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_product_fk"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "category" "notification_category" NOT NULL,
  "in_app_enabled" boolean NOT NULL DEFAULT true,
  "email_enabled" boolean NOT NULL DEFAULT false,
  "quiet_hours_start" varchar(5),
  "quiet_hours_end" varchar(5),
  "minimum_severity" "notification_severity" NOT NULL DEFAULT 'low',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "notification_preferences_user_category_unique" UNIQUE("user_id","category")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_preferences_user_fk'
  ) THEN
    ALTER TABLE "notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "notifications_recipient_created_idx"
ON "notifications" ("recipient_user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "notifications_recipient_unread_idx"
ON "notifications" ("recipient_user_id", "archived_at", "read_at", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "notifications_product_created_idx"
ON "notifications" ("product_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "notifications_recipient_category_created_idx"
ON "notifications" ("recipient_user_id", "category", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "notification_preferences_user_idx"
ON "notification_preferences" ("user_id");
