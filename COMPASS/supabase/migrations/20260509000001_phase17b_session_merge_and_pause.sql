-- ============================================================
-- Phase 17b — PR-A1 — session merge (R2) + session pause (R3)
-- ============================================================
-- Adds two related capabilities to work_clock_sessions:
--
--   R2 (Idle resume modal): when a session was auto-closed by idle_timeout
--   and the user returns within 30 min, they get a 4-option dialog. If they
--   pick "Keep tracking (merge with previous)", the new session points back
--   at the closed one via merged_from_session_id (audit trail). The "Discard"
--   option marks the closed session as user_disregarded=true (soft mark; we
--   never DELETE — KP art. 94⁴ retention 5 years).
--
--   R3 (Pauza 30/60/120 min): user pauses tracking explicitly (DeskTime
--   "Private Time" pattern). paused_until = absolute timestamp when auto-resume
--   should fire. pause_reason classifies the pause kind. Heartbeats arriving
--   in the paused range are NOT counted toward active_seconds (computed in
--   lib/clock/aggregation.ts at read time).
--
-- Depends on:
--   - 20260508120000_phase17_work_clock.sql (work_clock_sessions table)
-- ============================================================

BEGIN;

-- ─── R2: Session merge audit + soft-disregard ──────────────────────────
ALTER TABLE work_clock_sessions
    ADD COLUMN IF NOT EXISTS merged_from_session_id UUID
        REFERENCES work_clock_sessions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS user_disregarded BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN work_clock_sessions.merged_from_session_id IS
    'Phase 17b R2. If user clicked "Keep tracking" after idle_timeout, this points to the previously closed session whose hours were merged into the current one.';
COMMENT ON COLUMN work_clock_sessions.user_disregarded IS
    'Phase 17b R2. TRUE if user explicitly chose "Discard" in idle resume dialog. Soft mark only — row is preserved for KP art. 94-4 retention.';

-- ─── R3: Session pause ──────────────────────────────────────────────────
ALTER TABLE work_clock_sessions
    ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pause_reason TEXT
        CHECK (pause_reason IS NULL OR pause_reason IN (
            'break_30', 'break_60', 'break_120', 'manual'
        ));

COMMENT ON COLUMN work_clock_sessions.paused_until IS
    'Phase 17b R3. Absolute timestamp when an explicit user pause auto-resumes. NULL = not paused. Heartbeats arriving in (pause_started, paused_until) are NOT counted.';
COMMENT ON COLUMN work_clock_sessions.pause_reason IS
    'Phase 17b R3. Classification of the pause: break_30/60/120 (preset durations) or manual (custom).';

-- Partial index on currently-paused sessions for quick "should-skip-in-reaper" lookup.
CREATE INDEX IF NOT EXISTS idx_clock_sessions_paused_active
    ON work_clock_sessions(paused_until)
    WHERE paused_until IS NOT NULL AND ended_at IS NULL;

-- ─── R3: Pause history (audit trail for aggregation) ───────────────────
-- Every pause+resume pair becomes a row here. aggregateHeartbeats reads this
-- to skip heartbeats that fell inside any paused range (multi-pause aware).
CREATE TABLE IF NOT EXISTS work_clock_session_pauses (
    id          BIGSERIAL PRIMARY KEY,
    session_id  UUID NOT NULL REFERENCES work_clock_sessions(id) ON DELETE CASCADE,
    paused_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resumed_at  TIMESTAMPTZ,
    pause_reason TEXT NOT NULL CHECK (pause_reason IN (
        'break_30', 'break_60', 'break_120', 'manual'
    )),
    created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT pause_resume_after_paused CHECK (resumed_at IS NULL OR resumed_at >= paused_at)
);

COMMENT ON TABLE work_clock_session_pauses IS
    'Phase 17b R3. Audit trail of pause+resume pairs per session. aggregateHeartbeats() reads this to skip heartbeats in paused ranges.';

CREATE INDEX IF NOT EXISTS idx_session_pauses_session
    ON work_clock_session_pauses(session_id, paused_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_one_open_pause_per_session
    ON work_clock_session_pauses(session_id) WHERE resumed_at IS NULL;

ALTER TABLE work_clock_session_pauses ENABLE ROW LEVEL SECURITY;

-- SELECT via parent session (same RLS as heartbeats)
DROP POLICY IF EXISTS "session_pauses_select_via_session" ON work_clock_session_pauses;
CREATE POLICY "session_pauses_select_via_session" ON work_clock_session_pauses
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM work_clock_sessions s
            WHERE s.id = work_clock_session_pauses.session_id
              AND (s.user_id = auth.uid() OR is_admin())
        )
    );

-- INSERT only into your own LIVE non-paused session
DROP POLICY IF EXISTS "session_pauses_insert_via_own_live_session" ON work_clock_session_pauses;
CREATE POLICY "session_pauses_insert_via_own_live_session" ON work_clock_session_pauses
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM work_clock_sessions s
            WHERE s.id = work_clock_session_pauses.session_id
              AND s.user_id = auth.uid()
              AND s.ended_at IS NULL
        )
    );

-- UPDATE only the open pause (resumed_at NULL → fill in resumed_at) on own session
DROP POLICY IF EXISTS "session_pauses_update_own_open" ON work_clock_session_pauses;
CREATE POLICY "session_pauses_update_own_open" ON work_clock_session_pauses
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM work_clock_sessions s
            WHERE s.id = work_clock_session_pauses.session_id
              AND s.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM work_clock_sessions s
            WHERE s.id = work_clock_session_pauses.session_id
              AND s.user_id = auth.uid()
        )
    );

COMMIT;
