-- ============================================================
-- Migration: LMS „Akademia"
-- Date: 2026-04-29
-- Purpose: Learning Management System — konsultanci tworzą i odbywają
--   szkolenia, autor zarabia punkty lojalnościowe gdy ktoś ukończy.
--
-- Tables:
--   courses, course_lessons, course_quiz_questions, course_quiz_options,
--   course_enrollments, course_quiz_attempts, course_ratings
--
-- Triggers:
--   update_course_ratings_stats — recalc avg_rating / ratings_count
--   update_course_enrollment_stats — recalc enrollments_count / completions_count
--
-- RPC functions (SECURITY DEFINER):
--   award_course_points(p_enrollment_id)         — wypłaca punkty studentowi + autorowi
--   award_first_publish_bonus(p_course_id)        — bonus za pierwszą publikację
--   get_quiz_for_attempt(p_course_id)             — quiz dla studenta BEZ is_correct
--   submit_quiz_attempt(p_course_id, p_answers)   — atomic scoring + record + award
--
-- Loyalty rules: 3 nowe (course_completed_student, course_completed_author_reward,
--   course_first_publish_bonus)
--
-- Notifications: rozszerzony CHECK type o course_completed/approved/rejected
--
-- Idempotent: safe to re-run.
-- ============================================================

-- ============================================================
-- 1. courses
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    cover_image_url TEXT,
    category TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    level TEXT NOT NULL DEFAULT 'beginner'
        CHECK (level IN ('beginner', 'intermediate', 'advanced')),
    duration_minutes INTEGER,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_review', 'published', 'archived', 'rejected')),
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    avg_rating NUMERIC(3, 2) NOT NULL DEFAULT 0,
    ratings_count INTEGER NOT NULL DEFAULT 0,
    enrollments_count INTEGER NOT NULL DEFAULT 0,
    completions_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_author_id ON courses(author_id);
CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category);
CREATE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug);
CREATE INDEX IF NOT EXISTS idx_courses_tags ON courses USING GIN (tags);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courses_select_published_or_own_or_admin" ON courses;
CREATE POLICY "courses_select_published_or_own_or_admin" ON courses
    FOR SELECT TO authenticated
    USING (
        status = 'published'
        OR author_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'administrator', 'centrala')
        )
    );

DROP POLICY IF EXISTS "courses_insert_own_or_admin" ON courses;
CREATE POLICY "courses_insert_own_or_admin" ON courses
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'administrator', 'centrala')
        )
    );

DROP POLICY IF EXISTS "courses_update_own_or_admin" ON courses;
CREATE POLICY "courses_update_own_or_admin" ON courses
    FOR UPDATE TO authenticated
    USING (
        author_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'administrator', 'centrala')
        )
    );

DROP POLICY IF EXISTS "courses_delete_admin_only" ON courses;
CREATE POLICY "courses_delete_admin_only" ON courses
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'administrator', 'centrala')
        )
    );

-- ============================================================
-- 2. course_lessons
-- ============================================================
CREATE TABLE IF NOT EXISTS course_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    content_md TEXT,
    video_url TEXT,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    estimated_minutes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_course_lessons_course_order ON course_lessons(course_id, order_index);

ALTER TABLE course_lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_lessons_select_visible_course" ON course_lessons;
CREATE POLICY "course_lessons_select_visible_course" ON course_lessons
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = course_lessons.course_id
            AND (
                c.status = 'published'
                OR c.author_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid()
                    AND p.role IN ('admin', 'administrator', 'centrala')
                )
            )
        )
    );

DROP POLICY IF EXISTS "course_lessons_write_owner_or_admin" ON course_lessons;
CREATE POLICY "course_lessons_write_owner_or_admin" ON course_lessons
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = course_lessons.course_id
            AND (
                c.author_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid()
                    AND p.role IN ('admin', 'administrator', 'centrala')
                )
            )
        )
    );

