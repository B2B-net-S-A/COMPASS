-- B3.6: a report row that cannot be imported no longer stops the whole file.
-- The original preview and commit functions stay untouched: the new ones sort
-- rows first and pass only the clean ones through, so the single-transaction
-- guarantees of the import remain as reviewed in 20261005102339 and 20261006080417.
-- Rollback: supabase/rollbacks/20261109103000_academy_webinar_import_exceptions.sql
BEGIN;

ALTER TABLE public.academy_webinar_import_batches
 ADD COLUMN exceptions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(exceptions)='array');

-- Trainers and organizers appear in every Teams report but are not participants.
CREATE TABLE public.academy_webinar_excluded_emails (
 run_id uuid NOT NULL REFERENCES public.course_runs(id),
 email text NOT NULL CHECK(email=lower(btrim(email)) AND length(email)<=254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 note text CHECK(note IS NULL OR length(note)<=500),
 created_by uuid NOT NULL REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(run_id,email)
);

CREATE TABLE public.academy_webinar_exceptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES public.course_runs(id),
 session_id uuid REFERENCES public.course_sessions(id),
 batch_id uuid NOT NULL REFERENCES public.academy_webinar_import_batches(id),
 kind text NOT NULL CHECK(kind IN ('missing_email','invalid_row','waitlisted_in_teams','conflicting_names','ambiguous_summary','not_on_list','outside_window','cancelled_on_list','resigned','on_waitlist')),
 row_number integer NOT NULL CHECK(row_number>0),
 email text CHECK(email IS NULL OR length(email)<=254),
 full_name text CHECK(full_name IS NULL OR length(full_name)<=200),
 detail text NOT NULL CHECK(length(detail)<=500),
 intervals jsonb CHECK(intervals IS NULL OR jsonb_typeof(intervals)='array'),
 reported_seconds integer CHECK(reported_seconds IS NULL OR reported_seconds BETWEEN 0 AND 86400),
 dedupe_key text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','ignored','assigned')),
 roster_id uuid REFERENCES public.academy_webinar_roster(id),
 registration_id uuid REFERENCES public.course_run_registrations(id),
 note text CHECK(note IS NULL OR length(note)<=2000),
 resolved_by uuid REFERENCES public.profiles(id), resolved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='open')=(resolved_at IS NULL))
);
CREATE UNIQUE INDEX academy_webinar_exceptions_once ON public.academy_webinar_exceptions(run_id,COALESCE(session_id,'00000000-0000-0000-0000-000000000000'::uuid),dedupe_key);
CREATE INDEX academy_webinar_exceptions_run ON public.academy_webinar_exceptions(run_id,status);

ALTER TABLE public.academy_webinar_excluded_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_webinar_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_webinar_excluded_emails,public.academy_webinar_exceptions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.academy_webinar_excluded_emails,public.academy_webinar_exceptions TO service_role;
GRANT SELECT ON public.academy_webinar_excluded_emails,public.academy_webinar_exceptions TO authenticated;
CREATE POLICY academy_webinar_excluded_editor ON public.academy_webinar_excluded_emails FOR SELECT TO authenticated USING(public.academy_can_access() AND public.academy_is_global_editor());
CREATE POLICY academy_webinar_exceptions_editor ON public.academy_webinar_exceptions FOR SELECT TO authenticated USING(public.academy_can_access() AND public.academy_is_global_editor());

