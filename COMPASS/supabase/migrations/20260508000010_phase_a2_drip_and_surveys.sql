-- ============================================================
-- Phase A2.4 + A2.5 — Drip Release + Post-Course Surveys
-- Date: 2026-05-08
--
-- A2.4 Drip release:
--   - course_lessons.unlock_after_days: INT (gdy >0, lekcja odblokowuje się X dni po
--     ukończeniu poprzedniej lekcji w course'ie)
--
-- A2.5 Surveys:
--   - course_survey_responses (per user/course): 3-5 pytań po ukończeniu kursu
-- ============================================================

BEGIN;

-- A2.4: Drip release
ALTER TABLE course_lessons
    ADD COLUMN IF NOT EXISTS unlock_after_days INTEGER NOT NULL DEFAULT 0 CHECK (unlock_after_days >= 0);

COMMENT ON COLUMN course_lessons.unlock_after_days IS
    'A2.4: Liczba dni po ukończeniu poprzedniej lekcji do odblokowania tej. 0 = od razu.';

-- A2.5: Post-course survey
CREATE TABLE IF NOT EXISTS course_survey_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrollment_id UUID NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
    -- 3 standardowe pytania (NPS-like skala 1-10 + 2 textowe)
    nps_score INTEGER CHECK (nps_score BETWEEN 1 AND 10),
    -- "Co było najlepsze?" (text, 0-1000 znaków)
    best_part TEXT CHECK (best_part IS NULL OR length(best_part) <= 1000),
    -- "Co byś zmienił?" (text, 0-1000 znaków)
    improvement_suggestion TEXT CHECK (improvement_suggestion IS NULL OR length(improvement_suggestion) <= 1000),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_surveys_course ON course_survey_responses(course_id);
CREATE INDEX IF NOT EXISTS idx_course_surveys_user ON course_survey_responses(user_id);

ALTER TABLE course_survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_surveys_self_or_admin_or_author" ON course_survey_responses;
CREATE POLICY "course_surveys_self_or_admin_or_author" ON course_survey_responses
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
        OR EXISTS (SELECT 1 FROM courses WHERE id = course_id AND author_id = auth.uid())
    );

DROP POLICY IF EXISTS "course_surveys_insert_own" ON course_survey_responses;
CREATE POLICY "course_surveys_insert_own" ON course_survey_responses
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

COMMIT;
