-- ============================================================
-- Phase 17 — Smart Work Clock
-- ============================================================
-- Real-time work-time measurement with idle detection. Adds raw
-- evidence tables (sessions + heartbeats) plus consent (RODO/KP
-- art. 22³). Extends timesheet_entries with discrepancy tracking
-- so admins can approve corrections when declared hours diverge
-- from tracked hours.
--
-- Depends on:
--   - 20260212_project_referrals.sql (update_updated_at_column() helper)
--   - 20260504500001_phase15_rls_helpers_rewrite.sql (is_admin())
--   - 20260507120000_phase11a_internal_role_value.sql (enum has 'internal')
--   - 20260507120001_phase11b_hr_internal_schema.sql (is_internal_or_admin())
--
-- New objects:
--   tables:   work_clock_consents, work_clock_sessions, work_clock_heartbeats
--   view:     work_clock_daily
--   ALTER:    timesheet_entries (source, tracked_hours, correction_*)
-- ============================================================

BEGIN;

-- ─── 1. work_clock_consents ─────────────────────────────────────────────
-- RODO/KP art. 22³ §2: zgoda pracownika na monitoring czasu pracy.
-- Per-feature opt-in (osobno od um_user_consents — pozwala na cofnięcie
-- zgody na monitoring bez wpływu na ToS aplikacji).
CREATE TABLE IF NOT EXISTS work_clock_consents (
    user_id        UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    accepted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_ip    INET,
    accepted_ua    TEXT,
    terms_version  TEXT NOT NULL,
    revoked_at     TIMESTAMPTZ,
    revoked_reason TEXT
);

COMMENT ON TABLE work_clock_consents IS
    'Phase 17. RODO/KP art. 22³ §2 consent for work-time monitoring. revoked_at IS NULL = active consent.';

ALTER TABLE work_clock_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consents_select_own_or_admin" ON work_clock_consents;
CREATE POLICY "consents_select_own_or_admin" ON work_clock_consents
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "consents_insert_self" ON work_clock_consents;
CREATE POLICY "consents_insert_self" ON work_clock_consents
    FOR INSERT TO authenticated
    WITH CHECK (is_internal_or_admin() AND auth.uid() = user_id);

DROP POLICY IF EXISTS "consents_update_self" ON work_clock_consents;
CREATE POLICY "consents_update_self" ON work_clock_consents
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Brak DELETE policy — zgoda jest tylko revoked (soft delete via revoked_at).

-- ─── 2. work_clock_sessions ─────────────────────────────────────────────
-- Live + finished work sessions. active_seconds is a CACHE — true value
-- is SUM of heartbeats with was_active=true × 30s interval. Recalculated
-- on session close + on each getActiveClockSession() read.
CREATE TABLE IF NOT EXISTS work_clock_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ,
    last_heartbeat  TIMESTAMPTZ NOT NULL,
    active_seconds  INTEGER NOT NULL DEFAULT 0,
    idle_seconds    INTEGER NOT NULL DEFAULT 0,
    closed_reason   TEXT CHECK (closed_reason IN (
                       'manual', 'idle_timeout', 'daily_cutoff',
                       'sleep_detected', 'taken_over', 'admin_close'
                    )),
    device_label    TEXT,
    client_tz       TEXT NOT NULL DEFAULT 'Europe/Warsaw',
    location        TEXT NOT NULL CHECK (location IN ('onsite', 'remote')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT clock_session_end_after_start CHECK (
        ended_at IS NULL OR ended_at >= started_at
    ),
    CONSTRAINT clock_session_closed_reason_when_ended CHECK (
        (ended_at IS NULL AND closed_reason IS NULL)
        OR (ended_at IS NOT NULL AND closed_reason IS NOT NULL)
    )
);

COMMENT ON TABLE work_clock_sessions IS
    'Phase 17. Work-time sessions. KP art. 94⁴ retention: 5 years.';
COMMENT ON COLUMN work_clock_sessions.active_seconds IS
    'CACHE column. Source of truth = SUM heartbeats. Recalculated server-side on read/close.';

