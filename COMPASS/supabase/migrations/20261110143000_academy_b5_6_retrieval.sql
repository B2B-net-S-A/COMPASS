-- B5.6: powtórki D+14, D+45, D+90, po 3 pytania z puli. Bez oceny: odpowiedź i wyjaśnienie
-- widzi wyłącznie uczestnik, więc tabela ma politykę tylko na własne wiersze, a wyniku nie
-- czyta żaden raport. Harmonogram tworzy i rozsyła wyłącznie cron za przełącznikiem.
-- Cofnięcie: supabase/rollbacks/20261110143000_academy_b5_6_retrieval.sql
BEGIN;

CREATE TABLE public.academy_retrieval_schedule (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    enrollment_id uuid NOT NULL REFERENCES public.course_enrollments(id),
    course_id uuid NOT NULL REFERENCES public.courses(id),
    version_id uuid NOT NULL REFERENCES public.course_versions(id),
    offset_days integer NOT NULL CHECK (offset_days IN (14,45,90)),
    due_at timestamptz NOT NULL,
    question_ids uuid[] NOT NULL DEFAULT '{}',
    answers jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(answers)='object'),
    notified_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (enrollment_id,offset_days)
);
CREATE INDEX academy_retrieval_due ON public.academy_retrieval_schedule(due_at) WHERE notified_at IS NULL;
CREATE INDEX academy_retrieval_user ON public.academy_retrieval_schedule(user_id,due_at DESC);
ALTER TABLE public.academy_retrieval_schedule ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_retrieval_schedule FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.academy_retrieval_schedule TO authenticated;
GRANT ALL ON public.academy_retrieval_schedule TO service_role;
CREATE POLICY academy_retrieval_own ON public.academy_retrieval_schedule FOR SELECT TO authenticated
    USING (public.academy_can_access() AND user_id=auth.uid());