CREATE FUNCTION academy_private.webinar_exception(p_kind text,p_row integer,p_email text,p_name text,p_detail text,p_intervals jsonb DEFAULT NULL,p_reported integer DEFAULT NULL)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_strip_nulls(jsonb_build_object('kind',p_kind,'rowNumber',p_row,'email',p_email,'fullName',p_name,'message',left(p_detail,500),'intervals',p_intervals,'reportedSeconds',p_reported));
$$;
REVOKE ALL ON FUNCTION academy_private.webinar_exception(text,integer,text,text,text,jsonb,integer) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.academy_preview_webinar_import_v2(p_run_id uuid,p_kind text,p_rows jsonb,p_exceptions jsonb,p_source_hash text,p_session_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs; s public.course_sessions; row_item jsonb; x public.academy_webinar_roster; reg public.course_run_registrations; identity jsonb; clean jsonb:='[]'; found_exceptions jsonb:=COALESCE(p_exceptions,'[]'); v_email text; v_name text; v_user uuid; v_excluded integer:=0; v_index integer:=0; v_seconds_error text; v_result jsonb;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.academy_is_global_editor() THEN RAISE EXCEPTION 'Wymagany administrator lub TCM.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(found_exceptions) IS DISTINCT FROM 'array' OR jsonb_array_length(found_exceptions)>1000 OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>500 THEN RAISE EXCEPTION 'Nieprawidłowy import.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(found_exceptions) e WHERE jsonb_typeof(e)<>'object' OR e->>'kind' NOT IN ('missing_email','invalid_row','waitlisted_in_teams','conflicting_names','ambiguous_summary') OR COALESCE(e->>'rowNumber','') !~ '^[1-9][0-9]{0,6}$' OR length(COALESCE(e->>'message',''))>500 OR length(COALESCE(e->>'email',''))>254 OR length(COALESCE(e->>'fullName',''))>200) THEN RAISE EXCEPTION 'Nieprawidłowy import.'; END IF;
 SELECT * INTO r FROM public.course_runs WHERE id=p_run_id;
 IF NOT FOUND OR r.status='cancelled' THEN RAISE EXCEPTION 'Import dotyczy aktywnej edycji z istniejącym zewnętrznym Teams.'; END IF;
 IF p_kind='attendance' THEN
  SELECT * INTO s FROM public.course_sessions WHERE id=p_session_id AND run_id=r.id;
  IF NOT FOUND OR r.status<>'published' OR s.status<>'scheduled' OR s.meeting_mode<>'external_link' OR s.window_confirmed_at IS NULL OR s.actual_ends_at>now() THEN RAISE EXCEPTION 'Najpierw potwierdź rzeczywisty czas zakończonego spotkania.'; END IF;
 END IF;
 FOR row_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  v_index:=v_index+1;
  v_email:=lower(btrim(row_item->>'email')); v_name:=btrim(row_item->>'fullName');
  IF EXISTS(SELECT 1 FROM public.academy_webinar_excluded_emails WHERE run_id=r.id AND email=v_email) THEN v_excluded:=v_excluded+1; CONTINUE; END IF;
  identity:=academy_private.webinar_identity(v_email);
  v_user:=CASE WHEN jsonb_array_length(identity->'candidates')=1 THEN (identity->'candidates'->0->>'userId')::uuid END;
  x:=NULL; reg:=NULL;
  SELECT * INTO x FROM public.academy_webinar_roster WHERE run_id=r.id AND (email=v_email OR v_email=ANY(aliases) OR (v_user IS NOT NULL AND user_id=v_user)) ORDER BY CASE WHEN email=v_email THEN 0 ELSE 1 END LIMIT 1;
  IF v_user IS NOT NULL THEN SELECT * INTO reg FROM public.course_run_registrations WHERE run_id=r.id AND user_id=v_user; END IF;
  IF p_kind='registrations' THEN
   IF x.status='cancelled' THEN found_exceptions:=found_exceptions||jsonb_build_array(academy_private.webinar_exception('cancelled_on_list',v_index,v_email,v_name,'Uczestnik został anulowany w Compass.')); CONTINUE; END IF;
   IF reg.status='cancelled' THEN found_exceptions:=found_exceptions||jsonb_build_array(academy_private.webinar_exception('resigned',v_index,v_email,v_name,'Konto zrezygnowało z edycji.')); CONTINUE; END IF;
   IF reg.status='waitlisted' THEN found_exceptions:=found_exceptions||jsonb_build_array(academy_private.webinar_exception('on_waitlist',v_index,v_email,v_name,'Osoba czeka na liście rezerwowej Compass.')); CONTINUE; END IF;
  ELSE
   -- Several candidates go through the operator's choice in the preview; the commit re-checks it.
   IF jsonb_array_length(identity->'candidates')<=1 AND x.id IS NULL AND reg.id IS NULL
      OR jsonb_array_length(identity->'candidates')<=1 AND COALESCE(x.status,'')<>'confirmed' AND COALESCE(reg.status,'')<>'confirmed' THEN
    found_exceptions:=found_exceptions||jsonb_build_array(academy_private.webinar_exception('not_on_list',v_index,v_email,v_name,'Osoby nie ma na liście tej edycji.',row_item->'intervals',(row_item->>'reportedSeconds')::integer)); CONTINUE;
   END IF;
   v_seconds_error:=NULL;
   BEGIN
    PERFORM academy_private.webinar_seconds(row_item->'intervals',s.actual_starts_at,s.actual_ends_at,(row_item->>'reportedSeconds')::integer);
   EXCEPTION WHEN raise_exception THEN v_seconds_error:=SQLERRM;
   END;
   IF v_seconds_error IS NOT NULL THEN found_exceptions:=found_exceptions||jsonb_build_array(academy_private.webinar_exception('outside_window',v_index,v_email,v_name,v_seconds_error,row_item->'intervals',(row_item->>'reportedSeconds')::integer)); CONTINUE; END IF;
  END IF;
  clean:=clean||jsonb_build_array(row_item);
 END LOOP;
 -- With nothing importable no batch exists; the operator sees why and corrects the source.
 IF jsonb_array_length(clean)=0 THEN RETURN jsonb_build_object('id',NULL,'kind',p_kind,'rows','[]'::jsonb,'expiresAt',NULL,'exceptions',found_exceptions,'excludedCount',v_excluded,'exceptionsAvailable',true); END IF;
 v_result:=public.academy_preview_webinar_import(p_run_id,p_kind,clean,p_source_hash,p_session_id);
 UPDATE public.academy_webinar_import_batches SET exceptions=found_exceptions WHERE id=(v_result->>'id')::uuid;
 RETURN v_result||jsonb_build_object('exceptions',found_exceptions,'excludedCount',v_excluded,'exceptionsAvailable',true);
