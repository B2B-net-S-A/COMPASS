-- BUGFIX 4: Tabela import_batches (brakujaca tabela nadrzedna dla candidates.import_batch_id)

CREATE TABLE IF NOT EXISTS import_batches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    filename TEXT,
    total_files INT DEFAULT 0,
    processed INT DEFAULT 0,
    errors INT DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_log JSONB DEFAULT '[]'::jsonb,
    completed_at TIMESTAMPTZ
);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage import_batches" ON import_batches
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'administrator', 'centrala')
    )
);

-- FK constraint (optional, does not break existing data since import_batch_id can be NULL)
-- ALTER TABLE candidates ADD CONSTRAINT fk_candidates_import_batch
--     FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(status);
CREATE INDEX IF NOT EXISTS idx_import_batches_created_by ON import_batches(created_by);
