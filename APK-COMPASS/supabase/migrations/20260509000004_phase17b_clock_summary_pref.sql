-- ============================================================
-- Phase 17b — PR-C1 — R11: daily personal summary email opt-out
-- ============================================================
-- Per-user preference for receiving the daily clock summary email.
-- Default TRUE for internal/admin users (most useful for them).
-- Consultants don't have work clock at all, so the column is irrelevant for them.
-- ============================================================

BEGIN;

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS clock_daily_summary_email BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN profiles.clock_daily_summary_email IS
    'Phase 17b R11. User preference: receive daily clock summary email (Mon-Fri 6:00 UTC). Only relevant for internal/admin roles.';

COMMIT;
