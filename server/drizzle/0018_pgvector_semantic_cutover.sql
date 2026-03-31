CREATE EXTENSION IF NOT EXISTS vector;

DO $$
DECLARE
  embedding_udt text;
  row_record record;
BEGIN
  IF to_regclass('public.search_documents') IS NULL THEN
    RAISE NOTICE 'search_documents table does not exist; skipping pgvector semantic cutover.';
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
          -- Keep malformed vectors null so migration can still complete safely.
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

CREATE INDEX IF NOT EXISTS "search_documents_embedding_ivfflat_idx"
ON "search_documents"
USING ivfflat ("embedding" vector_cosine_ops)
WITH (lists = 100)
WHERE "embedding" IS NOT NULL;
