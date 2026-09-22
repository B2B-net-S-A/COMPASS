-- Published requirements survive cancellation, rescheduling and explicit replacement.
BEGIN;
ALTER TABLE public.course_sessions ADD CONSTRAINT academy_session_same_run UNIQUE(id,run_id);
ALTER TABLE public.course_sessions ADD COLUMN replaces_session_id uuid,
 ADD COLUMN replacement_reason text, ADD COLUMN external_cancellation_confirmed boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT academy_session_replaces_once UNIQUE(replaces_session_id),
 ADD CONSTRAINT academy_session_replaces_same_run FOREIGN KEY(replaces_session_id,run_id) REFERENCES public.course_sessions(id,run_id),
 ADD CONSTRAINT academy_session_replacement_reason CHECK((replaces_session_id IS NULL AND replacement_reason IS NULL)
 OR (replaces_session_id IS NOT NULL AND replaces_session_id<>id AND replacement_reason IS NOT NULL AND length(btrim(replacement_reason)) BETWEEN 5 AND 2000));
CREATE TABLE academy_private.run_obligations (
 run_id uuid NOT NULL REFERENCES public.course_runs(id),
 original_session_id uuid NOT NULL, active_session_id uuid NOT NULL,
 PRIMARY KEY(run_id,original_session_id), UNIQUE(active_session_id),
 FOREIGN KEY(original_session_id,run_id) REFERENCES public.course_sessions(id,run_id),
 FOREIGN KEY(active_session_id,run_id) REFERENCES public.course_sessions(id,run_id)
);
REVOKE ALL ON academy_private.run_obligations FROM PUBLIC,anon,authenticated,service_role;
-- Fail closed for pre-existing published sessions: cancelled requirements remain owed.
INSERT INTO academy_private.run_obligations(run_id,original_session_id,active_session_id)
 SELECT s.run_id,s.id,s.id FROM public.course_sessions s JOIN public.course_runs r ON r.id=s.run_id
 WHERE r.published_at IS NOT NULL AND s.required;

CREATE FUNCTION academy_private.freeze_run_obligations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.published_at IS NOT NULL AND (NEW.version_id<>OLD.version_id OR NEW.course_id<>OLD.course_id
  OR NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.status='draft'
  OR (OLD.status='cancelled' AND NEW.status<>'cancelled')) THEN
  RAISE EXCEPTION 'Program i opublikowane wymagania edycji są niezmienne.';
 END IF;
 IF OLD.published_at IS NULL AND NEW.status='published' THEN
  INSERT INTO academy_private.run_obligations(run_id,original_session_id,active_session_id)
   SELECT NEW.id,s.id,s.id FROM public.course_sessions s WHERE s.run_id=NEW.id AND s.required AND s.status='scheduled';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_freeze_run_obligations BEFORE UPDATE ON public.course_runs
 FOR EACH ROW EXECUTE FUNCTION academy_private.freeze_run_obligations();

CREATE FUNCTION academy_private.session_can_replace(p_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.course_sessions s JOIN public.course_runs r ON r.id=s.run_id
 WHERE s.id=p_session_id AND s.status='cancelled' AND r.status='published'
 AND NOT EXISTS(SELECT 1 FROM public.course_enrollments e WHERE e.run_id=r.id AND e.completed_at IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM public.course_sessions child WHERE child.replaces_session_id=s.id)
 AND (NOT s.required OR EXISTS(SELECT 1 FROM academy_private.run_obligations o WHERE o.run_id=r.id AND o.active_session_id=s.id))
 AND (s.meeting_mode='external_link' OR (s.sync_status='cancelled'
  AND NOT EXISTS(SELECT 1 FROM public.academy_session_integrations i WHERE i.session_id=s.id AND i.cancelled_at IS NULL)
  AND NOT EXISTS(SELECT 1 FROM public.academy_integration_jobs j WHERE j.session_id=s.id AND j.status IN ('pending','processing','retry','failed')))));
