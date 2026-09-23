-- Bound discussion rewards across every version and run of a course. Existing
-- transactions remain untouched; their corresponding claims prevent re-awards.
BEGIN;

ALTER TABLE public.academy_reward_claims
    DROP CONSTRAINT academy_reward_claims_reward_kind_check;
ALTER TABLE public.academy_reward_claims
    ADD CONSTRAINT academy_reward_claims_reward_kind_check
    CHECK (reward_kind IN ('completion', 'first_publication', 'question_engagement', 'author_answer'));

CREATE UNIQUE INDEX academy_reward_discussion_once_per_course
    ON public.academy_reward_claims(user_id, course_id, reward_kind)
    WHERE reward_kind IN ('question_engagement', 'author_answer');

INSERT INTO public.academy_reward_claims(user_id, course_id, reward_kind, legacy)
SELECT DISTINCT tx.user_id, q.course_id, 'question_engagement', true
FROM public.loyalty_transactions tx
JOIN public.course_questions q ON q.id = tx.source_id AND q.user_id = tx.user_id
WHERE tx.source_type = 'course_question_asked' AND tx.points > 0
ON CONFLICT DO NOTHING;

INSERT INTO public.academy_reward_claims(user_id, course_id, reward_kind, legacy)
SELECT DISTINCT tx.user_id, q.course_id, 'author_answer', true
FROM public.loyalty_transactions tx
JOIN public.course_answers a ON a.id = tx.source_id AND a.user_id = tx.user_id
JOIN public.course_questions q ON q.id = a.question_id
WHERE tx.source_type = 'course_answer_given' AND tx.points > 0
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.academy_ask_question(p_enrollment_id uuid,p_question_text text,p_lesson_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments%ROWTYPE; v_id uuid; v_claim uuid; v_points integer;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO e FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() AND public.academy_enrollment_has_access(id) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'own_enrollment_required' USING ERRCODE='42501'; END IF;
    IF p_lesson_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.course_lessons WHERE id=p_lesson_id AND version_id=e.version_id AND public.academy_can_read_lesson(id)) THEN
        RAISE EXCEPTION 'lesson_not_accessible' USING ERRCODE='42501'; END IF;
    p_question_text:=btrim(p_question_text);
    IF p_question_text IS NULL OR length(p_question_text) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'invalid_question'; END IF;
    SELECT id INTO v_id FROM public.course_questions WHERE enrollment_id=e.id AND lesson_id IS NOT DISTINCT FROM p_lesson_id AND question_text=p_question_text LIMIT 1;
    IF FOUND THEN RETURN v_id; END IF;
    INSERT INTO public.course_questions(course_id,version_id,enrollment_id,lesson_id,user_id,question_text)
    VALUES(e.course_id,e.version_id,e.id,p_lesson_id,e.user_id,p_question_text) RETURNING id INTO v_id;
    SELECT points INTO v_points FROM public.loyalty_rules WHERE code='course_question_asked' AND is_active;
    IF COALESCE(v_points,0)>0 AND NOT EXISTS(SELECT 1 FROM public.courses WHERE id=e.course_id AND author_id=e.user_id) THEN
        INSERT INTO public.academy_reward_claims(user_id,course_id,reward_kind)
        VALUES(e.user_id,e.course_id,'question_engagement') ON CONFLICT DO NOTHING RETURNING id INTO v_claim;
        IF v_claim IS NOT NULL THEN
            INSERT INTO public.loyalty_transactions(user_id,points,source_type,source_id,description)
            VALUES(e.user_id,v_points,'course_question_asked',v_id,'Pytanie w Akademii');
        END IF;
    END IF;
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.academy_answer_question(p_question_id uuid,p_answer_text text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q public.course_questions%ROWTYPE; v_id uuid; v_author boolean; v_claim uuid; v_points integer;
BEGIN
    IF NOT public.academy_can_read_discussion(p_question_id) THEN RAISE EXCEPTION 'discussion_not_accessible' USING ERRCODE='42501'; END IF;
    SELECT * INTO q FROM public.course_questions WHERE id=p_question_id FOR UPDATE;
    p_answer_text:=btrim(p_answer_text);
    IF p_answer_text IS NULL OR length(p_answer_text) NOT BETWEEN 5 AND 5000 THEN RAISE EXCEPTION 'invalid_answer'; END IF;
    SELECT id INTO v_id FROM public.course_answers WHERE question_id=q.id AND user_id=auth.uid() AND answer_text=p_answer_text LIMIT 1;
    IF FOUND THEN RETURN v_id; END IF;
    v_author:=public.academy_can_manage_course(q.course_id) AND EXISTS(SELECT 1 FROM public.courses WHERE id=q.course_id AND author_id=auth.uid());
    INSERT INTO public.course_answers(question_id,user_id,answer_text,is_author_answer)
    VALUES(q.id,auth.uid(),p_answer_text,v_author) RETURNING id INTO v_id;
    SELECT points INTO v_points FROM public.loyalty_rules WHERE code='course_answer_given' AND is_active;
    IF v_author AND q.user_id<>auth.uid() AND COALESCE(v_points,0)>0 THEN
        INSERT INTO public.academy_reward_claims(user_id,course_id,reward_kind)
        VALUES(auth.uid(),q.course_id,'author_answer') ON CONFLICT DO NOTHING RETURNING id INTO v_claim;
        IF v_claim IS NOT NULL THEN
            INSERT INTO public.loyalty_transactions(user_id,points,source_type,source_id,description)
            VALUES(auth.uid(),v_points,'course_answer_given',v_id,'Odpowiedź autora w Akademii');
        END IF;
    END IF;
    RETURN v_id;
END $$;

COMMENT ON INDEX public.academy_reward_discussion_once_per_course IS
    'One question reward per learner/course and one author-answer reward per author/course across versions and runs.';
COMMIT;
