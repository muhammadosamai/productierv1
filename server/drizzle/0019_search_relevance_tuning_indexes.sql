CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "search_documents_title_lower_trgm_idx"
ON "search_documents"
USING gin (lower("title") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "search_documents_text_lower_trgm_idx"
ON "search_documents"
USING gin (lower("searchable_text") gin_trgm_ops);
