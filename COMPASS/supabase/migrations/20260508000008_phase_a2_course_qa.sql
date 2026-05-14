-- ============================================================
-- Phase A2.3 — Q&A Forum per kurs
-- Date: 2026-05-08
--
-- Studenci zadają pytania pod lekcjami, autor (lub admin) odpowiada.
-- Tabele:
--   - course_questions (per-lesson lub per-course)
--   - course_answers (multiple per question)
--
-- Loyalty rule:
--   - course_question_asked: 5 pkt (encourage engagement)
--   - course_answer_given (autor odpowiada): 15 pkt
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS course_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES course_lessons(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL CHECK (length(question_text) BETWEEN 10 AND 2000),
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    answers_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_questions_course ON course_questions(course_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_questions_lesson ON course_questions(lesson_id) WHERE lesson_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_course_questions_unresolved ON course_questions(course_id, is_resolved) WHERE is_resolved = FALSE;

CREATE TABLE IF NOT EXISTS course_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES course_questions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    answer_text TEXT NOT NULL CHECK (length(answer_text) BETWEEN 5 AND 5000),
    is_author_answer BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_answers_question ON course_answers(question_id, created_at);
CREATE INDEX IF NOT EXISTS idx_course_answers_user ON course_answers(user_id);

-- RLS
ALTER TABLE course_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_questions_select" ON course_questions;
CREATE POLICY "course_questions_select" ON course_questions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = course_id
            AND (c.status = 'published' OR c.author_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

DROP POLICY IF EXISTS "course_questions_insert" ON course_questions;
CREATE POLICY "course_questions_insert" ON course_questions
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND c.status = 'published')
    );

DROP POLICY IF EXISTS "course_questions_update_own_or_admin" ON course_questions;
CREATE POLICY "course_questions_update_own_or_admin" ON course_questions
    FOR UPDATE TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND c.author_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "course_questions_delete_own_or_admin" ON course_questions;
CREATE POLICY "course_questions_delete_own_or_admin" ON course_questions
    FOR DELETE TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "course_answers_select" ON course_answers;
CREATE POLICY "course_answers_select" ON course_answers
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM course_questions q
            JOIN courses c ON c.id = q.course_id
            WHERE q.id = question_id
            AND (c.status = 'published' OR c.author_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

DROP POLICY IF EXISTS "course_answers_insert" ON course_answers;
CREATE POLICY "course_answers_insert" ON course_answers
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "course_answers_update_delete_own_or_admin" ON course_answers;
CREATE POLICY "course_answers_update_delete_own_or_admin" ON course_answers
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION trg_course_qa_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS course_questions_updated_at ON course_questions;
CREATE TRIGGER course_questions_updated_at BEFORE UPDATE ON course_questions
    FOR EACH ROW EXECUTE FUNCTION trg_course_qa_updated_at();

DROP TRIGGER IF EXISTS course_answers_updated_at ON course_answers;
CREATE TRIGGER course_answers_updated_at BEFORE UPDATE ON course_answers
    FOR EACH ROW EXECUTE FUNCTION trg_course_qa_updated_at();

-- Trigger: bump answers_count
CREATE OR REPLACE FUNCTION trg_course_answers_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE course_questions SET answers_count = answers_count + 1 WHERE id = NEW.question_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE course_questions SET answers_count = GREATEST(0, answers_count - 1) WHERE id = OLD.question_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS course_answers_count ON course_answers;
CREATE TRIGGER course_answers_count
    AFTER INSERT OR DELETE ON course_answers
    FOR EACH ROW EXECUTE FUNCTION trg_course_answers_count();

-- Loyalty rules
INSERT INTO loyalty_rules (code, name, description, points, category, is_active, created_at, updated_at)
VALUES
    ('course_question_asked', 'Pytanie w Akademii', 'Bonus za zaangażowanie w forum kursu', 5, 'Development', TRUE, NOW(), NOW()),
    ('course_answer_given', 'Odpowiedź autora', 'Bonus dla autora kursu za odpowiedź na pytanie studenta', 15, 'Development', TRUE, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
    points = EXCLUDED.points,
    description = EXCLUDED.description,
    name = EXCLUDED.name,
    updated_at = NOW();

COMMIT;
