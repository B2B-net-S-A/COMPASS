-- ==========================================
-- COMPASS ASSIST KNOWLEDGE BASE - COMPLETE SETUP
-- ==========================================
-- Run this in Supabase Dashboard → SQL Editor
-- This creates the knowledge base table + fixes RLS policies

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Knowledge Base Table
CREATE TABLE IF NOT EXISTS compass_assist_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    category TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create index for vector search
CREATE INDEX IF NOT EXISTS compass_assist_knowledge_embedding_idx
ON compass_assist_knowledge
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 4. RLS Policies (with corrected role check: 'admin' + 'administrator' + 'centrala')
ALTER TABLE compass_assist_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage knowledge" ON compass_assist_knowledge;
CREATE POLICY "Admins can manage knowledge" ON compass_assist_knowledge
FOR ALL TO authenticated
USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'administrator', 'centrala')
)
WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'administrator', 'centrala')
);

DROP POLICY IF EXISTS "Users can read knowledge" ON compass_assist_knowledge;
CREATE POLICY "Users can read knowledge" ON compass_assist_knowledge
FOR SELECT TO authenticated
USING (true);

-- 5. RPC Function for Knowledge Matching (RAG)
CREATE OR REPLACE FUNCTION match_assist_knowledge (
    query_embedding vector(1536),
    match_threshold float,
    match_count int,
    filter_category text DEFAULT NULL
) RETURNS TABLE (
    id uuid,
    content text,
    category text,
    metadata jsonb,
    similarity float
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT k.id, k.content, k.category, k.metadata,
           1 - (k.embedding <=> query_embedding) AS similarity
    FROM compass_assist_knowledge k
    WHERE (1 - (k.embedding <=> query_embedding) > match_threshold)
      AND (filter_category IS NULL OR k.category = filter_category)
    ORDER BY k.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
