BEGIN;
-- Edition feedback is independent of the later self-paced course package.
CREATE TABLE public.academy_edition_survey_settings (
 run_id uuid PRIMARY KEY REFERENCES public.course_runs(id),
 introduction text NOT NULL DEFAULT 'Pomóż nam rozwijać kolejne szkolenia. Oceny są prezentowane prowadzącemu zbiorczo. Deklaracja prowadzenia i preferencja kontaktu są dostępne tylko administratorowi.' CHECK(length(introduction) BETWEEN 1 AND 2000),
 labels jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(labels)='object'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.academy_edition_survey_responses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES public.course_runs(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 enrollment_id uuid NOT NULL REFERENCES public.course_enrollments(id),
 registration_id uuid NOT NULL REFERENCES public.course_run_registrations(id),
 overall integer NOT NULL CHECK(overall BETWEEN 1 AND 5),
 trainer integer NOT NULL CHECK(trainer BETWEEN 1 AND 5),
 materials integer CHECK(materials BETWEEN 1 AND 5),
 difficulty text NOT NULL CHECK(difficulty IN ('too_easy','appropriate','too_hard')),
 future_topics text CHECK(length(future_topics)<=2000),
 nps integer CHECK(nps BETWEEN 0 AND 10),
 question_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,user_id)
);
CREATE TABLE academy_private.edition_teaching_interest (
 response_id uuid PRIMARY KEY REFERENCES public.academy_edition_survey_responses(id),
 willing_to_teach boolean NOT NULL,
 proposed_topic text CHECK(length(proposed_topic)<=2000),
 contact_preference text NOT NULL CHECK(contact_preference IN ('none','compass','contract_email')),
 CHECK(willing_to_teach OR (proposed_topic IS NULL AND contact_preference='none'))
);
ALTER TABLE public.academy_edition_survey_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_edition_survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_private.edition_teaching_interest ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_edition_survey_settings,public.academy_edition_survey_responses,academy_private.edition_teaching_interest FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.academy_edition_survey_responses TO authenticated;
GRANT ALL ON public.academy_edition_survey_settings,public.academy_edition_survey_responses,academy_private.edition_teaching_interest TO service_role;
-- Assigned staff receive aggregates through a guarded RPC, never named scores.
CREATE POLICY academy_edition_survey_own ON public.academy_edition_survey_responses FOR SELECT TO authenticated
 USING(public.academy_can_access() AND user_id=(SELECT auth.uid()));
CREATE FUNCTION academy_private.edition_survey_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 RAISE EXCEPTION 'Wysłana ankieta edycji jest niezmienna.';
END $$;
REVOKE ALL ON FUNCTION academy_private.edition_survey_immutable() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER academy_edition_survey_immutable BEFORE UPDATE ON public.academy_edition_survey_responses
 FOR EACH ROW EXECUTE FUNCTION academy_private.edition_survey_immutable();
