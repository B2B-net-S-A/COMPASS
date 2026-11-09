-- B0.10: grywalizacja kursów wyłączona na czas budowy i prób.
-- Sześć reguł course_* przechodzi na is_active=false; wszystkie miejsca naliczania są odporne na brak reguły
-- (odczyt katalogu 2026-11-09: finalize_enrollment, academy_review_course, academy_ask_question, academy_answer_question).
-- academy_mark_lesson_complete przestaje wołać bump_learning_streak; kolumny streaka w profiles zostają.
--
-- Cofnięcie: UPDATE public.loyalty_rules SET is_active=true WHERE code IN (te same 6 kodów);
--   oraz przywrócenie ciała academy_mark_lesson_complete z bieżącej definicji sprzed migracji (wywołanie bump_learning_streak).
BEGIN;
UPDATE public.loyalty_rules SET is_active=false WHERE code IN (
    'course_completed_student','course_completed_company_student','course_completed_author_reward',
    'course_first_publish_bonus','course_question_asked','course_answer_given');

CREATE OR REPLACE FUNCTION public.academy_mark_lesson_complete(p_enrollment_id uuid,p_lesson_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments%ROWTYPE; v_already boolean; v_completion jsonb;
BEGIN
    PERFORM 1 FROM public.course_runs WHERE id=(SELECT run_id FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid()) FOR UPDATE;
    PERFORM academy_private.require_lesson_access(p_enrollment_id,p_lesson_id);
    SELECT * INTO e FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() FOR UPDATE;
    v_already:=p_lesson_id=ANY(e.completed_lessons);
    IF NOT v_already THEN
        UPDATE public.course_enrollments SET completed_lessons=array_append(completed_lessons,p_lesson_id),
            lesson_completion_dates=lesson_completion_dates || jsonb_build_object(p_lesson_id::text,now()),
            last_accessed_lesson_id=p_lesson_id,last_accessed_at=now() WHERE id=e.id;
    END IF;
    v_completion:=academy_private.finalize_enrollment(e.id);
    RETURN jsonb_build_object('completed',true,'already_completed',v_already,'completion',v_completion,'streak',NULL);
END $$;

DO $$
DECLARE v_active integer;
BEGIN
    SELECT count(*) INTO v_active FROM public.loyalty_rules WHERE is_active AND code IN (
        'course_completed_student','course_completed_company_student','course_completed_author_reward',
        'course_first_publish_bonus','course_question_asked','course_answer_given');
    IF v_active<>0 THEN RAISE EXCEPTION 'B0.10: nadal aktywne reguły kursowe: %',v_active; END IF;
    IF position('bump_learning_streak' IN pg_get_functiondef('public.academy_mark_lesson_complete(uuid,uuid)'::regprocedure))>0 THEN
        RAISE EXCEPTION 'B0.10: academy_mark_lesson_complete nadal woła passę';
    END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