END $$;

CREATE FUNCTION public.academy_commit_webinar_import_v2(p_batch_id uuid,p_resolutions jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE batch public.academy_webinar_import_batches; v_result jsonb; v_kept integer;
BEGIN
 -- Same transaction: a failed import leaves no exception rows behind.
 v_result:=public.academy_commit_webinar_import(p_batch_id,p_resolutions);
 SELECT * INTO batch FROM public.academy_webinar_import_batches WHERE id=p_batch_id AND created_by=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Podgląd nie należy do tego operatora.' USING ERRCODE='42501'; END IF;
 INSERT INTO public.academy_webinar_exceptions(run_id,session_id,batch_id,kind,row_number,email,full_name,detail,intervals,reported_seconds,dedupe_key)
 SELECT batch.run_id,batch.session_id,batch.id,e->>'kind',(e->>'rowNumber')::integer,NULLIF(e->>'email',''),NULLIF(e->>'fullName',''),COALESCE(e->>'message',''),e->'intervals',(e->>'reportedSeconds')::integer,
  md5(concat_ws('|',e->>'kind',e->>'email',e->>'fullName',e->>'intervals'))
 FROM jsonb_array_elements(batch.exceptions) e
 ON CONFLICT DO NOTHING;
 SELECT count(*) INTO v_kept FROM public.academy_webinar_exceptions WHERE batch_id=batch.id;
 RETURN v_result||jsonb_build_object('exceptions',v_kept);
END $$;

CREATE FUNCTION public.academy_list_webinar_exceptions(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.academy_can_access() OR NOT public.academy_is_global_editor() THEN RAISE EXCEPTION 'Wymagany administrator lub TCM.' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'sessionId',e.session_id,'kind',e.kind,'rowNumber',e.row_number,'email',e.email,'fullName',e.full_name,'detail',e.detail,'connections',jsonb_array_length(COALESCE(e.intervals,'[]'::jsonb)),'status',e.status,'note',e.note,'resolvedAt',e.resolved_at) ORDER BY e.status='open' DESC,e.created_at,e.id)
  FROM (SELECT * FROM public.academy_webinar_exceptions WHERE run_id=p_run_id ORDER BY status='open' DESC,created_at,id LIMIT 1000) e),'[]'::jsonb);
END $$;

