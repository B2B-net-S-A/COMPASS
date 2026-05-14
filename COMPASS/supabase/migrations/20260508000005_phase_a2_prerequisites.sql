-- ============================================================
-- Phase A2.2 — Course Prerequisites (wymagania wstępne)
-- Date: 2026-05-08
--
-- Dodaje do courses:
--   - prerequisite_course_ids: UUID[] (lista kursów które user musi zaliczyć przed enrollment)
--
-- Walidacja w server action `enrollInCourse` — zwraca błąd "Brakuje wymaganych kursów: X, Y".
-- Idempotent: ADD COLUMN IF NOT EXISTS guarded.
-- ============================================================

BEGIN;

ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS prerequisite_course_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN courses.prerequisite_course_ids IS
    'A2.2: Lista UUID kursów wymaganych przed zapisem na ten kurs. Pusty = brak wymagań.';

COMMIT;
