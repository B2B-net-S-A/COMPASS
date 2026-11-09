-- B2.2: podejście jako sesja po stronie bazy. Start losuje i zamraża zestaw oraz
-- kolejność, zapisuje termin; ocena i klucz zostają wyłącznie w SQL.
-- Wymaga na produkcji kodu formularza z B2.4 (stare academy_get_quiz znika).
-- Cofnięcie: nieodwracalne, cofamy PITR.
BEGIN;

ALTER TABLE public.course_quiz_attempts
    ADD COLUMN kind text NOT NULL DEFAULT 'final' CHECK (kind IN ('final','pre')),
    ADD COLUMN status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('in_progress','submitted','expired')),
    ADD COLUMN deadline_at timestamptz,
    ADD COLUMN submitted_at timestamptz;
UPDATE public.course_quiz_attempts SET submitted_at=attempted_at WHERE submitted_at IS NULL;
ALTER TABLE public.course_quiz_attempts
    ALTER COLUMN score_percent DROP NOT NULL,
    ALTER COLUMN answers SET DEFAULT '[]'::jsonb,
    ALTER COLUMN passed SET DEFAULT false,
    ADD CONSTRAINT academy_attempt_closed_has_score CHECK (status='in_progress' OR score_percent IS NOT NULL),
    ADD CONSTRAINT academy_attempt_open_not_passed CHECK (status<>'in_progress' OR NOT passed),
    ADD CONSTRAINT academy_attempt_pre_never_passes CHECK (kind='final' OR NOT passed),
    ADD CONSTRAINT academy_attempt_open_has_deadline CHECK (status<>'in_progress' OR deadline_at IS NOT NULL);
CREATE UNIQUE INDEX academy_quiz_one_open_attempt ON public.course_quiz_attempts(enrollment_id,kind) WHERE status='in_progress';

CREATE TABLE public.course_quiz_attempt_items (
    attempt_id uuid NOT NULL REFERENCES public.course_quiz_attempts(id) ON DELETE CASCADE,
    question_id uuid NOT NULL REFERENCES public.course_quiz_questions(id),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    position integer NOT NULL CHECK (position>0),
    option_order uuid[] NOT NULL CHECK (cardinality(option_order) BETWEEN 2 AND 6),
    selected_option_id uuid REFERENCES public.course_quiz_options(id),
    answered_at timestamptz,
    PRIMARY KEY (attempt_id,question_id),
    UNIQUE (attempt_id,position)
);
CREATE INDEX academy_quiz_items_question ON public.course_quiz_attempt_items(question_id);
CREATE INDEX academy_quiz_items_user ON public.course_quiz_attempt_items(user_id);
-- Bez polityk i grantów dla użytkowników: zestaw czyta się wyłącznie przez RPC.
ALTER TABLE public.course_quiz_attempt_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_quiz_attempt_items FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.course_quiz_attempt_items TO service_role;

-- Unieważnione pytanie liczy się jako poprawne w każdej próbie, w której padło (V18).
CREATE FUNCTION academy_private.close_quiz_attempt(p_attempt_id uuid,p_status text)
RETURNS public.course_quiz_attempts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.course_quiz_attempts; v_total integer; v_correct integer; v_score integer; v_pass integer;
BEGIN
    SELECT * INTO a FROM public.course_quiz_attempts WHERE id=p_attempt_id FOR UPDATE;
    SELECT count(*),count(*) FILTER(WHERE q.voided_at IS NOT NULL OR o.is_correct) INTO v_total,v_correct
        FROM public.course_quiz_attempt_items i JOIN public.course_quiz_questions q ON q.id=i.question_id
        LEFT JOIN public.course_quiz_options o ON o.id=i.selected_option_id WHERE i.attempt_id=a.id;
    SELECT (v.completion_rules->>'quiz_pass_percent')::integer INTO v_pass
        FROM public.course_enrollments e JOIN public.course_versions v ON v.id=e.version_id WHERE e.id=a.enrollment_id;
    v_score:=CASE WHEN v_total=0 THEN 0 ELSE round(v_correct::numeric/v_total*100) END;
    UPDATE public.course_quiz_attempts SET status=p_status,score_percent=v_score,
        passed=(a.kind='final' AND v_total>0 AND v_score>=v_pass),submitted_at=now(),
        answers=COALESCE((SELECT jsonb_agg(jsonb_build_object('question_id',i.question_id,'selected_option_id',i.selected_option_id) ORDER BY i.position)
            FROM public.course_quiz_attempt_items i WHERE i.attempt_id=a.id AND i.selected_option_id IS NOT NULL),'[]'::jsonb)
        WHERE id=a.id RETURNING * INTO a;
    RETURN a;