CREATE FUNCTION public.academy_resolve_webinar_exception(p_exception_id uuid,p_decision text,p_roster_id uuid,p_registration_id uuid,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.academy_webinar_exceptions; r public.course_runs; s public.course_sessions; x public.academy_webinar_roster; reg public.course_run_registrations; v_seconds integer; v_threshold integer; v_status text; v_course uuid;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.academy_is_global_editor() THEN RAISE EXCEPTION 'Wymagany administrator lub TCM.' USING ERRCODE='42501'; END IF;
 IF COALESCE(length(btrim(p_note)),0) NOT BETWEEN 10 AND 2000 OR p_decision IS NULL OR p_decision NOT IN ('ignore','assign') THEN RAISE EXCEPTION 'Podaj decyzję i uzasadnienie (co najmniej 10 znaków).'; END IF;
 SELECT * INTO e FROM public.academy_webinar_exceptions WHERE id=p_exception_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Nie znaleziono wyjątku importu.'; END IF;
 IF e.status<>'open' THEN RAISE EXCEPTION 'Ten wyjątek został już rozstrzygnięty.'; END IF;
 SELECT * INTO r FROM public.course_runs WHERE id=e.run_id;
 v_course:=r.course_id;
 IF p_decision='assign' THEN
  IF e.session_id IS NULL OR e.intervals IS NULL OR jsonb_array_length(e.intervals)=0 THEN RAISE EXCEPTION 'Ten wiersz nie zawiera czasu obecności, który można przypisać.'; END IF;
  IF (p_roster_id IS NULL)=(p_registration_id IS NULL) THEN RAISE EXCEPTION 'Wskaż dokładnie jedną osobę z listy tej edycji.'; END IF;
  SELECT * INTO s FROM public.course_sessions WHERE id=e.session_id FOR UPDATE;
  IF NOT FOUND OR s.status<>'scheduled' OR s.window_confirmed_at IS NULL THEN RAISE EXCEPTION 'Najpierw potwierdź rzeczywisty czas zakończonego spotkania.'; END IF;
  IF p_roster_id IS NOT NULL THEN
   SELECT * INTO x FROM public.academy_webinar_roster WHERE id=p_roster_id AND run_id=e.run_id AND status='confirmed' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Wskazanej osoby nie ma na liście tej edycji.'; END IF;
   IF x.user_id IS NOT NULL THEN SELECT * INTO reg FROM public.course_run_registrations WHERE run_id=e.run_id AND user_id=x.user_id AND status='confirmed' FOR UPDATE; END IF;
  ELSE
   SELECT * INTO reg FROM public.course_run_registrations WHERE id=p_registration_id AND run_id=e.run_id AND status='confirmed' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Wskazanej osoby nie ma na liście tej edycji.'; END IF;
   SELECT * INTO x FROM public.academy_webinar_roster WHERE run_id=e.run_id AND user_id=reg.user_id AND status='confirmed' FOR UPDATE;
  END IF;
  IF reg.id IS NOT NULL AND (reg.user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.course_enrollments WHERE id=reg.enrollment_id AND completed_at IS NOT NULL) OR EXISTS(SELECT 1 FROM public.course_completions WHERE enrollment_id=reg.enrollment_id) OR EXISTS(SELECT 1 FROM public.session_attendance WHERE session_id=s.id AND enrollment_id=reg.enrollment_id AND source='manual')) THEN
   RAISE EXCEPTION 'Tej osoby nie można zmienić: ma już ręczną decyzję, certyfikat albo to Twoja obecność.';
  END IF;
  v_seconds:=academy_private.webinar_seconds(e.intervals,s.actual_starts_at,s.actual_ends_at,e.reported_seconds);
  SELECT (completion_rules->>'attendance_percent')::integer INTO v_threshold FROM public.course_versions WHERE id=r.version_id;
  v_status:=CASE WHEN v_seconds>=ceil(extract(epoch FROM s.actual_ends_at-s.actual_starts_at)*v_threshold/100.0) THEN 'present' ELSE 'insufficient' END;
  IF x.id IS NOT NULL THEN
   INSERT INTO public.academy_webinar_attendance(roster_id,session_id,attended_seconds,status,batch_id,imported_by) VALUES(x.id,s.id,v_seconds,v_status,e.batch_id,auth.uid())
    ON CONFLICT(roster_id,session_id) DO UPDATE SET attended_seconds=EXCLUDED.attended_seconds,status=EXCLUDED.status,batch_id=EXCLUDED.batch_id,imported_by=EXCLUDED.imported_by,imported_at=now();
  END IF;
  IF reg.id IS NOT NULL THEN
   INSERT INTO public.session_attendance(session_id,enrollment_id,status,attended_seconds,source,reviewed_by,note,report_ids)
   VALUES(s.id,reg.enrollment_id,v_status,v_seconds,'manual',auth.uid(),btrim(p_note),jsonb_build_array('exception:'||e.id))
   ON CONFLICT(session_id,enrollment_id) DO UPDATE SET status=EXCLUDED.status,attended_seconds=EXCLUDED.attended_seconds,source=EXCLUDED.source,reviewed_by=EXCLUDED.reviewed_by,note=EXCLUDED.note,report_ids=EXCLUDED.report_ids,updated_at=now();
   PERFORM academy_private.finalize_enrollment(reg.enrollment_id);
  END IF;
 END IF;
 UPDATE public.academy_webinar_exceptions SET status=CASE WHEN p_decision='assign' THEN 'assigned' ELSE 'ignored' END,roster_id=x.id,registration_id=reg.id,note=btrim(p_note),resolved_by=auth.uid(),resolved_at=now() WHERE id=e.id;
 INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(auth.uid(),'ACADEMY_WEBINAR_EXCEPTION_RESOLVED',v_course,jsonb_build_object('run_id',e.run_id,'session_id',e.session_id,'exception_id',e.id,'kind',e.kind,'decision',p_decision,'roster_id',x.id,'registration_id',reg.id));
 RETURN jsonb_build_object('status',CASE WHEN p_decision='assign' THEN 'assigned' ELSE 'ignored' END,'attendedSeconds',v_seconds);