-- ============================================================
-- 3. course_quiz_questions
-- ============================================================
CREATE TABLE IF NOT EXISTS course_quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_course_quiz_questions_course ON course_quiz_questions(course_id, order_index);

ALTER TABLE course_quiz_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_quiz_questions_select_visible" ON course_quiz_questions;
CREATE POLICY "course_quiz_questions_select_visible" ON course_quiz_questions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = course_quiz_questions.course_id
            AND (
                c.status = 'published'
                OR c.author_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid()
                    AND p.role IN ('admin', 'administrator', 'centrala')
                )
            )
        )
    );

DROP POLICY IF EXISTS "course_quiz_questions_write_owner_or_admin" ON course_quiz_questions;
CREATE POLICY "course_quiz_questions_write_owner_or_admin" ON course_quiz_questions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = course_quiz_questions.course_id
            AND (
                c.author_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid()
                    AND p.role IN ('admin', 'administrator', 'centrala')
                )
            )
        )
    );

-- ============================================================
-- 4. course_quiz_options
-- WAŻNE: SELECT ograniczony do autora i adminów. Studenci dostają opcje
--        BEZ pola is_correct przez RPC `get_quiz_for_attempt`.
-- ============================================================
CREATE TABLE IF NOT EXISTS course_quiz_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES course_quiz_questions(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (question_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_course_quiz_options_question ON course_quiz_options(question_id);

ALTER TABLE course_quiz_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_quiz_options_select_owner_or_admin" ON course_quiz_options;
CREATE POLICY "course_quiz_options_select_owner_or_admin" ON course_quiz_options
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM course_quiz_questions q
            JOIN courses c ON c.id = q.course_id
            WHERE q.id = course_quiz_options.question_id
            AND (
                c.author_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid()
                    AND p.role IN ('admin', 'administrator', 'centrala')
                )
            )
        )
    );

DROP POLICY IF EXISTS "course_quiz_options_write_owner_or_admin" ON course_quiz_options;
CREATE POLICY "course_quiz_options_write_owner_or_admin" ON course_quiz_options
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM course_quiz_questions q
            JOIN courses c ON c.id = q.course_id
            WHERE q.id = course_quiz_options.question_id
            AND (
                c.author_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid()
                    AND p.role IN ('admin', 'administrator', 'centrala')
                )
            )
        )
    );

-- ============================================================
-- 5. course_enrollments
-- ============================================================
CREATE TABLE IF NOT EXISTS course_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_lessons UUID[] NOT NULL DEFAULT '{}',
    completed_at TIMESTAMPTZ,
    points_awarded BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_enrollments_user ON course_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_course ON course_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_completed ON course_enrollments(completed_at);

ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_enrollments_own_or_admin" ON course_enrollments;
CREATE POLICY "course_enrollments_own_or_admin" ON course_enrollments
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'administrator', 'centrala')
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'administrator', 'centrala')
        )
    );

-- ============================================================
-- 6. course_quiz_attempts
-- ============================================================
CREATE TABLE IF NOT EXISTS course_quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    answers JSONB NOT NULL,
    score_percent INTEGER NOT NULL CHECK (score_percent BETWEEN 0 AND 100),
    passed BOOLEAN NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_quiz_attempts_user_course ON course_quiz_attempts(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_course_quiz_attempts_enrollment ON course_quiz_attempts(enrollment_id);

ALTER TABLE course_quiz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_quiz_attempts_own_or_admin" ON course_quiz_attempts;
CREATE POLICY "course_quiz_attempts_own_or_admin" ON course_quiz_attempts
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'administrator', 'centrala')
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'administrator', 'centrala')
        )
    );

-- ============================================================
-- 7. course_ratings
-- ============================================================
CREATE TABLE IF NOT EXISTS course_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_ratings_course ON course_ratings(course_id);

