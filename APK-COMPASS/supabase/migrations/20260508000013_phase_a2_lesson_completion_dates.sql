-- ============================================================
-- Phase A2.4 — Lesson completion timestamps (per-lesson)
-- Date: 2026-05-08
--
-- Dodaje do course_enrollments JSONB `lesson_completion_dates` mapujący
-- lessonId → ISO timestamp ukończenia. Używane do drip release gating
-- (czy user może wejść w lekcję X jeśli unlock_after_days > 0 od poprzedniej?).
--
-- Format: {"<uuid>": "2026-05-08T12:34:56Z", ...}
-- ============================================================

BEGIN;

ALTER TABLE course_enrollments
    ADD COLUMN IF NOT EXISTS lesson_completion_dates JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN course_enrollments.lesson_completion_dates IS
    'A2.4: JSONB map lessonId → ISO timestamp ukończenia. Używane do drip release gating.';

COMMIT;
