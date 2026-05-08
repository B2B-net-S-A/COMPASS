-- ============================================================
-- Phase A3.1 + A3.5 — Course Embeddings (rekomendacje + semantic search)
-- Date: 2026-05-08
--
-- Dodaje do courses:
--   - embedding: vector(1024) (Voyage 3-large, jak match_candidates)
--   - embedding_generated_at: TIMESTAMPTZ
--
-- RPC `match_courses(query_embedding, threshold, count)` — cosine similarity.
-- HNSW index na embedding dla szybkiego ANN search.
-- ============================================================

BEGIN;

-- pgvector extension (jeśli nie istnieje — z migracji wcześniejszej)
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS embedding vector(1024),
    ADD COLUMN IF NOT EXISTS embedding_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_courses_embedding_hnsw
    ON courses USING hnsw (embedding vector_cosine_ops);

COMMENT ON COLUMN courses.embedding IS
    'A3.1: Voyage 3-large 1024-dim embedding of (title + description + tags + lessons summary).';
COMMENT ON COLUMN courses.embedding_generated_at IS
    'A3.1: Timestamp ostatniej generacji embedding. NULL = nigdy nie wygenerowane lub stale.';

-- RPC dla similarity search
CREATE OR REPLACE FUNCTION match_courses(
    query_embedding vector(1024),
    match_threshold FLOAT DEFAULT 0.3,
    match_count INT DEFAULT 12
)
RETURNS TABLE (
    course_id UUID,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id AS course_id,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM courses c
    WHERE c.status = 'published'
      AND c.embedding IS NOT NULL
      AND (1 - (c.embedding <=> query_embedding)) > match_threshold
    ORDER BY c.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;

COMMIT;