END $$;

CREATE FUNCTION public.academy_list_webinar_excluded(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.academy_can_access() OR NOT public.academy_is_global_editor() THEN RAISE EXCEPTION 'Wymagany administrator lub TCM.' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('email',email,'note',note) ORDER BY email) FROM public.academy_webinar_excluded_emails WHERE run_id=p_run_id),'[]'::jsonb);
END $$;

CREATE FUNCTION public.academy_set_webinar_excluded(p_run_id uuid,p_email text,p_excluded boolean,p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_email text:=lower(btrim(p_email)); v_course uuid;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.academy_is_global_editor() THEN RAISE EXCEPTION 'Wymagany administrator lub TCM.' USING ERRCODE='42501'; END IF;
 SELECT course_id INTO v_course FROM public.course_runs WHERE id=p_run_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Nie znaleziono edycji.'; END IF;
 IF v_email IS NULL OR length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Podaj prawidłowy adres e-mail.'; END IF;
 IF p_excluded IS NOT DISTINCT FROM true THEN
  INSERT INTO public.academy_webinar_excluded_emails(run_id,email,note,created_by) VALUES(p_run_id,v_email,NULLIF(left(btrim(p_note),500),''),auth.uid()) ON CONFLICT(run_id,email) DO UPDATE SET note=EXCLUDED.note;
 ELSE
  DELETE FROM public.academy_webinar_excluded_emails WHERE run_id=p_run_id AND email=v_email;
 END IF;
 INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(auth.uid(),'ACADEMY_WEBINAR_EXCLUSION_CHANGED',v_course,jsonb_build_object('run_id',p_run_id,'excluded',p_excluded IS NOT DISTINCT FROM true));
END $$;

REVOKE ALL ON FUNCTION public.academy_preview_webinar_import_v2(uuid,text,jsonb,jsonb,text,uuid),public.academy_commit_webinar_import_v2(uuid,jsonb),public.academy_list_webinar_exceptions(uuid),public.academy_resolve_webinar_exception(uuid,text,uuid,uuid,text),public.academy_list_webinar_excluded(uuid),public.academy_set_webinar_excluded(uuid,text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_preview_webinar_import_v2(uuid,text,jsonb,jsonb,text,uuid),public.academy_commit_webinar_import_v2(uuid,jsonb),public.academy_list_webinar_exceptions(uuid),public.academy_resolve_webinar_exception(uuid,text,uuid,uuid,text),public.academy_list_webinar_excluded(uuid),public.academy_set_webinar_excluded(uuid,text,boolean,text) TO authenticated;

DO $$
DECLARE missing text;
BEGIN
 SELECT string_agg(t,', ') INTO missing FROM unnest(ARRAY['academy_webinar_excluded_emails','academy_webinar_exceptions']) t WHERE NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity);
 IF missing IS NOT NULL THEN RAISE EXCEPTION 'B3.6: brak tabeli albo RLS: %',missing; END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='academy_webinar_import_batches' AND column_name='exceptions') THEN RAISE EXCEPTION 'B3.6: brak kolumny exceptions.'; END IF;
 IF has_function_privilege('anon','public.academy_resolve_webinar_exception(uuid,text,uuid,uuid,text)','EXECUTE') OR has_function_privilege('anon','public.academy_preview_webinar_import_v2(uuid,text,jsonb,jsonb,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'B3.6: anon nie może wykonywać funkcji importu.'; END IF;
 IF NOT has_function_privilege('authenticated','public.academy_commit_webinar_import_v2(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'B3.6: brak uprawnienia authenticated.'; END IF;
END $$;
COMMIT;