END $$;

-- Zamknięcie próby i unieważnienie pytania muszą się wykluczać, inaczej ocena policzona
-- obok niezatwierdzonego unieważnienia zostawia stary wynik. Pytania blokujemy jako pierwsze,
-- w stałej kolejności, tak samo jak RPC unieważnienia (pytanie, edycja, zapis, próba).
CREATE FUNCTION academy_private.lock_attempt_questions(p_attempt_ids uuid[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT 1 FROM (SELECT q.id FROM public.course_quiz_questions q
        WHERE q.id IN (SELECT question_id FROM public.course_quiz_attempt_items WHERE attempt_id=ANY(p_attempt_ids))
        ORDER BY q.id FOR SHARE) locked;
$$;

-- Ta sama kolejność blokad co wysyłka: pytania, edycja, zapis, próba, potem finalizacja.
CREATE FUNCTION academy_private.close_expired_quiz_attempts(p_enrollment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_attempt uuid; v_run uuid; closed public.course_quiz_attempts;
BEGIN
    IF NOT EXISTS(SELECT 1 FROM public.course_quiz_attempts WHERE enrollment_id=p_enrollment_id AND status='in_progress' AND deadline_at<=now()) THEN RETURN; END IF;
    PERFORM academy_private.lock_attempt_questions(ARRAY(SELECT id FROM public.course_quiz_attempts WHERE enrollment_id=p_enrollment_id AND status='in_progress' AND deadline_at<=now()));
    SELECT run_id INTO v_run FROM public.course_enrollments WHERE id=p_enrollment_id;
    IF v_run IS NOT NULL THEN PERFORM 1 FROM public.course_runs WHERE id=v_run FOR UPDATE; END IF;
    PERFORM 1 FROM public.course_enrollments WHERE id=p_enrollment_id FOR UPDATE;
    FOR v_attempt IN SELECT id FROM public.course_quiz_attempts WHERE enrollment_id=p_enrollment_id AND status='in_progress' AND deadline_at<=now() ORDER BY id FOR UPDATE LOOP
        closed:=academy_private.close_quiz_attempt(v_attempt,'expired');
        IF closed.passed THEN PERFORM academy_private.finalize_enrollment(p_enrollment_id); END IF;
    END LOOP;
END $$;

-- Jedno miejsce decyzji, czy wolno zacząć; zwraca kod powodu albo NULL.
CREATE FUNCTION academy_private.quiz_start_blocker(p_enrollment_id uuid,p_kind text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments; v public.course_versions; v_recent integer;
BEGIN
    SELECT * INTO e FROM public.course_enrollments WHERE id=p_enrollment_id;
    SELECT * INTO v FROM public.course_versions WHERE id=e.version_id;
    IF v.status<>'published' THEN RETURN 'published_enrollment_version_required'; END IF;
    IF p_kind='pre' THEN
        IF NULLIF(v.completion_rules->>'pre_test_count','') IS NULL THEN RETURN 'pre_test_not_enabled'; END IF;
        IF EXISTS(SELECT 1 FROM public.course_quiz_attempts WHERE enrollment_id=e.id AND kind='final') THEN RETURN 'pre_test_closed'; END IF;
        IF EXISTS(SELECT 1 FROM public.course_quiz_attempts WHERE enrollment_id=e.id AND kind='pre' AND status<>'in_progress') THEN RETURN 'pre_test_already_taken'; END IF;
        RETURN NULL;
    END IF;
    IF EXISTS(SELECT 1 FROM public.course_quiz_attempts WHERE enrollment_id=e.id AND kind='final' AND passed) THEN RETURN 'quiz_already_passed'; END IF;
    -- Test edycji otwiera się po wymaganych sesjach, licząc planowany albo potwierdzony koniec.
    IF e.run_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM academy_private.run_obligations o WHERE o.run_id=e.run_id)
        OR EXISTS(SELECT 1 FROM academy_private.run_obligations o JOIN public.course_sessions s ON s.id=o.active_session_id
            WHERE o.run_id=e.run_id AND s.status='scheduled' AND COALESCE(s.actual_ends_at,s.ends_at)>now())) THEN
        RETURN 'quiz_opens_after_sessions';
    END IF;
    IF v.quiz_attempt_limit IS NOT NULL THEN
        SELECT count(*) INTO v_recent FROM public.course_quiz_attempts a JOIN public.course_enrollments prior ON prior.id=a.enrollment_id
            WHERE prior.user_id=e.user_id AND prior.version_id=e.version_id AND a.user_id=e.user_id AND a.kind='final'
                AND a.attempted_at>now()-make_interval(hours=>v.quiz_attempt_window_hours);
        IF v_recent>=v.quiz_attempt_limit THEN RETURN 'quiz_attempt_window_exhausted'; END IF;
    END IF;
    RETURN NULL;
END $$;

CREATE FUNCTION academy_private.quiz_attempt_payload(p_attempt_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT jsonb_build_object('attempt_id',a.id,'kind',a.kind,'status',a.status,
        'has_time_limit',NULLIF(v.completion_rules->>'time_limit_minutes','') IS NOT NULL,
        'remaining_seconds',greatest(0,ceil(extract(epoch FROM a.deadline_at-now())))::integer,
        'pass_percent',(v.completion_rules->>'quiz_pass_percent')::integer,
        'questions',COALESCE((SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'position',i.position,'question_text',q.question_text,
            'selected_option_id',i.selected_option_id,
            'options',(SELECT jsonb_agg(jsonb_build_object('id',o.id,'option_text',o.option_text) ORDER BY u.ord)
                FROM unnest(i.option_order) WITH ORDINALITY u(id,ord) JOIN public.course_quiz_options o ON o.id=u.id)) ORDER BY i.position)
            FROM public.course_quiz_attempt_items i JOIN public.course_quiz_questions q ON q.id=i.question_id
            WHERE i.attempt_id=a.id AND q.voided_at IS NULL),'[]'::jsonb))
    FROM public.course_quiz_attempts a JOIN public.course_enrollments e ON e.id=a.enrollment_id
    JOIN public.course_versions v ON v.id=e.version_id WHERE a.id=p_attempt_id;
$$;

CREATE FUNCTION public.academy_start_quiz_attempt(p_enrollment_id uuid,p_kind text DEFAULT 'final')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments; v public.course_versions; v_open uuid; v_blocker text; v_attempt uuid;
    v_count integer; v_random boolean; v_shuffle boolean; v_minutes integer; v_position integer:=0; q record;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    IF p_kind IS NULL OR p_kind NOT IN ('final','pre') THEN RAISE EXCEPTION 'invalid_quiz_kind'; END IF;
    SELECT * INTO e FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() AND public.academy_enrollment_has_access(id);
    IF NOT FOUND THEN RAISE EXCEPTION 'own_enrollment_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO v FROM public.course_versions WHERE id=e.version_id;
    -- Jedna blokada na osobę i wersję: dwie karty i dwie edycje nie przeskoczą limitu.
    PERFORM pg_advisory_xact_lock(hashtextextended('academy-quiz-attempt:'||e.user_id::text||':'||e.version_id::text,0));
    PERFORM academy_private.close_expired_quiz_attempts(e.id);
    SELECT id INTO v_open FROM public.course_quiz_attempts WHERE enrollment_id=e.id AND kind=p_kind AND status='in_progress';
    IF FOUND THEN RETURN academy_private.quiz_attempt_payload(v_open); END IF;
    v_blocker:=academy_private.quiz_start_blocker(e.id,p_kind);
    IF v_blocker IS NOT NULL THEN RAISE EXCEPTION '%',v_blocker; END IF;

    v_count:=NULLIF(v.completion_rules->>(CASE WHEN p_kind='pre' THEN 'pre_test_count' ELSE 'draw_count' END),'')::integer;
    v_random:=COALESCE((v.completion_rules->>'draw_random')::boolean,true) OR p_kind='pre';
    v_shuffle:=COALESCE((v.completion_rules->>'shuffle_options')::boolean,true);
    v_minutes:=COALESCE(NULLIF(v.completion_rules->>'time_limit_minutes','')::integer,COALESCE(v.quiz_attempt_window_hours,24)*60);
    IF NOT EXISTS(SELECT 1 FROM public.course_quiz_questions WHERE version_id=e.version_id AND pool_status='approved' AND voided_at IS NULL) THEN
        RAISE EXCEPTION 'quiz_pool_empty';
    END IF;
    INSERT INTO public.course_quiz_attempts(enrollment_id,user_id,course_id,kind,status,deadline_at)
    VALUES(e.id,e.user_id,e.course_id,p_kind,'in_progress',now()+make_interval(mins=>v_minutes)) RETURNING id INTO v_attempt;
    FOR q IN SELECT id FROM public.course_quiz_questions WHERE version_id=e.version_id AND pool_status='approved' AND voided_at IS NULL
        ORDER BY CASE WHEN v_random THEN random() END,order_index LIMIT v_count LOOP
        v_position:=v_position+1;
        INSERT INTO public.course_quiz_attempt_items(attempt_id,question_id,user_id,position,option_order)
        VALUES(v_attempt,q.id,e.user_id,v_position,ARRAY(SELECT o.id FROM public.course_quiz_options o WHERE o.question_id=q.id
            ORDER BY CASE WHEN v_shuffle THEN random() END,o.order_index));
    END LOOP;
    RETURN academy_private.quiz_attempt_payload(v_attempt);
END $$;

CREATE FUNCTION public.academy_save_quiz_answer(p_attempt_id uuid,p_question_id uuid,p_option_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.course_quiz_attempts;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO a FROM public.course_quiz_attempts WHERE id=p_attempt_id AND user_id=auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'own_quiz_attempt_required' USING ERRCODE='42501'; END IF;
    IF a.status<>'in_progress' THEN RAISE EXCEPTION 'quiz_attempt_closed'; END IF;
    IF now()>=a.deadline_at THEN RAISE EXCEPTION 'quiz_attempt_deadline_passed'; END IF;
    UPDATE public.course_quiz_attempt_items SET selected_option_id=p_option_id,answered_at=now()
        WHERE attempt_id=a.id AND question_id=p_question_id AND p_option_id=ANY(option_order);
    IF NOT FOUND THEN RAISE EXCEPTION 'answer_not_in_attempt'; END IF;
    RETURN jsonb_build_object('saved',true,'remaining_seconds',greatest(0,ceil(extract(epoch FROM a.deadline_at-now())))::integer);
END $$;

CREATE FUNCTION public.academy_submit_quiz_attempt(p_attempt_id uuid,p_answers jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.course_quiz_attempts; v_run uuid; v_enrollment uuid; v_awarded boolean; v_completion jsonb; x jsonb; v_question uuid; v_option uuid;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT a2.enrollment_id,e.run_id INTO v_enrollment,v_run FROM public.course_quiz_attempts a2
        JOIN public.course_enrollments e ON e.id=a2.enrollment_id WHERE a2.id=p_attempt_id AND a2.user_id=auth.uid();
    IF NOT FOUND OR NOT public.academy_enrollment_has_access(v_enrollment) THEN RAISE EXCEPTION 'own_quiz_attempt_required' USING ERRCODE='42501'; END IF;
    PERFORM academy_private.lock_attempt_questions(ARRAY[p_attempt_id]);
    IF v_run IS NOT NULL THEN PERFORM 1 FROM public.course_runs WHERE id=v_run FOR UPDATE; END IF;
    SELECT points_awarded INTO v_awarded FROM public.course_enrollments WHERE id=v_enrollment FOR UPDATE;
    SELECT * INTO a FROM public.course_quiz_attempts WHERE id=p_attempt_id FOR UPDATE;
    IF a.status<>'in_progress' THEN
        -- Podwójne kliknięcie albo ponowienie po utracie sieci oddaje zapisany wynik.
        RETURN jsonb_build_object('attempt_id',a.id,'score_percent',a.score_percent,'passed',a.passed,'already_submitted',true,
            'award_status',CASE WHEN a.passed THEN 'requirements_pending' ELSE 'not_passed' END);
    END IF;
    IF now()>=a.deadline_at THEN RAISE EXCEPTION 'quiz_attempt_deadline_passed'; END IF;
    IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_quiz_answers'; END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(p_answers))<>(SELECT count(DISTINCT x2->>'question_id') FROM jsonb_array_elements(p_answers) x2) THEN
        RAISE EXCEPTION 'one_answer_per_question_required';
    END IF;
    FOR x IN SELECT value FROM jsonb_array_elements(p_answers) LOOP
        BEGIN
            v_question:=(x->>'question_id')::uuid; v_option:=(x->>'selected_option_id')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'answer_not_in_attempt';
        END;
        UPDATE public.course_quiz_attempt_items SET selected_option_id=v_option,answered_at=now()
            WHERE attempt_id=a.id AND question_id=v_question AND v_option=ANY(option_order);
        IF NOT FOUND THEN RAISE EXCEPTION 'answer_not_in_attempt'; END IF;
    END LOOP;
    a:=academy_private.close_quiz_attempt(a.id,'submitted');
    IF a.passed THEN v_completion:=academy_private.finalize_enrollment(a.enrollment_id); END IF;
    RETURN jsonb_build_object('attempt_id',a.id,'score_percent',a.score_percent,'passed',a.passed,'already_awarded',v_awarded,
        'award_status',CASE WHEN NOT a.passed THEN 'not_passed' WHEN (v_completion->>'completed')::boolean THEN 'completed' ELSE 'requirements_pending' END,
        'completion',v_completion);
END $$;

-- Odczyt przed startem: otwarcie strony niczego nie zużywa.
CREATE FUNCTION public.academy_quiz_status(p_enrollment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments; v public.course_versions; v_pool integer; v_used integer:=0; v_next timestamptz;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO e FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() AND public.academy_enrollment_has_access(id);
    IF NOT FOUND THEN RAISE EXCEPTION 'own_enrollment_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO v FROM public.course_versions WHERE id=e.version_id;
    PERFORM academy_private.close_expired_quiz_attempts(e.id);
    SELECT count(*) INTO v_pool FROM public.course_quiz_questions WHERE version_id=e.version_id AND pool_status='approved' AND voided_at IS NULL;
    IF v.quiz_attempt_limit IS NOT NULL THEN
        SELECT count(*),min(a.attempted_at)+make_interval(hours=>v.quiz_attempt_window_hours) INTO v_used,v_next
            FROM public.course_quiz_attempts a JOIN public.course_enrollments prior ON prior.id=a.enrollment_id
            WHERE prior.user_id=e.user_id AND prior.version_id=e.version_id AND a.user_id=e.user_id AND a.kind='final'
                AND a.attempted_at>now()-make_interval(hours=>v.quiz_attempt_window_hours);
    END IF;
    RETURN jsonb_build_object(
        'open_final',EXISTS(SELECT 1 FROM public.course_quiz_attempts WHERE enrollment_id=e.id AND kind='final' AND status='in_progress'),
        'open_pre',EXISTS(SELECT 1 FROM public.course_quiz_attempts WHERE enrollment_id=e.id AND kind='pre' AND status='in_progress'),
        'blocker',academy_private.quiz_start_blocker(e.id,'final'),
        'pre_blocker',academy_private.quiz_start_blocker(e.id,'pre'),
        'question_count',least(v_pool,COALESCE(NULLIF(v.completion_rules->>'draw_count','')::integer,v_pool)),
        'pre_test_count',least(v_pool,NULLIF(v.completion_rules->>'pre_test_count','')::integer),
        'time_limit_minutes',NULLIF(v.completion_rules->>'time_limit_minutes','')::integer,
        'pass_percent',(v.completion_rules->>'quiz_pass_percent')::integer,
        'attempts_used',v_used,'attempt_limit',v.quiz_attempt_limit,'attempt_window_hours',v.quiz_attempt_window_hours,
        'next_attempt_at',CASE WHEN v_used>=COALESCE(v.quiz_attempt_limit,v_used+1) THEN v_next END);
END $$;

-- Wynik własnej zamkniętej próby: tematy zawsze, pytania i klucz tylko przy włączonych wyjaśnieniach.
CREATE FUNCTION public.academy_quiz_attempt_result(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.course_quiz_attempts; v public.course_versions; v_show boolean;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO a FROM public.course_quiz_attempts WHERE id=p_attempt_id AND user_id=auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'own_quiz_attempt_required' USING ERRCODE='42501'; END IF;
    IF a.status='in_progress' THEN RAISE EXCEPTION 'quiz_attempt_not_finished'; END IF;
    SELECT v2.* INTO v FROM public.course_versions v2 JOIN public.course_enrollments e ON e.version_id=v2.id WHERE e.id=a.enrollment_id;
    v_show:=a.kind='final' AND COALESCE((v.completion_rules->>'show_explanations')::boolean,false);
    RETURN jsonb_build_object('attempt_id',a.id,'kind',a.kind,'status',a.status,'score_percent',a.score_percent,'passed',a.passed,
        'pass_percent',(v.completion_rules->>'quiz_pass_percent')::integer,'submitted_at',a.submitted_at,
        'topics',COALESCE((SELECT jsonb_agg(t ORDER BY t->>'topic') FROM (
            SELECT jsonb_build_object('topic',COALESCE(q.topic_tag,'Bez tematu'),'total',count(*),
                'correct',count(*) FILTER(WHERE q.voided_at IS NOT NULL OR o.is_correct)) t
            FROM public.course_quiz_attempt_items i JOIN public.course_quiz_questions q ON q.id=i.question_id
            LEFT JOIN public.course_quiz_options o ON o.id=i.selected_option_id
            WHERE i.attempt_id=a.id GROUP BY COALESCE(q.topic_tag,'Bez tematu')) x),'[]'::jsonb),
        'review',CASE WHEN v_show THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('position',i.position,'question_text',q.question_text,
            'topic',q.topic_tag,'voided',q.voided_at IS NOT NULL,'selected_option_id',i.selected_option_id,
            'options',(SELECT jsonb_agg(jsonb_build_object('id',o.id,'option_text',o.option_text,'is_correct',o.is_correct,'explanation',o.explanation) ORDER BY u.ord)
                FROM unnest(i.option_order) WITH ORDINALITY u(id,ord) JOIN public.course_quiz_options o ON o.id=u.id)) ORDER BY i.position)
            FROM public.course_quiz_attempt_items i JOIN public.course_quiz_questions q ON q.id=i.question_id WHERE i.attempt_id=a.id),'[]'::jsonb) END);
END $$;

-- Liczba pytań w karcie szkolenia to wielkość zestawu, nie puli.
CREATE OR REPLACE FUNCTION public.academy_quiz_question_count(p_version_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_count integer; v_draw integer;
BEGIN
    IF NOT public.academy_can_read_version(p_version_id) THEN RAISE EXCEPTION 'version_access_denied' USING ERRCODE='42501'; END IF;
    SELECT count(*) INTO v_count FROM public.course_quiz_questions WHERE version_id=p_version_id AND pool_status='approved' AND voided_at IS NULL;
    SELECT NULLIF(completion_rules->>'draw_count','')::integer INTO v_draw FROM public.course_versions WHERE id=p_version_id;
    RETURN least(v_count,COALESCE(v_draw,v_count));
END $$;

-- Lista uczestników liczy tylko zamknięte próby końcowe.
DO $$
DECLARE v_old text:=pg_get_functiondef('public.academy_run_participants(uuid)'::regprocedure); v_new text;
BEGIN
    v_new:=replace(v_old,'a.user_id=e.user_id AND a.course_id=e.course_id',
        'a.user_id=e.user_id AND a.course_id=e.course_id AND a.kind=''final'' AND a.status<>''in_progress''');
    IF v_new=v_old THEN RAISE EXCEPTION 'academy_run_participants: expected fragment missing'; END IF;
    EXECUTE v_new;
END $$;

-- Stare wejścia oddawały całą pulę i oceniały bez sesji.
DROP FUNCTION public.academy_get_quiz(uuid);
DROP FUNCTION public.academy_submit_quiz(uuid,jsonb);
DROP FUNCTION academy_private.submit_quiz_scoring(uuid,jsonb);

REVOKE ALL ON FUNCTION academy_private.lock_attempt_questions(uuid[]),academy_private.close_quiz_attempt(uuid,text),academy_private.close_expired_quiz_attempts(uuid),
    academy_private.quiz_start_blocker(uuid,text),academy_private.quiz_attempt_payload(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.academy_start_quiz_attempt(uuid,text),public.academy_save_quiz_answer(uuid,uuid,uuid),
    public.academy_submit_quiz_attempt(uuid,jsonb),public.academy_quiz_status(uuid),public.academy_quiz_attempt_result(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_start_quiz_attempt(uuid,text),public.academy_save_quiz_answer(uuid,uuid,uuid),
    public.academy_submit_quiz_attempt(uuid,jsonb),public.academy_quiz_status(uuid),public.academy_quiz_attempt_result(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';

DO $$
BEGIN
    IF to_regclass('public.course_quiz_attempt_items') IS NULL THEN RAISE EXCEPTION 'attempt items missing'; END IF;
    IF to_regprocedure('public.academy_get_quiz(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'pool-wide quiz read still present'; END IF;
    IF has_table_privilege('authenticated','public.course_quiz_attempt_items','SELECT') THEN RAISE EXCEPTION 'attempt items readable by users'; END IF;
    IF has_function_privilege('anon','public.academy_start_quiz_attempt(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'anon can start attempts'; END IF;
    IF position('is_correct' IN pg_get_functiondef('academy_private.quiz_attempt_payload(uuid)'::regprocedure))>0 THEN RAISE EXCEPTION 'answer key in attempt payload'; END IF;
    IF position('a.kind=''final''' IN pg_get_functiondef('public.academy_run_participants(uuid)'::regprocedure))=0 THEN RAISE EXCEPTION 'participants still count open attempts'; END IF;
END $$;

COMMIT;
