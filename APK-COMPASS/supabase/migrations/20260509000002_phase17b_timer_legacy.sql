-- ============================================================
-- Phase 17b — PR-A2 — R5: deprecate timesheet_timers (PR #50)
-- ============================================================
-- The H3.6 TimesheetTimerWidget (Beebole-style start/stop without idle
-- detection) is replaced by the Smart Work Clock (Phase 17). Existing data
-- is preserved (5y retention is irrelevant for this — but consistency with
-- work_clock_sessions retention policy). We mark all timers as deprecated
-- and auto-close any pending live timers.
-- ============================================================

BEGIN;

-- Add deprecation marker for new rows that should not be created.
ALTER TABLE timesheet_timers
    ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN timesheet_timers.deprecated_at IS
    'Phase 17b R5. Marker that timesheet_timers is deprecated in favor of work_clock_sessions. New rows should not be created.';

-- Auto-close any live (started, not stopped) timers — they are no longer
-- writable through the UI after this migration.
UPDATE timesheet_timers
   SET stopped_at = NOW()
 WHERE stopped_at IS NULL;

COMMIT;