CREATE FUNCTION academy_private.edition_survey_eligible(p_run_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.academy_can_access() AND EXISTS(SELECT 1 FROM public.course_run_registrations reg
 JOIN public.course_enrollments e ON e.id=reg.enrollment_id AND e.run_id=reg.run_id AND e.user_id=reg.user_id
 WHERE reg.run_id=p_run_id AND reg.user_id=auth.uid() AND reg.status='confirmed'
 AND public.academy_attendance_satisfied(e.id));
$$;
REVOKE ALL ON FUNCTION academy_private.edition_survey_eligible(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.academy_edition_survey_state(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE config jsonb; response uuid;
BEGIN
 IF NOT public.academy_can_access() OR NOT(public.academy_can_manage_run(p_run_id) OR EXISTS(
 SELECT 1 FROM public.course_run_registrations WHERE run_id=p_run_id AND user_id=auth.uid())) THEN
 RAISE EXCEPTION 'Brak dostępu do ankiety edycji.' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('introduction',s.introduction,'labels',s.labels) INTO config FROM public.academy_edition_survey_settings s WHERE s.run_id=p_run_id;
 SELECT id INTO response FROM public.academy_edition_survey_responses WHERE run_id=p_run_id AND user_id=auth.uid();
 RETURN jsonb_build_object('eligible',academy_private.edition_survey_eligible(p_run_id),'submitted',response IS NOT NULL,
 'settings',COALESCE(config,jsonb_build_object('introduction','Pomóż nam rozwijać kolejne szkolenia. Oceny są prezentowane prowadzącemu zbiorczo. Deklaracja prowadzenia i preferencja kontaktu są dostępne tylko administratorowi.','labels','{}'::jsonb)));
END $$;
CREATE FUNCTION public.academy_save_edition_survey_settings(p_run_id uuid,p_introduction text,p_labels jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE pair record;
BEGIN
 IF NOT public.academy_can_manage_run(p_run_id) THEN RAISE EXCEPTION 'Brak uprawnień do ankiety.' USING ERRCODE='42501'; END IF;
 -- Preserve exactly which questions each submitted response answered.
 IF length(btrim(p_introduction)) NOT BETWEEN 1 AND 2000 OR jsonb_typeof(p_labels) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Nieprawidłowe pytania ankiety.'; END IF;
 FOR pair IN SELECT * FROM jsonb_each(p_labels) LOOP
 IF pair.key NOT IN ('overall','trainer','materials','difficulty','futureTopics','willingToTeach') OR jsonb_typeof(pair.value)<>'string' OR length(btrim(pair.value#>>'{}')) NOT BETWEEN 1 AND 250 THEN RAISE EXCEPTION 'Nieprawidłowa etykieta ankiety.'; END IF;
 END LOOP;
 INSERT INTO public.academy_edition_survey_settings(run_id,introduction,labels) VALUES(p_run_id,btrim(p_introduction),p_labels)
 ON CONFLICT(run_id) DO UPDATE SET introduction=EXCLUDED.introduction,labels=EXCLUDED.labels,updated_at=now();
 INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
 SELECT auth.uid(),'ACADEMY_EDITION_SURVEY_CONFIGURED',course_id,jsonb_build_object('run_id',id) FROM public.course_runs WHERE id=p_run_id;
END $$;
CREATE FUNCTION public.academy_submit_edition_survey(p_run_id uuid,p_answers jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE reg public.course_run_registrations; response uuid; willing boolean; topic text; preference text; snapshot jsonb;
BEGIN
 IF NOT academy_private.edition_survey_eligible(p_run_id) THEN RAISE EXCEPTION 'Ankieta jest dostępna po potwierdzeniu obecności na tej edycji.' USING ERRCODE='42501'; END IF;
 SELECT * INTO reg FROM public.course_run_registrations WHERE run_id=p_run_id AND user_id=auth.uid() FOR UPDATE;
 SELECT id INTO response FROM public.academy_edition_survey_responses WHERE run_id=p_run_id AND user_id=auth.uid();
 IF response IS NOT NULL THEN RETURN response; END IF;
 IF jsonb_typeof(p_answers)<>'object' OR jsonb_typeof(p_answers->'overall') IS DISTINCT FROM 'number'
 OR jsonb_typeof(p_answers->'trainer') IS DISTINCT FROM 'number' OR jsonb_typeof(p_answers->'willingToTeach') IS DISTINCT FROM 'boolean'
 OR (p_answers->>'overall')!~'^[1-5]$' OR (p_answers->>'trainer')!~'^[1-5]$'
 OR (p_answers ? 'materials' AND p_answers->'materials'<>'null'::jsonb AND (jsonb_typeof(p_answers->'materials')<>'number' OR (p_answers->>'materials')!~'^[1-5]$'))
 OR (p_answers ? 'nps' AND p_answers->'nps'<>'null'::jsonb AND (jsonb_typeof(p_answers->'nps')<>'number' OR (p_answers->>'nps')!~'^(10|[0-9])$'))
 OR p_answers->>'difficulty' IS NULL OR p_answers->>'difficulty' NOT IN ('too_easy','appropriate','too_hard')
 OR (p_answers ? 'futureTopics' AND jsonb_typeof(p_answers->'futureTopics') NOT IN ('string','null'))
 OR (p_answers ? 'proposedTopic' AND jsonb_typeof(p_answers->'proposedTopic') NOT IN ('string','null'))
 OR length(p_answers->>'futureTopics')>2000 OR length(p_answers->>'proposedTopic')>2000 THEN RAISE EXCEPTION 'Nieprawidłowe odpowiedzi ankiety.'; END IF;
 willing:=(p_answers->>'willingToTeach')::boolean;
 topic:=CASE WHEN willing THEN nullif(btrim(p_answers->>'proposedTopic'),'') END;
 preference:=CASE WHEN willing THEN COALESCE(p_answers->>'contactPreference','none') ELSE 'none' END;
 IF preference NOT IN ('none','compass','contract_email') THEN RAISE EXCEPTION 'Nieprawidłowa preferencja kontaktu.'; END IF;
 snapshot:=(public.academy_edition_survey_state(p_run_id))->'settings';
 INSERT INTO public.academy_edition_survey_responses(run_id,user_id,enrollment_id,registration_id,overall,trainer,materials,difficulty,future_topics,nps,question_snapshot)
 VALUES(p_run_id,auth.uid(),reg.enrollment_id,reg.id,(p_answers->>'overall')::int,(p_answers->>'trainer')::int,
 (p_answers->>'materials')::int,p_answers->>'difficulty',nullif(btrim(p_answers->>'futureTopics'),''),(p_answers->>'nps')::int,snapshot) RETURNING id INTO response;
 INSERT INTO academy_private.edition_teaching_interest VALUES(response,willing,topic,preference);
 INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
 SELECT auth.uid(),'ACADEMY_EDITION_SURVEY_SUBMITTED',course_id,jsonb_build_object('run_id',id,'response_id',response) FROM public.course_runs WHERE id=p_run_id;
 RETURN response;
END $$;
CREATE FUNCTION public.academy_edition_survey_report(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; interests jsonb;
BEGIN
 IF NOT public.academy_can_manage_run(p_run_id) THEN RAISE EXCEPTION 'Brak uprawnień do wyników ankiety.' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('responseCount',count(*),'overall',round(avg(overall),2),'trainer',round(avg(trainer),2),
 'materials',round(avg(materials),2),'materialsResponseCount',count(materials),'nps',round(avg(nps),2),
 'difficulty',jsonb_build_object('too_easy',count(*) FILTER(WHERE difficulty='too_easy'),'appropriate',count(*) FILTER(WHERE difficulty='appropriate'),'too_hard',count(*) FILTER(WHERE difficulty='too_hard')),
 'futureTopics',COALESCE(jsonb_agg(future_topics ORDER BY created_at) FILTER(WHERE future_topics IS NOT NULL),'[]')) INTO result
 FROM public.academy_edition_survey_responses WHERE run_id=p_run_id;
 IF public.is_admin() THEN
 SELECT COALESCE(jsonb_agg(jsonb_build_object('userId',r.user_id,'fullName',p.full_name,'proposedTopic',i.proposed_topic,'contactPreference',i.contact_preference) ORDER BY r.created_at),'[]') INTO interests
 FROM public.academy_edition_survey_responses r JOIN academy_private.edition_teaching_interest i ON i.response_id=r.id
 JOIN public.profiles p ON p.id=r.user_id WHERE r.run_id=p_run_id AND i.willing_to_teach;
 result:=result||jsonb_build_object('teachingInterests',interests);
 END IF;
 RETURN result;
END $$;
-- Existing historical live answers are retained, but new live feedback uses its edition.
CREATE OR REPLACE FUNCTION public.academy_submit_survey(p_enrollment_id uuid,p_nps_score integer,p_best_part text DEFAULT NULL,p_improvement_suggestion text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments%ROWTYPE; v_id uuid;
BEGIN
 IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.course_completions WHERE enrollment_id=e.id AND user_id=auth.uid() AND revoked_at IS NULL) THEN
 RAISE EXCEPTION 'own_trusted_completion_required' USING ERRCODE='42501'; END IF;
 IF p_nps_score IS NULL OR p_nps_score NOT BETWEEN 0 AND 10 OR length(p_best_part)>1000 OR length(p_improvement_suggestion)>1000 THEN RAISE EXCEPTION 'invalid_survey'; END IF;
 SELECT id INTO v_id FROM public.course_survey_responses WHERE user_id=e.user_id AND course_id=e.course_id;
 IF FOUND THEN RETURN v_id; END IF;
 IF e.run_id IS NOT NULL THEN RAISE EXCEPTION 'Wypełnij ankietę przypisaną do edycji szkolenia.'; END IF;
 INSERT INTO public.course_survey_responses(user_id,course_id,enrollment_id,nps_score,best_part,improvement_suggestion)
 VALUES(e.user_id,e.course_id,e.id,p_nps_score,p_best_part,p_improvement_suggestion) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
CREATE FUNCTION public.academy_course_survey_history()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.academy_is_trainer() THEN RAISE EXCEPTION 'Brak uprawnień do wyników kursu.' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(row_data ORDER BY row_data->>'title') FROM (
 SELECT jsonb_build_object('courseId',c.id,'title',c.title,'responseCount',count(s.id),
 'averageNps',round(avg(s.nps_score),2),'bestParts',COALESCE(jsonb_agg(s.best_part ORDER BY s.submitted_at) FILTER(WHERE s.best_part IS NOT NULL),'[]'),
 'improvements',COALESCE(jsonb_agg(s.improvement_suggestion ORDER BY s.submitted_at) FILTER(WHERE s.improvement_suggestion IS NOT NULL),'[]')) row_data
 FROM public.courses c JOIN public.course_survey_responses s ON s.course_id=c.id
 WHERE public.academy_can_lead_course(c.id) GROUP BY c.id,c.title) history),'[]');
END $$;
REVOKE ALL ON FUNCTION public.academy_course_survey_history() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_course_survey_history() TO authenticated;
REVOKE ALL ON FUNCTION public.academy_edition_survey_state(uuid),public.academy_save_edition_survey_settings(uuid,text,jsonb),public.academy_submit_edition_survey(uuid,jsonb),public.academy_edition_survey_report(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_edition_survey_state(uuid),public.academy_save_edition_survey_settings(uuid,text,jsonb),public.academy_submit_edition_survey(uuid,jsonb),public.academy_edition_survey_report(uuid) TO authenticated;
COMMIT;
