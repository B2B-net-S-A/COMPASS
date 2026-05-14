-- ETAP 3: Indeksy wydajnosciowe + onboarding_completed + search_vector
-- ROLLBACK: DROP INDEX IF EXISTS idx_candidates_embedding_hnsw, idx_candidates_search, idx_candidates_full_name;
--           ALTER TABLE profiles DROP COLUMN IF EXISTS onboarding_completed;
--           ALTER TABLE candidates DROP COLUMN IF EXISTS search_vector;
--           DROP FUNCTION IF EXISTS candidates_search_vector_update();
--           DROP TRIGGER IF EXISTS update_candidates_search_vector ON candidates;

-- 1. Indeks HNSW na embeddingi (krytyczne dla 50K wektorow)
CREATE INDEX IF NOT EXISTS idx_candidates_embedding_hnsw
ON candidates USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 2. Full-text search vector (trigger-based, bo array_to_string nie jest immutable)
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION candidates_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('simple',
        COALESCE(NEW.full_name, '') || ' ' ||
        COALESCE(NEW.bio, '') || ' ' ||
        COALESCE(NEW.email, '') || ' ' ||
        array_to_string(COALESCE(NEW.skills, '{}'), ' ')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_candidates_search_vector ON candidates;
CREATE TRIGGER update_candidates_search_vector
BEFORE INSERT OR UPDATE ON candidates
FOR EACH ROW EXECUTE FUNCTION candidates_search_vector_update();

-- Wypelnij search_vector dla istniejacych rekordow
UPDATE candidates SET search_vector = to_tsvector('simple',
    COALESCE(full_name, '') || ' ' ||
    COALESCE(bio, '') || ' ' ||
    COALESCE(email, '') || ' ' ||
    array_to_string(COALESCE(skills, '{}'), ' ')
);

CREATE INDEX IF NOT EXISTS idx_candidates_search ON candidates USING gin(search_vector);

-- 3. B-tree indeks na full_name (szybkie wyszukiwanie po nazwisku)
CREATE INDEX IF NOT EXISTS idx_candidates_full_name ON candidates(full_name);

-- 4. Kolumna onboarding_completed w profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Ustaw onboarding_completed = TRUE dla istniejacych adminow/centrali i konsultantow z CV
UPDATE profiles
SET onboarding_completed = TRUE
WHERE role IN ('administrator', 'admin', 'centrala')
   OR cv_url IS NOT NULL;
