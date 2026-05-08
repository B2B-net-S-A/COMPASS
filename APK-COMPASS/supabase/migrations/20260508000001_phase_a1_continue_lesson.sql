-- ============================================================
-- Phase A1.1 — Continue lesson tracking ("Wróć tam gdzie skończyłeś")
-- Date: 2026-05-08
--
-- Dodaje do course_enrollments:
--   - last_accessed_lesson_id: FK → course_lessons.id (ON DELETE SET NULL)
--   - last_accessed_at: TIMESTAMPTZ
--
-- Index po (user_id, last_accessed_at DESC) dla aktywnych kursów (completed_at IS NULL),
-- używany przez "Continue learning" widget na /home.
-- Idempotent: ADD COLUMN IF NOT EXISTS guarded.
-- ============================================================

BEGIN;

ALTER TABLE course_enrollments
    ADD COLUMN IF NOT EXISTS last_accessed_lesson_id UUID REFERENCES course_lessons(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_course_enrollments_continue
    ON course_enrollments(user_id, last_accessed_at DESC NULLS LAST)
    WHERE completed_at IS NULL;

COMMENT ON COLUMN course_enrollments.last_accessed_lesson_id IS
    'Ostatnio odwiedzona lekcja dla "Kontynuuj naukę" (A1.1). NULL gdy user nigdy nie wszedł.';
COMMENT ON COLUMN course_enrollments.last_accessed_at IS
    'Timestamp ostatniej wizyty w jakiejkolwiek lekcji tego kursu (A1.1).';

COMMIT;