-- Dosypuje brakujące terminy i zwraca te, które już minęły. Okno 30 dni chroni przed
-- zalewem powtórek za stare ukończenia w chwili włączenia przełącznika.
CREATE FUNCTION public.academy_retrieval_due(p_limit integer)
RETURNS TABLE(schedule_id uuid,recipient text,full_name text,course_title text,offset_days integer,due_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_column
BEGIN
    INSERT INTO public.academy_retrieval_schedule(user_id,enrollment_id,course_id,version_id,offset_days,due_at)
    SELECT x.user_id,x.enrollment_id,x.course_id,x.version_id,o.days,x.completed_at+make_interval(days=>o.days)
    FROM public.course_completions x CROSS JOIN (VALUES(14),(45),(90)) AS o(days)
    WHERE x.revoked_at IS NULL AND x.completed_at+make_interval(days=>o.days)>now()-interval '30 days'
        AND academy_private.rollout_allows_user(x.user_id)
        AND EXISTS(SELECT 1 FROM public.course_quiz_questions q WHERE q.version_id=x.version_id AND q.pool_status='approved' AND q.voided_at IS NULL)
    ON CONFLICT (enrollment_id,offset_days) DO NOTHING;
    RETURN QUERY
    SELECT s.id,p.email,p.full_name,COALESCE(x.certificate_snapshot->>'course_title','Szkolenie'),s.offset_days,s.due_at
    FROM public.academy_retrieval_schedule s
    JOIN public.profiles p ON p.id=s.user_id
    JOIN public.course_completions x ON x.enrollment_id=s.enrollment_id
    WHERE s.notified_at IS NULL AND s.completed_at IS NULL AND s.due_at<=now() AND s.due_at>now()-interval '30 days'
        AND x.revoked_at IS NULL AND p.email IS NOT NULL AND academy_private.rollout_allows_user(s.user_id)
    ORDER BY s.due_at,s.id LIMIT p_limit;
END $$;
REVOKE ALL ON FUNCTION public.academy_retrieval_due(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_retrieval_due(integer) TO service_role;

-- Dzwonek dopiero po zapisaniu wiadomości w kolejce, żeby nie zgubić maila przy awarii.
CREATE FUNCTION public.academy_retrieval_mark_notified(p_schedule_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.academy_retrieval_schedule;
BEGIN
    UPDATE public.academy_retrieval_schedule SET notified_at=now() WHERE id=p_schedule_id AND notified_at IS NULL RETURNING * INTO s;
    IF NOT FOUND THEN RETURN false; END IF;
    INSERT INTO public.academy_notification_receipts(dedupe_key,user_id) VALUES('retrieval:'||s.id::text,s.user_id) ON CONFLICT DO NOTHING;
    IF FOUND THEN
        INSERT INTO public.notifications(user_id,type,title_pl,title_en,body_pl,body_en,action_url,priority)
        VALUES(s.user_id,'system_announcement','Czas na krótką powtórkę','Academy retrieval practice',
            '3 pytania, około 2 minut. Wynik widzisz tylko Ty.','3 questions, about 2 minutes.','/learning/powtorki/'||s.id::text,'normal');
    END IF;
    RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.academy_retrieval_mark_notified(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_retrieval_mark_notified(uuid) TO service_role;

-- Zestaw zamrożony przy pierwszym otwarciu; pytania z wcześniejszych powtórek tej osoby
-- idą dopiero wtedy, gdy zabrakło nowych.
CREATE FUNCTION public.academy_retrieval_open(p_schedule_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.academy_retrieval_schedule; v_used uuid[]; v_picked uuid[];
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO s FROM public.academy_retrieval_schedule WHERE id=p_schedule_id AND user_id=auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'retrieval_not_found' USING ERRCODE='42501'; END IF;
    IF s.due_at>now() THEN RAISE EXCEPTION 'retrieval_not_due'; END IF;
    IF cardinality(s.question_ids)=0 THEN
        SELECT COALESCE(array_agg(q),'{}') INTO v_used FROM public.academy_retrieval_schedule o,unnest(o.question_ids) q
            WHERE o.enrollment_id=s.enrollment_id AND o.id<>s.id;
        SELECT array_agg(id) INTO v_picked FROM (
            SELECT q.id FROM public.course_quiz_questions q WHERE q.version_id=s.version_id AND q.pool_status='approved' AND q.voided_at IS NULL
            ORDER BY (q.id=ANY(v_used)),random() LIMIT 3) picked;
        IF v_picked IS NULL THEN RAISE EXCEPTION 'retrieval_no_questions'; END IF;
        UPDATE public.academy_retrieval_schedule SET question_ids=v_picked WHERE id=s.id RETURNING * INTO s;
    END IF;
    RETURN jsonb_build_object('id',s.id,'offset_days',s.offset_days,'completed',s.completed_at IS NOT NULL,'questions',
        (SELECT jsonb_agg(jsonb_build_object('id',q.id,'text',q.question_text,'answer',academy_private.retrieval_reveal(s,q.id),
            'options',(SELECT jsonb_agg(jsonb_build_object('id',o.id,'text',o.option_text) ORDER BY o.order_index) FROM public.course_quiz_options o WHERE o.question_id=q.id)) ORDER BY t.ord)
         FROM unnest(s.question_ids) WITH ORDINALITY t(qid,ord) JOIN public.course_quiz_questions q ON q.id=t.qid));
END $$;

NOTIFY pgrst,'reload schema';

-- Klucz odsłaniany wyłącznie dla pytania, na które uczestnik już odpowiedział.
CREATE FUNCTION academy_private.retrieval_reveal(s public.academy_retrieval_schedule,p_question_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT CASE WHEN s.answers ? p_question_id::text THEN jsonb_build_object(
        'selected_option_id',s.answers->>p_question_id::text,
        'correct_option_id',o.id,'explanation',o.explanation) END
    FROM public.course_quiz_options o WHERE o.question_id=p_question_id AND o.is_correct LIMIT 1;
$$;
REVOKE ALL ON FUNCTION academy_private.retrieval_reveal(public.academy_retrieval_schedule,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.academy_retrieval_open(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_retrieval_open(uuid) TO authenticated;

CREATE FUNCTION public.academy_retrieval_answer(p_schedule_id uuid,p_question_id uuid,p_option_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.academy_retrieval_schedule;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO s FROM public.academy_retrieval_schedule WHERE id=p_schedule_id AND user_id=auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'retrieval_not_found' USING ERRCODE='42501'; END IF;
    IF NOT p_question_id=ANY(s.question_ids) THEN RAISE EXCEPTION 'retrieval_question_invalid'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.course_quiz_options WHERE id=p_option_id AND question_id=p_question_id) THEN RAISE EXCEPTION 'retrieval_question_invalid'; END IF;
    -- Pierwsza odpowiedź zostaje: po zobaczeniu klucza nie ma czego poprawiać.
    IF NOT s.answers ? p_question_id::text THEN
        UPDATE public.academy_retrieval_schedule SET answers=answers||jsonb_build_object(p_question_id::text,p_option_id) WHERE id=s.id RETURNING * INTO s;
        IF (SELECT count(*) FROM jsonb_object_keys(s.answers))>=cardinality(s.question_ids) THEN
            UPDATE public.academy_retrieval_schedule SET completed_at=now() WHERE id=s.id RETURNING * INTO s;
        END IF;
    END IF;
    RETURN academy_private.retrieval_reveal(s,p_question_id)||jsonb_build_object('completed',s.completed_at IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.academy_retrieval_answer(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_retrieval_answer(uuid,uuid,uuid) TO authenticated;

NOTIFY pgrst,'reload schema';

DO $$
BEGIN
    IF to_regclass('public.academy_retrieval_schedule') IS NULL THEN RAISE EXCEPTION 'schedule table missing'; END IF;
    IF has_table_privilege('authenticated','public.academy_retrieval_schedule','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'users can write schedule directly'; END IF;
    IF has_function_privilege('authenticated','public.academy_retrieval_due(integer)','EXECUTE')
        OR has_function_privilege('authenticated','public.academy_retrieval_mark_notified(uuid)','EXECUTE') THEN RAISE EXCEPTION 'dispatch exposed to users'; END IF;
    IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='academy_retrieval_schedule')<>1
        OR position('user_id = auth.uid()' IN (SELECT qual FROM pg_policies WHERE schemaname='public' AND tablename='academy_retrieval_schedule'))=0 THEN
        RAISE EXCEPTION 'result is visible beyond the participant';
    END IF;
END $$;

COMMIT;
