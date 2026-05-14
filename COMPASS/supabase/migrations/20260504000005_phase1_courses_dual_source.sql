-- ============================================================
-- Phase 1.1 — Learning Center: dual-source courses (consultant + company)
-- Date: 2026-05-04
--
-- Adds course_type ENUM ('consultant' | 'company') + is_official BOOLEAN.
-- Patches award_course_points RPC to (a) pick student rule by course_type,
-- (b) skip author bonus for company-authored courses (admin/trainer don't earn),
-- (c) preserve original signature `RETURNS TEXT` and behavior (points_awarded
-- flag, race-condition guard, create_notification call, rating multiplier).
--
-- Insert loyalty rule `course_completed_company_student` (30 pkt) — slightly
-- higher than 20 pkt consultant-authored to incentivize official content.
--
-- Idempotent: ENUM check, ADD COLUMN guarded, UPSERT on rule code.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'course_type_t') THEN
        CREATE TYPE course_type_t AS ENUM ('consultant', 'company');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'course_type'
    ) THEN
        ALTER TABLE courses ADD COLUMN course_type course_type_t NOT NULL DEFAULT 'consultant';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'is_official'
    ) THEN
        ALTER TABLE courses ADD COLUMN is_official BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_courses_course_type ON courses(course_type);
CREATE INDEX IF NOT EXISTS idx_courses_is_official ON courses(is_official) WHERE is_official = TRUE;

INSERT INTO loyalty_rules (code, name, description, points, category, is_active, created_at, updated_at)
VALUES (
    'course_completed_company_student',
    'Ukończenie kursu firmowego',
    'Punkty za ukończenie kursu firmowego (B2Bnetwork-authored)',
    30,
    'Development',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (code) DO UPDATE SET
    points = EXCLUDED.points,
    description = EXCLUDED.description,
    name = EXCLUDED.name,
    is_active = TRUE,
    updated_at = NOW();

CREATE OR REPLACE FUNCTION public.award_course_points(p_enrollment_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_enrollment RECORD;
    v_course RECORD;
    v_student_pts INTEGER;
    v_author_base_pts INTEGER;
    v_multiplier NUMERIC(4, 2);
    v_author_pts INTEGER;
    v_rows_updated INTEGER;
    v_has_passed BOOLEAN;
    v_student_rule_code TEXT;
BEGIN
    SELECT id, user_id, course_id, points_awarded INTO v_enrollment FROM course_enrollments WHERE id = p_enrollment_id;
    IF NOT FOUND THEN RETURN 'enrollment_not_found'; END IF;
    IF v_enrollment.points_awarded THEN RETURN 'already_awarded'; END IF;

    SELECT EXISTS (SELECT 1 FROM course_quiz_attempts WHERE enrollment_id = p_enrollment_id AND passed = true) INTO v_has_passed;
    IF NOT v_has_passed THEN RETURN 'not_passed'; END IF;

    SELECT id, author_id, title, slug, course_type, COALESCE(avg_rating, 0) AS avg_rating
    INTO v_course
    FROM courses WHERE id = v_enrollment.course_id;

    UPDATE course_enrollments SET points_awarded = TRUE, completed_at = COALESCE(completed_at, NOW())
        WHERE id = p_enrollment_id AND points_awarded = FALSE;
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN RETURN 'race'; END IF;

    -- Self-study (consultant authoring own course) earns nothing
    IF v_course.course_type = 'consultant' AND v_course.author_id = v_enrollment.user_id THEN
        RETURN 'self_study_no_points';
    END IF;

    v_student_rule_code := CASE
        WHEN v_course.course_type = 'company' THEN 'course_completed_company_student'
        ELSE 'course_completed_student'
    END;

    SELECT points INTO v_student_pts FROM loyalty_rules WHERE code = v_student_rule_code AND is_active = TRUE;
    IF v_student_pts IS NOT NULL THEN
        INSERT INTO loyalty_transactions (user_id, points, source_type, source_id, description)
        VALUES (
            v_enrollment.user_id,
            v_student_pts,
            v_student_rule_code,
            v_course.id,
            'Ukończenie szkolenia: ' || v_course.title
        );
    END IF;

    -- Author bonus only for consultant-authored courses
    IF v_course.course_type = 'consultant' AND v_course.author_id IS NOT NULL THEN
        SELECT points INTO v_author_base_pts FROM loyalty_rules WHERE code = 'course_completed_author_reward' AND is_active = TRUE;
        v_multiplier := 1.0 + LEAST(0.2, GREATEST(0, v_course.avg_rating) / 5.0 * 0.2);
        v_author_pts := ROUND(COALESCE(v_author_base_pts, 50) * v_multiplier);

        INSERT INTO loyalty_transactions (user_id, points, source_type, source_id, description)
        VALUES (
            v_course.author_id,
            v_author_pts,
            'course_completed_author_reward',
            v_course.id,
            'Uczeń ukończył Twoje szkolenie: ' || v_course.title || ' (×' || TO_CHAR(v_multiplier, 'FM9.00') || ')'
        );

        PERFORM create_notification(
            v_course.author_id, 'course_completed',
            'Ktoś ukończył Twoje szkolenie!', 'Someone completed your course!',
            '+' || v_author_pts || ' pkt — ' || v_course.title,
            '+' || v_author_pts || ' pts — ' || v_course.title,
            '/akademia/' || v_course.slug, 'normal'
        );
    END IF;

    RETURN 'awarded';
END;
$function$;

COMMIT;
