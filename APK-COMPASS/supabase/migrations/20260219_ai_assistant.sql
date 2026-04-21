-- ============================================================
-- AI Assistant - Logowanie pytań użytkowników
-- ============================================================

-- Tabela logów rozmów z AI Asystentem
CREATE TABLE IF NOT EXISTS ai_assistant_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_role TEXT NOT NULL DEFAULT 'consultant',
    current_page TEXT,                    -- na jakiej stronie był user gdy pytał
    question TEXT NOT NULL,               -- pytanie użytkownika
    answer TEXT,                          -- odpowiedź AI
    model TEXT DEFAULT 'gpt-4o-mini',     -- model użyty
    tokens_used INTEGER DEFAULT 0,        -- zużycie tokenów
    response_time_ms INTEGER DEFAULT 0,   -- czas odpowiedzi w ms
    helpful BOOLEAN,                      -- user feedback: czy odpowiedź pomogła
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_ai_assistant_logs_user ON ai_assistant_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_assistant_logs_created ON ai_assistant_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_assistant_logs_page ON ai_assistant_logs(current_page);
CREATE INDEX IF NOT EXISTS idx_ai_assistant_logs_helpful ON ai_assistant_logs(helpful) WHERE helpful IS NOT NULL;

-- RLS
ALTER TABLE ai_assistant_logs ENABLE ROW LEVEL SECURITY;

-- Użytkownik widzi tylko swoje logi
CREATE POLICY "Users can view own ai logs"
    ON ai_assistant_logs FOR SELECT
    USING (auth.uid() = user_id);

-- Użytkownik może dodawać swoje logi
CREATE POLICY "Users can insert own ai logs"
    ON ai_assistant_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Użytkownik może aktualizować feedback (helpful) na swoich logach
CREATE POLICY "Users can update own ai logs feedback"
    ON ai_assistant_logs FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Admin widzi wszystkie logi (do analizy)
CREATE POLICY "Admins can view all ai logs"
    ON ai_assistant_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'admin')
        )
    );
