-- ============================================================
-- Phase 17b — PR-B — R8: timesheet auto-fill default
-- ============================================================
-- Auto-fill timesheet from work_clock_daily becomes the default flow:
-- when user opens an empty draft timesheet, system auto-suggests entries
-- and shows "Draft gotowy — zatwierdź lub edytuj" banner.
--
-- Two flags on timesheets:
--   auto_filled_at: idempotency marker — set after first auto-fill
--   user_cleared_auto_fill: user explicitly chose "Wyczyść" — don't regenerate
-- ============================================================

BEGIN;

ALTER TABLE timesheets
    ADD COLUMN IF NOT EXISTS auto_filled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS user_cleared_auto_fill BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN timesheets.auto_filled_at IS
    'Phase 17b R8. Timestamp of first auto-fill from work_clock_daily. NULL = never auto-filled. Used for idempotency.';
COMMENT ON COLUMN timesheets.user_cleared_auto_fill IS
    'Phase 17b R8. TRUE if user explicitly cleared auto-fill — system will not regenerate.';

COMMIT;