ALTER TABLE course_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_ratings_select_all_authenticated" ON course_ratings;
CREATE POLICY "course_ratings_select_all_authenticated" ON course_ratings
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "course_ratings_insert_own" ON course_ratings;
CREATE POLICY "course_ratings_insert_own" ON course_ratings
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "course_ratings_update_own" ON course_ratings;
CREATE POLICY "course_ratings_update_own" ON course_ratings
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "course_ratings_delete_own_or_admin" ON course_ratings;
CREATE POLICY "course_ratings_delete_own_or_admin" ON course_ratings
    FOR DELETE TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'administrator', 'centrala')
        )
    );

-- ============================================================
-- 8. Trigger: update_course_ratings_stats
-- Recalculates avg_rating and ratings_count after rating changes.
-- ============================================================
CREATE OR REPLACE FUNCTION update_course_ratings_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_course_id UUID;
    v_avg NUMERIC(3, 2);
    v_count INTEGER;
BEGIN
    v_course_id := COALESCE(NEW.course_id, OLD.course_id);

    SELECT COALESCE(AVG(rating)::NUMERIC(3, 2), 0), COUNT(*)
    INTO v_avg, v_count
    FROM course_ratings
    WHERE course_id = v_course_id;

    UPDATE courses
    SET avg_rating = v_avg,
        ratings_count = v_count,
        updated_at = NOW()
    WHERE id = v_course_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_update_course_ratings_stats ON course_ratings;
CREATE TRIGGER trg_update_course_ratings_stats
    AFTER INSERT OR UPDATE OR DELETE ON course_ratings
    FOR EACH ROW EXECUTE FUNCTION update_course_ratings_stats();

-- ============================================================
-- 9. Trigger: update_course_enrollment_stats
-- Bumps enrollments_count on insert; bumps completions_count when
-- completed_at transitions from NULL to NOT NULL.
-- ============================================================
CREATE OR REPLACE FUNCTION update_course_enrollment_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE courses
        SET enrollments_count = enrollments_count + 1,
            updated_at = NOW()
        WHERE id = NEW.course_id;
    ELSIF TG_OP = 'UPDATE'
          AND OLD.completed_at IS NULL
          AND NEW.completed_at IS NOT NULL THEN
        UPDATE courses
        SET completions_count = completions_count + 1,
            updated_at = NOW()
        WHERE id = NEW.course_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_course_enrollment_stats ON course_enrollments;
CREATE TRIGGER trg_update_course_enrollment_stats
    AFTER INSERT OR UPDATE ON course_enrollments
    FOR EACH ROW EXECUTE FUNCTION update_course_enrollment_stats();

-- ============================================================
-- 10. Notifications: rozszerzenie type CHECK
-- Dodajemy course_completed, course_approved, course_rejected.
-- ============================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'contract_ending',
        'health_score_low',
        'new_project_match',
        'loyalty_tier_up',
        'referral_update',
        'document_uploaded',
        'system_announcement',
        'payment_received',
        'course_completed',
        'course_approved',
        'course_rejected'
    ));