$$;
CREATE FUNCTION academy_private.guard_session_obligations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs; previous public.course_sessions;
BEGIN
 SELECT * INTO r FROM public.course_runs WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.run_id ELSE NEW.run_id END FOR UPDATE;
 IF TG_OP='DELETE' THEN
  IF r.published_at IS NOT NULL THEN RAISE EXCEPTION 'Opublikowane spotkanie zachowuje historię; użyj odwołania.'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.run_id<>OLD.run_id OR NEW.replaces_session_id IS DISTINCT FROM OLD.replaces_session_id
   OR NEW.replacement_reason IS DISTINCT FROM OLD.replacement_reason OR NEW.external_cancellation_confirmed<>OLD.external_cancellation_confirmed THEN
   RAISE EXCEPTION 'Nie można zmieniać powiązań i uzasadnienia zastępstwa.';
  END IF;
  IF r.published_at IS NOT NULL AND (NEW.required<>OLD.required OR (OLD.status='cancelled' AND NEW.status<>'cancelled')
   OR NEW.meeting_mode<>OLD.meeting_mode OR NEW.organizer_id IS DISTINCT FROM OLD.organizer_id) THEN
   RAISE EXCEPTION 'Opublikowane wymagania i organizator są niezmienne; użyj jawnego zastępstwa odwołanej sesji.';
  END IF;
 ELSE
  IF NEW.replaces_session_id IS NOT NULL THEN
   SELECT * INTO previous FROM public.course_sessions WHERE id=NEW.replaces_session_id AND run_id=NEW.run_id FOR UPDATE;
   IF NOT FOUND OR NOT academy_private.session_can_replace(previous.id) THEN
    RAISE EXCEPTION 'Zastępstwo wymaga odwołanej sesji i zakończonej synchronizacji odwołania Teams.';
   END IF;
   IF NEW.required<>previous.required THEN RAISE EXCEPTION 'Zastępstwo zachowuje obowiązek obecności poprzedniej sesji.'; END IF;
   IF previous.meeting_mode='external_link' AND NOT NEW.external_cancellation_confirmed THEN
    RAISE EXCEPTION 'Potwierdź odwołanie poprzedniego spotkania u zewnętrznego organizatora.';
   END IF;
  ELSIF r.published_at IS NOT NULL AND NEW.required THEN
   RAISE EXCEPTION 'Nie można dodawać wymagań do opublikowanej edycji. Użyj zastępstwa albo nowej edycji.';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_guard_session_obligations BEFORE INSERT OR UPDATE OR DELETE ON public.course_sessions
 FOR EACH ROW EXECUTE FUNCTION academy_private.guard_session_obligations();
CREATE FUNCTION academy_private.transfer_session_obligation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.replaces_session_id IS NOT NULL THEN
  IF NEW.required THEN
   UPDATE academy_private.run_obligations SET active_session_id=NEW.id WHERE run_id=NEW.run_id AND active_session_id=NEW.replaces_session_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Nie znaleziono obowiązku do przeniesienia.'; END IF;
  END IF;
  INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
   SELECT auth.uid(),'ACADEMY_SESSION_REPLACED',course_id,jsonb_build_object('run_id',NEW.run_id,
    'session_id',NEW.id,'replaces_session_id',NEW.replaces_session_id,'reason',NEW.replacement_reason,
    'external_cancellation_confirmed',NEW.external_cancellation_confirmed) FROM public.course_runs WHERE id=NEW.run_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_transfer_session_obligation AFTER INSERT ON public.course_sessions
 FOR EACH ROW EXECUTE FUNCTION academy_private.transfer_session_obligation();

