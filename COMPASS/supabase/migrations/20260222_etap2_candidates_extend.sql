-- ETAP 2: Rozszerzenie tabeli candidates o mechanizm Kandydat/Konsultant
-- ROLLBACK: ALTER TABLE candidates DROP COLUMN IF EXISTS source, candidate_status, claimed_at, claimed_by, import_batch_id, cv_parsed, cv_parse_error, original_filename, cv_versions, raw_text;

-- Nowe kolumny
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'import'
    CHECK (source IN ('import', 'self_registration', 'referral'));

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS candidate_status TEXT DEFAULT 'kandydat'
    CHECK (candidate_status IN ('kandydat', 'konsultant', 'archived', 'duplicate', 'rejected'));

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES auth.users(id);

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS import_batch_id TEXT;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_parsed BOOLEAN DEFAULT FALSE;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_parse_error TEXT;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS original_filename TEXT;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_versions JSONB DEFAULT '[]'::jsonb;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS raw_text TEXT;

-- Ustaw domyslne wartosci dla istniejacych rekordow
UPDATE candidates
SET candidate_status = 'konsultant',
    source = 'self_registration'
WHERE user_id IS NOT NULL
AND candidate_status IS NULL;

UPDATE candidates
SET candidate_status = 'kandydat',
    source = 'import'
WHERE user_id IS NULL
AND candidate_status IS NULL;

-- Indeksy na nowe kolumny
CREATE INDEX IF NOT EXISTS idx_candidates_candidate_status ON candidates(candidate_status);
CREATE INDEX IF NOT EXISTS idx_candidates_source ON candidates(source);
CREATE INDEX IF NOT EXISTS idx_candidates_import_batch ON candidates(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_candidates_claimed_by ON candidates(claimed_by);