-- ============================================================
-- 11. RPC: award_course_points(p_enrollment_id)
-- SECURITY DEFINER — uprawnione INSERT do loyalty_transactions.
--
-- Returns: TEXT status — 'awarded' | 'already_awarded' | 'not_passed'
--                       | 'self_study_no_points' | 'race'
-- ============================================================
CREATE OR REPLACE FUNCTION award_course_points(p_enrollment_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_enrollment RECORD;
    v_course RECORD;
    v_student_pts INTEGER;
    v_author_base_pts INTEGER;
    v_multiplier NUMERIC(4, 2);
    v_author_pts INTEGER;
    v_rows_updated INTEGER;
    v_has_passed BOOLEAN;
BEGIN
    -- 1. Load enrollment
    SELECT id, user_id, course_id, points_awarded
    INTO v_enrollment
    FROM course_enrollments
    WHERE id = p_enrollment_id;

    IF NOT FOUND THEN
        RETURN 'enrollment_not_found';
    END IF;

    IF v_enrollment.points_awarded THEN
        RETURN 'already_awarded';
    END IF;

    -- 2. Verify a passing attempt exists
    SELECT EXISTS (
        SELECT 1 FROM course_quiz_attempts
        WHERE enrollment_id = p_enrollment_id
        AND passed = true
    ) INTO v_has_passed;

    IF NOT v_has_passed THEN
        RETURN 'not_passed';
    END IF;

    -- 3. Load course
    SELECT id, author_id, title, slug, COALESCE(avg_rating, 0) AS avg_rating
    INTO v_course
    FROM courses
    WHERE id = v_enrollment.course_id;

    -- 4. Atomic flip — guards against double-award in race condition
    UPDATE course_enrollments
    SET points_awarded = TRUE,
        completed_at = COALESCE(completed_at, NOW())
    WHERE id = p_enrollment_id
      AND points_awarded = FALSE;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
        RETURN 'race';
    END IF;

    -- 5. Self-study: no points (autor uczy się własnego kursu)
    IF v_course.author_id = v_enrollment.user_id THEN
        RETURN 'self_study_no_points';
    END IF;

    -- 6. Resolve point values from loyalty_rules
    SELECT points INTO v_student_pts
    FROM loyalty_rules
    WHERE code = 'course_completed_student' AND is_active = TRUE;

    SELECT points INTO v_author_base_pts
    FROM loyalty_rules
    WHERE code = 'course_completed_author_reward' AND is_active = TRUE;

    -- 7. Award student
    IF v_student_pts IS NOT NULL THEN
        INSERT INTO loyalty_transactions (user_id, points, source_type, source_id, description)
        VALUES (
            v_enrollment.user_id,
            v_student_pts,
            'course_completed_student',
            v_course.id,
            'Ukończenie szkolenia: ' || v_course.title
        );
    END IF;

    -- 8. Compute multiplier from avg_rating: 1.0..1.2 liniowo (rating/5 * 0.2 + 1.0)
    v_multiplier := 1.0 + LEAST(0.2, GREATEST(0, v_course.avg_rating) / 5.0 * 0.2);
    v_author_pts := ROUND(COALESCE(v_author_base_pts, 50) * v_multiplier);

    -- 9. Award author
    INSERT INTO loyalty_transactions (user_id, points, source_type, source_id, description)
    VALUES (
        v_course.author_id,
        v_author_pts,
        'course_completed_author_reward',
        v_course.id,
        'Uczeń ukończył Twoje szkolenie: ' || v_course.title || ' (×' || TO_CHAR(v_multiplier, 'FM9.00') || ')'
    );

    -- 10. Notify author
    PERFORM create_notification(
        v_course.author_id,
        'course_completed',
        'Ktoś ukończył Twoje szkolenie!',
        'Someone completed your course!',
        '+' || v_author_pts || ' pkt — ' || v_course.title,
        '+' || v_author_pts || ' pts — ' || v_course.title,
        '/akademia/' || v_course.slug,
        'normal'
    );

    RETURN 'awarded';
END;
$$;

GRANT EXECUTE ON FUNCTION award_course_points(UUID) TO authenticated;

-- ============================================================
-- 12. RPC: award_first_publish_bonus(p_course_id)
-- Wywoływana z server action approveCourse po set status='published'.
-- Idempotentna (sprawdza czy autor ma już published kursy poza tym).
-- ============================================================
CREATE OR REPLACE FUNCTION award_first_publish_bonus(p_course_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_author_id UUID;
    v_title TEXT;
    v_slug TEXT;
    v_count INTEGER;
    v_bonus_pts INTEGER;
BEGIN
    SELECT author_id, title, slug
    INTO v_author_id, v_title, v_slug
    FROM courses WHERE id = p_course_id;

    IF NOT FOUND THEN
        RETURN 'course_not_found';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM courses
    WHERE author_id = v_author_id
      AND status = 'published'
      AND id <> p_course_id;

    IF v_count > 0 THEN
        RETURN 'not_first';
    END IF;

    SELECT points INTO v_bonus_pts
    FROM loyalty_rules
    WHERE code = 'course_first_publish_bonus' AND is_active = TRUE;

    IF v_bonus_pts IS NULL THEN
        RETURN 'rule_inactive';
    END IF;

    INSERT INTO loyalty_transactions (user_id, points, source_type, source_id, description)
    VALUES (
        v_author_id,
        v_bonus_pts,
        'course_first_publish_bonus',
        p_course_id,
        'Bonus za pierwsze opublikowane szkolenie: ' || v_title
    );

    PERFORM create_notification(
        v_author_id,
        'course_approved',
        'Bonus za pierwsze szkolenie!',
        'First-course publication bonus!',
        '+' || v_bonus_pts || ' pkt — ' || v_title,
        '+' || v_bonus_pts || ' pts — ' || v_title,
        '/akademia/' || v_slug,
        'normal'
    );

    RETURN 'awarded';
END;
$$;

GRANT EXECUTE ON FUNCTION award_first_publish_bonus(UUID) TO authenticated;

-- ============================================================
-- 13. RPC: get_quiz_for_attempt(p_course_id)
-- Zwraca quiz dla studenta — opcje BEZ pola is_correct.
-- Wymaga aktywnej enrollment (lub roli autor/admin).
-- ============================================================
CREATE OR REPLACE FUNCTION get_quiz_for_attempt(p_course_id UUID)
RETURNS TABLE (
    question_id UUID,
    question_order INTEGER,
    question_text TEXT,
    options JSONB
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_authorized BOOLEAN;
BEGIN
    SELECT (
        EXISTS (SELECT 1 FROM course_enrollments e
                WHERE e.course_id = p_course_id AND e.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM courses c
                   WHERE c.id = p_course_id AND c.author_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles p
                   WHERE p.id = auth.uid()
                   AND p.role IN ('admin', 'administrator', 'centrala'))
    ) INTO v_authorized;

    IF NOT v_authorized THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    RETURN QUERY
    SELECT
        q.id AS question_id,
        q.order_index AS question_order,
        q.question_text,
        COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id', o.id,
                    'order_index', o.order_index,
                    'option_text', o.option_text
                ) ORDER BY o.order_index
            )
            FROM course_quiz_options o
            WHERE o.question_id = q.id),
            '[]'::jsonb
        ) AS options
    FROM course_quiz_questions q
    WHERE q.course_id = p_course_id
    ORDER BY q.order_index;
