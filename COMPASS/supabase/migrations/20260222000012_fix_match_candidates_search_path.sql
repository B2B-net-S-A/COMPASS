-- Fix match_candidates function search_path
-- The original function had search_path SET TO 'public, extensions' (single-quoted string),
-- which PostgreSQL interpreted as ONE schema named "public, extensions" instead of two separate schemas.
-- This caused: "operator does not exist: extensions.vector <=> extensions.vector"
-- because the <=> operator (pgvector) lives in the extensions schema and wasn't reachable.

CREATE OR REPLACE FUNCTION public.match_candidates(
  query_embedding vector,
  match_threshold double precision,
  match_count integer
)
RETURNS TABLE(id uuid, full_name text, avatar_url text, job_title text, similarity double precision)
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.full_name,
    c.avatar_url,
    c.current_status AS job_title,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.candidates c
  WHERE 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