-- Only ONE live session per user (multi-tab safe via partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_one_live_session_per_user
    ON work_clock_sessions(user_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clock_sessions_user_started
    ON work_clock_sessions(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_clock_sessions_live
    ON work_clock_sessions(last_heartbeat) WHERE ended_at IS NULL;

DROP TRIGGER IF EXISTS work_clock_sessions_updated_at ON work_clock_sessions;
CREATE TRIGGER work_clock_sessions_updated_at BEFORE UPDATE ON work_clock_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE work_clock_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_select_own_or_admin" ON work_clock_sessions;
CREATE POLICY "sessions_select_own_or_admin" ON work_clock_sessions
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "sessions_insert_self" ON work_clock_sessions;
CREATE POLICY "sessions_insert_self" ON work_clock_sessions
    FOR INSERT TO authenticated
    WITH CHECK (
        is_internal_or_admin()
        AND auth.uid() = user_id
    );

-- UPDATE only on user's own LIVE session — blocks edits to closed sessions.
-- Cron reaper + admin overrides go through service client (bypasses RLS).
DROP POLICY IF EXISTS "sessions_update_own_live" ON work_clock_sessions;
CREATE POLICY "sessions_update_own_live" ON work_clock_sessions
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- No DELETE policy — sessions are immutable audit trail (KP retention 5y).

-- ─── 3. work_clock_heartbeats ───────────────────────────────────────────
-- Audit-grade evidence. Source of truth for active_seconds aggregation.
-- Insert idempotency via UNIQUE(session_id, ts) — replay of same ts no-ops.
CREATE TABLE IF NOT EXISTS work_clock_heartbeats (
    id            BIGSERIAL PRIMARY KEY,
    session_id    UUID NOT NULL REFERENCES work_clock_sessions(id) ON DELETE CASCADE,
    ts            TIMESTAMPTZ NOT NULL,
    was_active    BOOLEAN NOT NULL,
    page_visible  BOOLEAN NOT NULL DEFAULT TRUE,
    is_trusted    BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(session_id, ts)
);

COMMENT ON TABLE work_clock_heartbeats IS
    'Phase 17. Append-only activity probes (every ~30s). Privacy: zero PII (no URL, no DOM, no content).';
COMMENT ON COLUMN work_clock_heartbeats.is_trusted IS
    'MouseEvent.isTrusted = false flags programmatic events (devtools spoof). Not blocking, but audited.';

CREATE INDEX IF NOT EXISTS idx_heartbeats_session_ts
    ON work_clock_heartbeats(session_id, ts DESC);

ALTER TABLE work_clock_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "heartbeats_select_via_session" ON work_clock_heartbeats;
CREATE POLICY "heartbeats_select_via_session" ON work_clock_heartbeats
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM work_clock_sessions s
            WHERE s.id = work_clock_heartbeats.session_id
              AND (s.user_id = auth.uid() OR is_admin())
        )
    );

-- INSERT only into your own LIVE session.
DROP POLICY IF EXISTS "heartbeats_insert_via_own_live_session" ON work_clock_heartbeats;
CREATE POLICY "heartbeats_insert_via_own_live_session" ON work_clock_heartbeats
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM work_clock_sessions s
            WHERE s.id = work_clock_heartbeats.session_id
              AND s.user_id = auth.uid()
              AND s.ended_at IS NULL
        )
    );

-- No UPDATE / DELETE — append-only audit trail.

-- ─── 4. work_clock_daily view ───────────────────────────────────────────
-- Daily aggregation per user × work_date. Uses session.client_tz to bucket
-- correctly across DST. Sessions crossing midnight are bucketed by start
-- date (acceptable simplification for HR-internal use; deep-night shift
-- workers are out of scope for Phase 17 MVP).
CREATE OR REPLACE VIEW work_clock_daily AS
SELECT
    s.user_id,
    (s.started_at AT TIME ZONE s.client_tz)::date AS work_date,
    SUM(s.active_seconds)::INTEGER AS active_seconds,
    ROUND(SUM(s.active_seconds)::NUMERIC / 3600.0, 2) AS hours,
    MIN(s.started_at) AS first_clock_in,
    MAX(s.ended_at) AS last_clock_out,
    COUNT(*)::INTEGER AS session_count
FROM work_clock_sessions s
WHERE s.ended_at IS NOT NULL
GROUP BY s.user_id, (s.started_at AT TIME ZONE s.client_tz)::date;

COMMENT ON VIEW work_clock_daily IS
    'Phase 17. Per-user × work_date aggregation of finished sessions. Used by suggestTimesheetEntriesFromClock.';

-- View inherits RLS from base table work_clock_sessions automatically.

-- ─── 5. timesheet_entries extension ─────────────────────────────────────
-- Discrepancy tracking: when user accepts a clock_suggested entry and then
-- edits hours away from tracked_hours by > 1h, set correction_required=true.
-- Admin reviews via AdminClockReviewPanel and approves/rejects.
ALTER TABLE timesheet_entries
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'clock_suggested', 'clock_accepted')),
    ADD COLUMN IF NOT EXISTS tracked_hours NUMERIC(4, 2),
    ADD COLUMN IF NOT EXISTS correction_required BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS correction_decided_by UUID
        REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS correction_decided_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS correction_decision_note TEXT;

COMMENT ON COLUMN timesheet_entries.source IS
    'Phase 17. manual = user typed; clock_suggested = generated from work_clock_daily; clock_accepted = user kept the suggestion.';
COMMENT ON COLUMN timesheet_entries.tracked_hours IS
    'Phase 17. Snapshot of work_clock_daily.hours at suggestion time (for discrepancy detection).';
COMMENT ON COLUMN timesheet_entries.correction_required IS
    'Phase 17. TRUE when |hours - tracked_hours| > 1.0 OR hours > 13 (KP art. 129). Admin must approve/reject.';

-- Partial index — only flagged rows (small set, cheap).
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_correction_required
    ON timesheet_entries(correction_required) WHERE correction_required = TRUE;

-- ─── 6. audit_logs.action — comment for new Phase 17 actions ────────────
-- audit_logs.action is TEXT (no CHECK constraint). Server actions will write:
--   'WORK_CLOCK_CONSENT_ACCEPTED', 'WORK_CLOCK_CONSENT_REVOKED',
--   'WORK_CLOCK_STARTED', 'WORK_CLOCK_STOPPED', 'WORK_CLOCK_AUTO_STOPPED',
--   'WORK_CLOCK_TRANSFERRED', 'WORK_CLOCK_TAMPERED',
--   'TIMESHEET_CORRECTION_APPROVED', 'TIMESHEET_CORRECTION_REJECTED'
-- No DDL needed.

COMMIT;
