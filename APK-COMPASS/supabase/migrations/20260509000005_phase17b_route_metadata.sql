-- ============================================================
-- Phase 17b — PR-C2 — R12: route metadata for AI timeline
-- ============================================================
-- Phase 17 (PR #54) tracks just heartbeats (was_active boolean every 30s).
-- That's enough for total active hours but doesn't tell us WHAT user was
-- doing. R12 adds route_path collection so we can cluster activity into
-- meaningful blocks ("9:00-10:30 — Akademia + Dashboard").
--
-- Privacy:
--   - OPT-IN per session via consent dialog v3 (separate from base monitoring)
--   - Only Compass-internal route paths (e.g. /internal/akademia/lessons/abc),
--     NEVER external URLs, NEVER query params with PII
--   - 30-day retention (vs 5y for sessions) — RODO minimization
--
-- Schema:
--   work_clock_route_metadata (session_id, ts_bucket_5min, route_path, page_title)
--   UNIQUE(session_id, ts_bucket_5min, route_path) — one row per 5-min slot per route
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS work_clock_route_metadata (
    id              BIGSERIAL PRIMARY KEY,
    session_id      UUID NOT NULL REFERENCES work_clock_sessions(id) ON DELETE CASCADE,
    ts_bucket_5min  TIMESTAMPTZ NOT NULL,
    route_path      TEXT NOT NULL,
    page_title      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, ts_bucket_5min, route_path)
);

COMMENT ON TABLE work_clock_route_metadata IS
    'Phase 17b R12. Opt-in per session: tracks Compass-internal route paths in 5-min buckets for AI timeline clustering. 30-day retention.';
COMMENT ON COLUMN work_clock_route_metadata.route_path IS
    'Compass route path only (e.g. /internal/akademia/lessons/abc). NO external URLs, NO query params with PII.';

CREATE INDEX IF NOT EXISTS idx_route_metadata_session_bucket
    ON work_clock_route_metadata(session_id, ts_bucket_5min);

CREATE INDEX IF NOT EXISTS idx_route_metadata_retention
    ON work_clock_route_metadata(ts_bucket_5min)
    WHERE ts_bucket_5min IS NOT NULL;

ALTER TABLE work_clock_route_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "route_metadata_select_via_session" ON work_clock_route_metadata;
CREATE POLICY "route_metadata_select_via_session" ON work_clock_route_metadata
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM work_clock_sessions s
            WHERE s.id = work_clock_route_metadata.session_id
              AND (s.user_id = auth.uid() OR is_admin())
        )
    );

DROP POLICY IF EXISTS "route_metadata_insert_via_own_live_session" ON work_clock_route_metadata;
CREATE POLICY "route_metadata_insert_via_own_live_session" ON work_clock_route_metadata
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM work_clock_sessions s
            WHERE s.id = work_clock_route_metadata.session_id
              AND s.user_id = auth.uid()
              AND s.ended_at IS NULL
        )
    );

-- DELETE: only own data, used by user "delete my route metadata for day X"
DROP POLICY IF EXISTS "route_metadata_delete_own" ON work_clock_route_metadata;
CREATE POLICY "route_metadata_delete_own" ON work_clock_route_metadata
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM work_clock_sessions s
            WHERE s.id = work_clock_route_metadata.session_id
              AND s.user_id = auth.uid()
        )
    );

-- Per-user opt-in flag (stored on session because it's per-session decision)
ALTER TABLE work_clock_sessions
    ADD COLUMN IF NOT EXISTS route_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN work_clock_sessions.route_tracking_enabled IS
    'Phase 17b R12. Opt-in flag: TRUE if user accepted timeline tracking at session start (consent v3+).';

COMMIT;