CREATE OR REPLACE FUNCTION public.academy_save_session(p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs; s public.course_sessions; v_id uuid; v_mode text:=p_input->>'mode'; v_organizer uuid;
BEGIN
    IF NOT public.academy_can_manage_run((p_input->>'runId')::uuid) THEN RAISE EXCEPTION 'Brak uprawnień do spotkania.' USING ERRCODE='42501'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=(p_input->>'runId')::uuid FOR UPDATE;
    IF r.status='cancelled' THEN RAISE EXCEPTION 'Edycja jest odwołana.'; END IF;
    IF EXISTS(SELECT 1 FROM public.course_enrollments WHERE run_id=r.id AND completed_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Nie można zmieniać sesji edycji z wystawionym certyfikatem.';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_input->>'timeZone') THEN RAISE EXCEPTION 'Nieprawidłowa strefa czasowa.'; END IF;
    IF (p_input->>'startsAt')::timestamptz<=now() THEN RAISE EXCEPTION 'Nowy termin musi być w przyszłości.'; END IF;
    IF v_mode='external_link' THEN
        IF NOT COALESCE(academy_private.valid_teams_url(p_input->>'externalJoinUrl'),false) THEN RAISE EXCEPTION 'Wprowadź prawidłowy link spotkania Teams HTTPS.'; END IF;
    ELSIF v_mode='managed_teams' THEN
        IF r.capacity>499 THEN RAISE EXCEPTION 'Zmniejsz limit edycji do 499 uczestników, aby zostawić miejsce na zaproszenie prowadzącego Teams.'; END IF;
        v_organizer:=(p_input->>'organizerId')::uuid;
        IF NOT EXISTS(SELECT 1 FROM public.academy_organizers o JOIN public.profiles p ON p.id=o.profile_id
            WHERE o.id=v_organizer AND o.enabled AND NOT COALESCE(p.is_external,false)
            AND COALESCE(p.employment_status::text,'active')<>'exited') THEN RAISE EXCEPTION 'Brak aktywnego organizatora Teams. Użyj linku zewnętrznego.'; END IF;
    ELSE RAISE EXCEPTION 'Nieprawidłowy tryb spotkania.';
    END IF;
    IF NULLIF(p_input->>'id','') IS NOT NULL AND NULLIF(p_input->>'replacesSessionId','') IS NOT NULL THEN
        RAISE EXCEPTION 'Zastępstwo tworzy nową sesję z zachowaniem historii.';
    END IF;
    IF NULLIF(p_input->>'id','') IS NOT NULL THEN
        SELECT * INTO s FROM public.course_sessions WHERE id=(p_input->>'id')::uuid AND run_id=r.id FOR UPDATE;
        IF NOT FOUND OR s.status='cancelled' THEN RAISE EXCEPTION 'Spotkanie nie istnieje lub jest odwołane.'; END IF;
        IF s.window_confirmed_at IS NOT NULL OR s.starts_at<=now() THEN RAISE EXCEPTION 'Rozpoczęte spotkanie wymaga potwierdzenia obecności zamiast edycji terminu.'; END IF;
        IF r.status='published' AND (s.meeting_mode<>v_mode OR s.organizer_id IS DISTINCT FROM v_organizer) THEN
            RAISE EXCEPTION 'Zmiana organizatora lub trybu wymaga odwołania i utworzenia nowego spotkania.';
        END IF;
        UPDATE public.course_sessions SET title=btrim(p_input->>'title'),starts_at=(p_input->>'startsAt')::timestamptz,
            ends_at=(p_input->>'endsAt')::timestamptz,time_zone=p_input->>'timeZone',meeting_mode=v_mode,
            organizer_id=v_organizer,external_join_url=CASE WHEN v_mode='external_link' THEN p_input->>'externalJoinUrl' END,
            required=(p_input->>'required')::boolean,revision=revision+1,updated_at=now(),
            sync_status=CASE WHEN r.status='draft' THEN 'draft' WHEN v_mode='external_link' THEN 'ready' ELSE 'pending' END
            WHERE id=s.id RETURNING id INTO v_id;
    ELSE
        INSERT INTO public.course_sessions(run_id,title,starts_at,ends_at,time_zone,meeting_mode,organizer_id,external_join_url,required,created_by,sync_status,replaces_session_id,replacement_reason,external_cancellation_confirmed)
        VALUES(r.id,btrim(p_input->>'title'),(p_input->>'startsAt')::timestamptz,(p_input->>'endsAt')::timestamptz,p_input->>'timeZone',
            v_mode,v_organizer,CASE WHEN v_mode='external_link' THEN p_input->>'externalJoinUrl' END,(p_input->>'required')::boolean,auth.uid(),
            CASE WHEN r.status='draft' THEN 'draft' WHEN v_mode='external_link' THEN 'ready' ELSE 'pending' END,
            NULLIF(p_input->>'replacesSessionId','')::uuid,NULLIF(btrim(p_input->>'replacementReason'),''),
            COALESCE((p_input->>'externalCancellationConfirmed')::boolean,false)) RETURNING id INTO v_id;
    END IF;
    IF r.status='published' AND v_mode='managed_teams' THEN PERFORM academy_private.enqueue_session(v_id,'sync_meeting'); END IF;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_SESSION_SAVED',r.course_id,jsonb_build_object('session_id',v_id,'run_id',r.id));
    RETURN v_id;
END $$;

CREATE FUNCTION public.academy_replace_session(p_session_id uuid,p_input jsonb,p_reason text,p_external_cancelled boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE previous public.course_sessions;
BEGIN
 SELECT * INTO previous FROM public.course_sessions WHERE id=p_session_id;
 IF NOT FOUND OR NOT public.academy_can_manage_run(previous.run_id) THEN RAISE EXCEPTION 'Brak uprawnień do zastępstwa.' USING ERRCODE='42501'; END IF;
 IF COALESCE(length(btrim(p_reason)),0) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Podaj uzasadnienie zastępstwa.'; END IF;
 IF p_input->>'runId' IS DISTINCT FROM previous.run_id::text OR NULLIF(p_input->>'id','') IS NOT NULL THEN
  RAISE EXCEPTION 'Zastępstwo musi należeć do tej samej edycji.';
 END IF;
 -- save_session locks run before session; guard checks cancellation under the same lock.
 RETURN public.academy_save_session(p_input||jsonb_build_object('replacesSessionId',previous.id,
  'required',previous.required,'replacementReason',btrim(p_reason),'externalCancellationConfirmed',COALESCE(p_external_cancelled,false)));
END $$;
REVOKE ALL ON FUNCTION public.academy_replace_session(uuid,jsonb,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_replace_session(uuid,jsonb,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_attendance_satisfied(p_enrollment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.course_enrollments e JOIN public.course_runs r ON r.id=e.run_id
 JOIN public.course_run_registrations reg ON reg.enrollment_id=e.id AND reg.run_id=e.run_id AND reg.user_id=e.user_id
 WHERE e.id=p_enrollment_id AND r.version_id=e.version_id AND reg.status='confirmed' AND r.status='published'
 AND EXISTS(SELECT 1 FROM academy_private.run_obligations o WHERE o.run_id=r.id)
 AND NOT EXISTS(SELECT 1 FROM academy_private.run_obligations o
  JOIN public.course_sessions s ON s.id=o.active_session_id AND s.run_id=o.run_id
  LEFT JOIN public.session_attendance a ON a.session_id=s.id AND a.enrollment_id=e.id
  WHERE o.run_id=r.id AND (s.status<>'scheduled' OR s.window_confirmed_at IS NULL OR s.actual_ends_at>now()
   OR COALESCE(a.status,'needs_review')<>'present')));
$$;
CREATE OR REPLACE FUNCTION public.academy_list_runs(p_course_id uuid DEFAULT NULL,p_run_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT COALESCE(jsonb_agg(item ORDER BY created_at DESC),'[]') FROM (
        SELECT r.created_at,jsonb_build_object('id',r.id,'courseId',r.course_id,'versionId',r.version_id,
            'versionNumber',v.version_number,'courseTitle',v.metadata->>'title','courseSlug',c.slug,
            'title',r.title,'capacity',r.capacity,'status',r.status,
            'confirmedCount',(SELECT count(*) FROM public.course_run_registrations WHERE run_id=r.id AND status='confirmed'),
            'waitlistCount',(SELECT count(*) FROM public.course_run_registrations WHERE run_id=r.id AND status='waitlisted'),
            'canManage',public.academy_can_manage_run(r.id),'canPublish',public.academy_can_review_run(r.id),
            'myRegistration',(SELECT jsonb_build_object('id',reg.id,'status',reg.status,'enrollmentId',reg.enrollment_id,
                    'completedAt',(SELECT completed_at FROM public.course_enrollments WHERE id=reg.enrollment_id),
                    'completionRevokedAt',(SELECT revoked_at FROM public.course_completions WHERE enrollment_id=reg.enrollment_id),
                    'completionRevokedReason',(SELECT revoked_reason FROM public.course_completions WHERE enrollment_id=reg.enrollment_id))
                FROM public.course_run_registrations reg WHERE reg.run_id=r.id AND reg.user_id=auth.uid()),
            'sessions',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id',s.id,'runId',s.run_id,'title',s.title,'startsAt',s.starts_at,'endsAt',s.ends_at,
                'timeZone',s.time_zone,'mode',s.meeting_mode,'required',s.required,'status',s.status,
                'syncStatus',s.sync_status,'organizerId',s.organizer_id,
                'replacesSessionId',s.replaces_session_id,
                'replacementSessionId',(SELECT child.id FROM public.course_sessions child WHERE child.replaces_session_id=s.id),
                'canReplace',public.academy_can_manage_run(r.id) AND academy_private.session_can_replace(s.id),
                'actualStartsAt',s.actual_starts_at,'actualEndsAt',s.actual_ends_at,'attendanceWindowConfirmed',s.window_confirmed_at IS NOT NULL,
                'externalJoinUrl',CASE WHEN public.academy_can_manage_run(r.id) THEN s.external_join_url END,
                'joinUrl',CASE WHEN s.status='scheduled' AND r.status='published' AND s.sync_status='ready'
                    AND (public.academy_can_manage_run(r.id) OR public.academy_is_run_registered(r.id))
                    THEN CASE WHEN s.meeting_mode='external_link' THEN s.external_join_url ELSE i.join_url END END
                ) ORDER BY s.starts_at,s.id),'[]') FROM public.course_sessions s
                LEFT JOIN public.academy_session_integrations i ON i.session_id=s.id AND i.cancelled_at IS NULL WHERE s.run_id=r.id)
        ) item
        FROM public.course_runs r JOIN public.course_versions v ON v.id=r.version_id JOIN public.courses c ON c.id=r.course_id
        WHERE public.academy_can_access() AND (p_course_id IS NULL OR r.course_id=p_course_id) AND (p_run_id IS NULL OR r.id=p_run_id)
            AND (public.academy_can_manage_run(r.id) OR (r.status='published' AND c.status='published' AND NOT c.legacy_review_required)
                OR EXISTS(SELECT 1 FROM public.course_run_registrations reg WHERE reg.run_id=r.id AND reg.user_id=auth.uid()))
        ORDER BY r.created_at DESC LIMIT 200
    ) rows;
$$;

REVOKE ALL ON FUNCTION academy_private.freeze_run_obligations(),academy_private.session_can_replace(uuid),
 academy_private.guard_session_obligations(),academy_private.transfer_session_obligation() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