END;
$$;

GRANT EXECUTE ON FUNCTION get_quiz_for_attempt(UUID) TO authenticated;

-- ============================================================
-- 14. RPC: submit_quiz_attempt(p_course_id, p_answers)
-- Atomic: scoring + INSERT attempt + (jeśli passed) award_course_points.
--
-- p_answers format: jsonb array
--   [{"question_id": "...", "selected_option_id": "..."}]
--
-- Returns: jsonb {
--   score_percent: INT,
--   passed: BOOL,
--   attempt_id: UUID,
--   already_awarded: BOOL,
--   award_status: TEXT  (only if passed)
-- }
-- ============================================================
CREATE OR REPLACE FUNCTION submit_quiz_attempt(
    p_course_id UUID,
    p_answers JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_enrollment RECORD;
    v_total_questions INTEGER;
    v_correct_count INTEGER := 0;
    v_score_percent INTEGER;
    v_passed BOOLEAN;
    v_attempt_id UUID;
    v_award_status TEXT := NULL;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- 1. Validate enrollment
    SELECT id, points_awarded INTO v_enrollment
    FROM course_enrollments
    WHERE course_id = p_course_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_enrolled';
    END IF;

    -- 2. Total questions in this course
    SELECT COUNT(*) INTO v_total_questions
    FROM course_quiz_questions
    WHERE course_id = p_course_id;

    IF v_total_questions = 0 THEN
        RAISE EXCEPTION 'no_quiz_questions';
    END IF;

    -- 3. Score: count correctly-answered questions
    SELECT COUNT(*) INTO v_correct_count
    FROM jsonb_array_elements(p_answers) AS a
    JOIN course_quiz_options o
      ON o.id = (a->>'selected_option_id')::UUID
    JOIN course_quiz_questions q
      ON q.id = o.question_id
     AND q.id = (a->>'question_id')::UUID
    WHERE q.course_id = p_course_id
      AND o.is_correct = TRUE;

    v_score_percent := ROUND((v_correct_count::NUMERIC / v_total_questions) * 100);
    v_passed := v_score_percent >= 70;

    -- 4. Record the attempt
    INSERT INTO course_quiz_attempts (
        enrollment_id, user_id, course_id, answers, score_percent, passed
    ) VALUES (
        v_enrollment.id, v_user_id, p_course_id, p_answers, v_score_percent, v_passed
    ) RETURNING id INTO v_attempt_id;

    -- 5. If passed and not yet awarded, trigger points
    IF v_passed AND NOT v_enrollment.points_awarded THEN
        v_award_status := award_course_points(v_enrollment.id);
    END IF;

    RETURN jsonb_build_object(
        'score_percent', v_score_percent,
        'passed', v_passed,
        'attempt_id', v_attempt_id,
        'already_awarded', v_enrollment.points_awarded,
        'award_status', v_award_status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_quiz_attempt(UUID, JSONB) TO authenticated;

-- ============================================================
-- 15. Loyalty rules — 3 nowe wpisy dla LMS
-- ============================================================
INSERT INTO loyalty_rules (code, name, points, category, description) VALUES
    (
        'course_completed_student',
        'Ukończenie szkolenia',
        20,
        'Development',
        'Punkty za zaliczenie quizu końcowego (≥70%) szkolenia w Akademii'
    ),
    (
        'course_completed_author_reward',
        'Twoje szkolenie ukończone',
        50,
        'Development',
        'Autor dostaje punkty za każdego ucznia (mnożnik × avg rating 1.0–1.2)'
    ),
    (
        'course_first_publish_bonus',
        'Pierwsza publikacja szkolenia',
        100,
        'Development',
        'Jednorazowy bonus za pierwszy opublikowany kurs w Akademii'
    )
ON CONFLICT (code) DO UPDATE
SET points = EXCLUDED.points,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON TABLE courses IS 'LMS Akademia — szkolenia tworzone przez konsultantów';
COMMENT ON TABLE course_lessons IS 'Lekcje szkolenia (markdown + opcjonalny embed wideo + załączniki PDF)';
COMMENT ON TABLE course_quiz_questions IS 'Pytania quizu końcowego (single-choice ABCD)';
COMMENT ON TABLE course_quiz_options IS 'Opcje odpowiedzi — is_correct nigdy nie wraca do studenta przed quizem';
COMMENT ON TABLE course_enrollments IS 'Zapisy konsultantów na szkolenia + tracking ukończonych lekcji';
COMMENT ON TABLE course_quiz_attempts IS 'Historia podejść do quizu — jedna nagroda per (user, course)';
COMMENT ON TABLE course_ratings IS 'Oceny i komentarze po ukończeniu — wpływają na multiplier autora';
COMMENT ON FUNCTION award_course_points IS 'SECURITY DEFINER: wypłaca punkty studentowi i autorowi po zaliczeniu quizu';
COMMENT ON FUNCTION award_first_publish_bonus IS 'SECURITY DEFINER: jednorazowy bonus 100 pkt za pierwsze opublikowane szkolenie';
COMMENT ON FUNCTION get_quiz_for_attempt IS 'SECURITY DEFINER: zwraca quiz dla studenta BEZ pola is_correct';
COMMENT ON FUNCTION submit_quiz_attempt IS 'SECURITY DEFINER: atomic scoring + INSERT attempt + (jeśli passed) award_course_points';
