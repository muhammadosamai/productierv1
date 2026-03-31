CREATE EXTENSION IF NOT EXISTS pg_trgm;

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
  "embedding" jsonb,
  "embedding_updated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "search_documents_entity_unique" UNIQUE("entity_type", "entity_id")
);

CREATE INDEX IF NOT EXISTS "search_documents_product_entity_idx"
ON "search_documents" ("product_id", "entity_type");

CREATE INDEX IF NOT EXISTS "search_documents_product_updated_idx"
ON "search_documents" ("product_id", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "search_documents_title_trgm_idx"
ON "search_documents" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "search_documents_text_trgm_idx"
ON "search_documents" USING gin ("searchable_text" gin_trgm_ops);
