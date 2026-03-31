CREATE TABLE IF NOT EXISTS "metrics_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "endpoint" varchar(100) NOT NULL,
  "product_id" uuid NOT NULL,
  "period" integer,
  "granularity" varchar(30),
  "cache_key" varchar(255) NOT NULL,
  "payload" jsonb NOT NULL,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "invalidated" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "metrics_snapshots_cache_key_unique" UNIQUE("cache_key")
);

DO $$ BEGIN
  ALTER TABLE "metrics_snapshots"
    ADD CONSTRAINT "metrics_snapshots_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "metrics_snapshots_product_endpoint_idx"
ON "metrics_snapshots" ("product_id", "endpoint", "computed_at");

CREATE INDEX IF NOT EXISTS "metrics_snapshots_expires_idx"
ON "metrics_snapshots" ("expires_at");

CREATE INDEX IF NOT EXISTS "metrics_snapshots_product_invalidation_idx"
ON "metrics_snapshots" ("product_id", "invalidated", "expires_at");
