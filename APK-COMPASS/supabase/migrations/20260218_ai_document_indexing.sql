-- ============================================================
-- AI Document Indexing: text_content + full-text search
-- Pozwala Asystentowi AI przeszukiwać treść dokumentów
-- ============================================================

-- 1. Dodaj kolumny do app_documents
ALTER TABLE app_documents
ADD COLUMN IF NOT EXISTS text_content TEXT,
ADD COLUMN IF NOT EXISTS ai_indexed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_indexed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Full-text search index (GIN) na text_content
CREATE INDEX IF NOT EXISTS idx_app_documents_text_search
ON app_documents USING GIN (to_tsvector('polish', COALESCE(text_content, '') || ' ' || COALESCE(title, '') || ' ' || COALESCE(description, '')));

-- 3. Indeks na kategorii + is_archived (szybkie filtrowanie)
CREATE INDEX IF NOT EXISTS idx_app_documents_category_active
ON app_documents (category, is_archived) WHERE is_archived = false;

-- 4. Funkcja full-text search do użycia przez AI Assistant
CREATE OR REPLACE FUNCTION search_documents_for_ai(
    search_query TEXT,
    user_role TEXT DEFAULT 'consultant',
    max_results INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    category TEXT,
    description TEXT,
    text_content TEXT,
    owner_id UUID,
    is_public BOOLEAN,
    relevance REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.title,
        d.category,
        d.description,
        LEFT(d.text_content, 2000) AS text_content,  -- max 2000 znaków na dokument
        d.owner_id,
        d.is_public,
        ts_rank(
            to_tsvector('polish', COALESCE(d.text_content, '') || ' ' || COALESCE(d.title, '') || ' ' || COALESCE(d.description, '')),
            plainto_tsquery('polish', search_query)
        ) AS relevance
    FROM app_documents d
    WHERE d.is_archived = false
        AND d.text_content IS NOT NULL
        AND (
            d.is_public = true
            OR user_role IN ('admin', 'administrator', 'centrala')
        )
        AND to_tsvector('polish', COALESCE(d.text_content, '') || ' ' || COALESCE(d.title, '') || ' ' || COALESCE(d.description, ''))
            @@ plainto_tsquery('polish', search_query)
    ORDER BY relevance DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Weryfikacja
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_documents' AND column_name = 'text_content') THEN
        RAISE NOTICE '✅ app_documents.text_content — OK';
    ELSE
        RAISE NOTICE '❌ app_documents.text_content — BRAK';
    END IF;
END $$;
