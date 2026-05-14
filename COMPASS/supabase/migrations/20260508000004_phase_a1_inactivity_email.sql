-- ============================================================
-- Phase A1.5 — Course Progress Notifications (3-day inactivity email)
-- Date: 2026-05-08
--
-- Dodaje do course_enrollments:
--   - last_inactivity_email_at: TIMESTAMPTZ (kiedy ostatni reminder wysłany)
--
-- Idempotent: ADD COLUMN IF NOT EXISTS guarded.
-- Anty-spam: cron sprawdza > 7 dni od ostatniego emaila.
-- ============================================================

BEGIN;

ALTER TABLE course_enrollments
    ADD COLUMN IF NOT EXISTS last_inactivity_email_at TIMESTAMPTZ;

COMMENT ON COLUMN course_enrollments.last_inactivity_email_at IS
    'A1.5: Timestamp ostatniego emaila reminderowego (anty-spam: max 1 email / 7 dni).';

COMMIT;
