ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "metrics_overload_wip_threshold" integer NOT NULL DEFAULT 5;