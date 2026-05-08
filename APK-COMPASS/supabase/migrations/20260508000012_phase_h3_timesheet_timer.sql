-- ============================================================
-- Phase H3.6 — Timesheet Timer (Beebole-style start/stop)
-- Date: 2026-05-08
--
-- Tabela `timesheet_timers` przechowuje aktywne i historyczne timery.
-- Reguły:
--   - Max 1 aktywny timer per user (started_at NOT NULL, stopped_at NULL)
--   - Po stop: zapisz hours, opcjonalnie konwertuj do timesheet_entry przez button
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS timesheet_timers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stopped_at TIMESTAMPTZ,
    work_date DATE NOT NULL DEFAULT CURRENT_DATE,
    project TEXT,
    description TEXT NOT NULL DEFAULT 'Praca standardowa',
    hours_calculated NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE
            WHEN stopped_at IS NULL THEN NULL
            ELSE ROUND(EXTRACT(EPOCH FROM (stopped_at - started_at))::numeric / 3600, 2)
        END
    ) STORED,
    /** Once converted to timesheet_entry, store ref */
    converted_entry_id UUID REFERENCES timesheet_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timesheet_timers_user ON timesheet_timers(user_id, started_at DESC);
-- Tylko 1 aktywny timer per user (stopped_at IS NULL):
CREATE UNIQUE INDEX IF NOT EXISTS idx_timesheet_timers_active
    ON timesheet_timers(user_id) WHERE stopped_at IS NULL;

ALTER TABLE timesheet_timers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "timesheet_timers_self_or_admin" ON timesheet_timers;
CREATE POLICY "timesheet_timers_self_or_admin" ON timesheet_timers
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

COMMIT;
