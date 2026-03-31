CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "role_permissions"
ADD COLUMN IF NOT EXISTS "can_delete" boolean NOT NULL DEFAULT false;

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

CREATE TABLE IF NOT EXISTS "search_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "entity_type" varchar(64) NOT NULL,
  "entity_id" uuid NOT NULL,
  "page_key" varchar(64) NOT NULL,
  "title" text NOT NULL,
  "subtitle" text,
  "description" text,
  "searchable_text" text NOT NULL,
  "route_path" varchar(512) NOT NULL,
  "metadata" jsonb,
  "embedding" vector(1536),
  "embedding_updated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "search_documents_entity_unique" UNIQUE("entity_type", "entity_id")
);

DO $$
DECLARE
  embedding_udt text;
  row_record record;
BEGIN
  IF to_regclass('public.search_documents') IS NULL THEN
    RETURN;
  END IF;

  SELECT c.udt_name
  INTO embedding_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'search_documents'
    AND c.column_name = 'embedding'
  LIMIT 1;

  IF embedding_udt IS NULL THEN
    EXECUTE 'ALTER TABLE public.search_documents ADD COLUMN embedding vector(1536)';
  ELSIF embedding_udt = 'jsonb' THEN
    EXECUTE 'ALTER TABLE public.search_documents ADD COLUMN embedding_v2 vector(1536)';

    FOR row_record IN
      SELECT id, embedding
      FROM public.search_documents
      WHERE embedding IS NOT NULL
    LOOP
      BEGIN
        IF jsonb_typeof(row_record.embedding) = 'array'
          AND jsonb_array_length(row_record.embedding) = 1536 THEN
          UPDATE public.search_documents
          SET embedding_v2 = translate(row_record.embedding::text, ' ', '')::vector(1536)
          WHERE id = row_record.id;
        END IF;
      EXCEPTION
        WHEN others THEN
          NULL;
      END;
    END LOOP;

    EXECUTE 'ALTER TABLE public.search_documents DROP COLUMN embedding';
    EXECUTE 'ALTER TABLE public.search_documents RENAME COLUMN embedding_v2 TO embedding';
  ELSIF embedding_udt <> 'vector' THEN
    EXECUTE 'ALTER TABLE public.search_documents ALTER COLUMN embedding TYPE vector(1536) USING embedding::text::vector(1536)';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "search_documents_product_entity_idx"
ON "search_documents" ("product_id", "entity_type");

CREATE INDEX IF NOT EXISTS "search_documents_product_updated_idx"
ON "search_documents" ("product_id", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "search_documents_title_trgm_idx"
ON "search_documents" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "search_documents_text_trgm_idx"
ON "search_documents" USING gin ("searchable_text" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "search_documents_embedding_ivfflat_idx"
ON "search_documents"
USING ivfflat ("embedding" vector_cosine_ops)
WITH (lists = 100)
WHERE "embedding" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "search_documents_title_lower_trgm_idx"
ON "search_documents"
USING gin (lower("title") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "search_documents_text_lower_trgm_idx"
ON "search_documents"
USING gin (lower("searchable_text") gin_trgm_ops);
