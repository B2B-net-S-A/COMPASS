-- Live Academy: capacity-safe registration, scoped sessions, evidence and durable Graph jobs.
BEGIN;

CREATE TABLE public.academy_organizers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.profiles(id),
    tenant_id uuid NOT NULL,
    object_id uuid NOT NULL,
    enabled boolean NOT NULL DEFAULT false,
    configured_by uuid NOT NULL REFERENCES public.profiles(id),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id,object_id)
);
CREATE TABLE public.academy_m365_identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    tenant_id uuid NOT NULL,
    object_id uuid NOT NULL,
    verified_email text,
    verified_by uuid NOT NULL REFERENCES public.profiles(id),
    verified_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id,object_id),
    CHECK(verified_email IS NULL OR (length(verified_email)<=254 AND verified_email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'))
);
CREATE INDEX academy_m365_identity_user ON public.academy_m365_identities(user_id);

CREATE TABLE public.course_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id uuid NOT NULL REFERENCES public.courses(id),
    version_id uuid NOT NULL,
    title text NOT NULL CHECK(length(btrim(title)) BETWEEN 2 AND 200),
    capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 500),
    status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','cancelled')),
    created_by uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    published_by uuid REFERENCES public.profiles(id),
    published_at timestamptz,
    cancellation_reason text,
    FOREIGN KEY(version_id,course_id) REFERENCES public.course_versions(id,course_id),
    UNIQUE(id,course_id,version_id)
);
CREATE INDEX academy_runs_course ON public.course_runs(course_id,created_at DESC);
ALTER TABLE public.course_enrollments ADD CONSTRAINT academy_enrollment_run_fk
    FOREIGN KEY(run_id,course_id,version_id) REFERENCES public.course_runs(id,course_id,version_id);

CREATE TABLE public.course_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid NOT NULL REFERENCES public.course_runs(id),
    title text NOT NULL CHECK(length(btrim(title)) BETWEEN 2 AND 200),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    time_zone text NOT NULL DEFAULT 'Europe/Warsaw',
    meeting_mode text NOT NULL CHECK(meeting_mode IN ('managed_teams','external_link')),
    organizer_id uuid REFERENCES public.academy_organizers(id),
    external_join_url text,
    required boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','cancelled')),
    revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
    sync_status text NOT NULL DEFAULT 'draft' CHECK(sync_status IN ('draft','pending','ready','error','cancelled')),
    actual_starts_at timestamptz,
    actual_ends_at timestamptz,
    window_confirmed_by uuid REFERENCES public.profiles(id),
    window_confirmed_at timestamptz,
    cancellation_reason text,
    created_by uuid NOT NULL REFERENCES public.profiles(id),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK(ends_at>starts_at AND ends_at<=starts_at+interval '24 hours'),
    CHECK((actual_starts_at IS NULL AND actual_ends_at IS NULL AND window_confirmed_at IS NULL)
        OR (actual_starts_at IS NOT NULL AND actual_ends_at IS NOT NULL AND actual_ends_at>actual_starts_at AND window_confirmed_at IS NOT NULL)),
    CHECK((meeting_mode='managed_teams' AND organizer_id IS NOT NULL AND external_join_url IS NULL)
        OR (meeting_mode='external_link' AND external_join_url IS NOT NULL AND organizer_id IS NULL))
);
CREATE INDEX academy_sessions_run ON public.course_sessions(run_id,starts_at);
CREATE INDEX academy_sessions_upcoming ON public.course_sessions(starts_at) WHERE status='scheduled';
CREATE TABLE public.course_run_registrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid NOT NULL REFERENCES public.course_runs(id),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    enrollment_id uuid UNIQUE REFERENCES public.course_enrollments(id),
    status text NOT NULL CHECK(status IN ('confirmed','waitlisted','cancelled')),
    calendar_revision integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(run_id,user_id),
    CHECK(status<>'confirmed' OR enrollment_id IS NOT NULL)
);
CREATE INDEX academy_registration_user ON public.course_run_registrations(user_id,run_id);
CREATE INDEX academy_registration_queue ON public.course_run_registrations(run_id,status,created_at,id);
CREATE TABLE public.session_attendance (
    session_id uuid NOT NULL REFERENCES public.course_sessions(id),
    enrollment_id uuid NOT NULL REFERENCES public.course_enrollments(id),
    status text NOT NULL CHECK(status IN ('present','insufficient','needs_review')),
    attended_seconds integer NOT NULL DEFAULT 0 CHECK(attended_seconds BETWEEN 0 AND 86400),
    source text NOT NULL CHECK(source IN ('manual','teams')),
    reviewed_by uuid REFERENCES public.profiles(id),
    note text CHECK(length(note)<=2000),
    report_ids jsonb NOT NULL DEFAULT '[]',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(session_id,enrollment_id),
    CHECK(source<>'manual' OR (reviewed_by IS NOT NULL AND note IS NOT NULL AND length(btrim(note))>=5))
);
CREATE INDEX academy_attendance_enrollment ON public.session_attendance(enrollment_id,session_id);
CREATE TABLE public.academy_session_integrations (
    session_id uuid PRIMARY KEY REFERENCES public.course_sessions(id),
    event_id text NOT NULL,
    join_url text NOT NULL,
    transaction_id text NOT NULL,
    organizer_object_id uuid NOT NULL,
    online_meeting_id text,
    cancelled_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.academy_integration_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.course_sessions(id),
    revision integer NOT NULL,
    kind text NOT NULL CHECK(kind IN ('sync_meeting','cancel_meeting','sync_attendance')),
    status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','retry','done','failed','skipped')),
    attempts integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT now(),
    claimed_by text,
    lease_token uuid,
    lease_expires_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(session_id,kind,revision),
    CHECK(status<>'processing' OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))
);
CREATE INDEX academy_jobs_claim ON public.academy_integration_jobs(status,available_at,created_at) WHERE status IN ('pending','retry');
CREATE INDEX academy_jobs_session_lease ON public.academy_integration_jobs(session_id,lease_expires_at) WHERE status='processing';
CREATE TABLE public.academy_attendance_reports (
    session_id uuid NOT NULL REFERENCES public.course_sessions(id),
    report_id text NOT NULL,
    evidence jsonb NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(session_id,report_id)
);

CREATE FUNCTION public.academy_can_manage_run(p_run_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.course_runs r
        WHERE r.id=p_run_id AND public.academy_can_manage_course(r.course_id));
$$;
CREATE FUNCTION public.academy_is_run_registered(p_run_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT public.academy_can_access() AND EXISTS(SELECT 1 FROM public.course_run_registrations reg
        JOIN public.course_runs r ON r.id=reg.run_id
        WHERE reg.run_id=p_run_id AND reg.user_id=auth.uid() AND reg.status='confirmed' AND r.status='published');
$$;

DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['academy_organizers','academy_m365_identities','course_runs','course_sessions',
        'course_run_registrations','session_attendance','academy_session_integrations','academy_integration_jobs','academy_attendance_reports'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',t);
    END LOOP;
END $$;
GRANT SELECT ON public.course_runs,public.course_sessions,public.course_run_registrations,public.session_attendance,
    public.academy_organizers,public.academy_m365_identities,public.academy_integration_jobs TO authenticated;
CREATE POLICY academy_runs_read ON public.course_runs FOR SELECT TO authenticated USING(
    public.academy_can_access() AND (public.academy_can_manage_course(course_id) OR public.academy_is_run_registered(id)
        OR (status='published' AND EXISTS(SELECT 1 FROM public.courses c WHERE c.id=course_id AND c.status='published'))));
CREATE POLICY academy_sessions_read ON public.course_sessions FOR SELECT TO authenticated USING(
    public.academy_can_manage_run(run_id) OR public.academy_is_run_registered(run_id));
CREATE POLICY academy_registrations_read ON public.course_run_registrations FOR SELECT TO authenticated USING(
    public.academy_can_access() AND (user_id=(SELECT auth.uid()) OR public.academy_can_manage_run(run_id)));
CREATE POLICY academy_attendance_read ON public.session_attendance FOR SELECT TO authenticated USING(
    EXISTS(SELECT 1 FROM public.course_enrollments e WHERE e.id=enrollment_id
        AND (e.user_id=(SELECT auth.uid()) OR public.academy_can_manage_course(e.course_id))) AND public.academy_can_access());
CREATE POLICY academy_organizers_read ON public.academy_organizers FOR SELECT TO authenticated USING(public.academy_is_trainer());
CREATE POLICY academy_m365_admin_read ON public.academy_m365_identities FOR SELECT TO authenticated USING(public.academy_can_access() AND public.is_admin());
CREATE POLICY academy_jobs_read ON public.academy_integration_jobs FOR SELECT TO authenticated USING(
    EXISTS(SELECT 1 FROM public.course_sessions s WHERE s.id=session_id AND public.academy_can_manage_run(s.run_id)));

CREATE FUNCTION academy_private.valid_teams_url(p_url text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
    SELECT length(p_url)<=8192 AND p_url !~ '[[:space:]\\#]'
        AND p_url ~ '^https://(teams\.microsoft\.com/(l/meetup-join/[^/?#]+(/[^?#]*)?|meet/[0-9]+/?)|teams\.live\.com/meet/[0-9]+/?)(\?[^#]*)?$';
$$;
CREATE FUNCTION academy_private.enqueue_session(p_session_id uuid,p_kind text,p_available_at timestamptz DEFAULT now())
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    -- Collapse bursts of registrations/edits; obsolete queued work must not delay the newest roster.
    UPDATE public.academy_integration_jobs SET status='skipped',last_error='superseded_revision',updated_at=now()
        WHERE session_id=p_session_id AND revision<(SELECT revision FROM public.course_sessions WHERE id=p_session_id)
            AND status IN ('pending','retry','failed');
    INSERT INTO public.academy_integration_jobs(session_id,revision,kind,available_at)
        SELECT id,revision,p_kind,p_available_at FROM public.course_sessions WHERE id=p_session_id
    ON CONFLICT(session_id,kind,revision) DO UPDATE SET status='pending',available_at=EXCLUDED.available_at,
        last_error=NULL,updated_at=now() WHERE academy_integration_jobs.status IN ('failed','skipped');
END $$;
CREATE FUNCTION academy_private.refresh_run_meetings(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s record;
BEGIN
    FOR s IN SELECT cs.id FROM public.course_sessions cs JOIN public.course_runs r ON r.id=cs.run_id
        WHERE cs.run_id=p_run_id AND r.status='published' AND cs.status='scheduled' AND cs.ends_at>now()
        AND cs.meeting_mode='managed_teams' FOR UPDATE OF cs LOOP
        UPDATE public.course_sessions SET revision=revision+1,sync_status='pending',updated_at=now() WHERE id=s.id;
        PERFORM academy_private.enqueue_session(s.id,'sync_meeting');
    END LOOP;
END $$;

CREATE FUNCTION public.academy_create_run(p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.course_versions; v_id uuid;
BEGIN
    IF NOT public.academy_can_manage_course((p_input->>'courseId')::uuid) THEN RAISE EXCEPTION 'Brak uprawnień do edycji szkolenia.' USING ERRCODE='42501'; END IF;
    SELECT * INTO v FROM public.course_versions WHERE id=(p_input->>'versionId')::uuid
        AND course_id=(p_input->>'courseId')::uuid AND status='published' FOR SHARE;
    IF NOT FOUND OR v.metadata->>'delivery_mode' NOT IN ('live','blended') OR NOT EXISTS(
        SELECT 1 FROM public.courses c WHERE c.id=v.course_id AND c.status='published') THEN
        RAISE EXCEPTION 'Edycja wymaga zatwierdzonego szkolenia live lub mieszanego.';
    END IF;
    INSERT INTO public.course_runs(course_id,version_id,title,capacity,created_by)
        VALUES(v.course_id,v.id,btrim(p_input->>'title'),(p_input->>'capacity')::integer,auth.uid()) RETURNING id INTO v_id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_RUN_CREATED',v.course_id,jsonb_build_object('run_id',v_id,'version_id',v.id));
    RETURN v_id;
END $$;

CREATE FUNCTION public.academy_update_run(p_run_id uuid,p_title text,p_capacity integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs;
BEGIN
    IF NOT public.academy_can_manage_run(p_run_id) THEN RAISE EXCEPTION 'Brak uprawnień do edycji.' USING ERRCODE='42501'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=p_run_id FOR UPDATE;
    IF r.status='cancelled' THEN RAISE EXCEPTION 'Edycja jest odwołana.'; END IF;
    IF p_capacity<(SELECT count(*) FROM public.course_run_registrations WHERE run_id=p_run_id AND status='confirmed') THEN
        RAISE EXCEPTION 'Limit nie może być niższy od liczby potwierdzonych zapisów.';
    END IF;
    IF p_capacity>499 AND EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=r.id AND meeting_mode='managed_teams' AND status='scheduled') THEN
        RAISE EXCEPTION 'Zarządzane spotkanie Teams obsługuje do 499 uczestników i zaproszenie prowadzącego.';
    END IF;
    UPDATE public.course_runs SET title=btrim(p_title),capacity=p_capacity,updated_at=now() WHERE id=p_run_id;
    -- Capacity increases are followed by the same FIFO promotion used on cancellation.
    PERFORM academy_private.promote_run_waitlist(p_run_id);
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_RUN_UPDATED',r.course_id,jsonb_build_object('run_id',r.id,'capacity',p_capacity));
END $$;

CREATE FUNCTION public.academy_save_session(p_input jsonb)
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
        INSERT INTO public.course_sessions(run_id,title,starts_at,ends_at,time_zone,meeting_mode,organizer_id,external_join_url,required,created_by,sync_status)
        VALUES(r.id,btrim(p_input->>'title'),(p_input->>'startsAt')::timestamptz,(p_input->>'endsAt')::timestamptz,p_input->>'timeZone',
            v_mode,v_organizer,CASE WHEN v_mode='external_link' THEN p_input->>'externalJoinUrl' END,(p_input->>'required')::boolean,auth.uid(),
            CASE WHEN r.status='draft' THEN 'draft' WHEN v_mode='external_link' THEN 'ready' ELSE 'pending' END) RETURNING id INTO v_id;
    END IF;
    IF r.status='published' AND v_mode='managed_teams' THEN PERFORM academy_private.enqueue_session(v_id,'sync_meeting'); END IF;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_SESSION_SAVED',r.course_id,jsonb_build_object('session_id',v_id,'run_id',r.id));
    RETURN v_id;
END $$;

CREATE FUNCTION public.academy_publish_run(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs; s record;
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'Publikacja terminu wymaga administratora.' USING ERRCODE='42501'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=p_run_id FOR UPDATE;
    IF NOT FOUND OR r.status='cancelled' THEN RAISE EXCEPTION 'Nie można opublikować tej edycji.'; END IF;
    IF r.status='published' THEN RETURN; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.course_versions v JOIN public.courses c ON c.id=v.course_id
        WHERE v.id=r.version_id AND v.status='published' AND c.status='published') THEN RAISE EXCEPTION 'Program nie jest zatwierdzony.'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=r.id AND status='scheduled' AND required AND starts_at>now())
        OR EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=r.id AND status='scheduled' AND starts_at<=now()) THEN
        RAISE EXCEPTION 'Dodaj co najmniej jedno wymagane spotkanie w przyszłości.';
    END IF;
    IF EXISTS(SELECT 1 FROM public.course_sessions cs LEFT JOIN public.academy_organizers o ON o.id=cs.organizer_id
        LEFT JOIN public.profiles op ON op.id=o.profile_id
        WHERE cs.run_id=r.id AND cs.status='scheduled' AND ((cs.meeting_mode='managed_teams' AND (NOT COALESCE(o.enabled,false)
                OR COALESCE(op.is_external,true) OR COALESCE(op.employment_status::text,'active')='exited'))
            OR (cs.meeting_mode='external_link' AND NOT COALESCE(academy_private.valid_teams_url(cs.external_join_url),false)))) THEN
        RAISE EXCEPTION 'Sprawdź organizatorów i linki spotkań.';
    END IF;
    UPDATE public.course_runs SET status='published',published_at=now(),published_by=auth.uid(),updated_at=now() WHERE id=r.id;
    FOR s IN SELECT * FROM public.course_sessions WHERE run_id=r.id AND status='scheduled' FOR UPDATE LOOP
        UPDATE public.course_sessions SET sync_status=CASE WHEN meeting_mode='managed_teams' THEN 'pending' ELSE 'ready' END,updated_at=now() WHERE id=s.id;
        IF s.meeting_mode='managed_teams' THEN PERFORM academy_private.enqueue_session(s.id,'sync_meeting'); END IF;
    END LOOP;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_RUN_PUBLISHED',r.course_id,jsonb_build_object('run_id',r.id,'version_id',r.version_id));
END $$;

CREATE FUNCTION academy_private.cancel_session(p_session_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.course_sessions;
BEGIN
    SELECT * INTO s FROM public.course_sessions WHERE id=p_session_id FOR UPDATE;
    IF s.status='cancelled' THEN RETURN; END IF;
    UPDATE public.course_sessions SET status='cancelled',cancellation_reason=p_reason,revision=revision+1,
        sync_status=CASE WHEN meeting_mode='managed_teams' THEN 'pending' ELSE 'cancelled' END,updated_at=now() WHERE id=s.id;
    IF s.meeting_mode='managed_teams' THEN PERFORM academy_private.enqueue_session(s.id,'cancel_meeting'); END IF;
END $$;
CREATE FUNCTION public.academy_cancel_session(p_session_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.course_sessions; r public.course_runs;
BEGIN
    SELECT * INTO s FROM public.course_sessions WHERE id=p_session_id;
    IF NOT FOUND OR NOT public.academy_can_manage_run(s.run_id) THEN RAISE EXCEPTION 'Brak uprawnień do spotkania.' USING ERRCODE='42501'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=s.run_id FOR UPDATE;
    IF COALESCE(length(btrim(p_reason)),0) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Podaj powód odwołania.'; END IF;
    IF EXISTS(SELECT 1 FROM public.course_enrollments WHERE run_id=r.id AND completed_at IS NOT NULL) THEN RAISE EXCEPTION 'Edycja ma wystawione certyfikaty.'; END IF;
    PERFORM academy_private.cancel_session(s.id,p_reason);
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_SESSION_CANCELLED',r.course_id,jsonb_build_object('session_id',s.id,'reason',p_reason));
END $$;
CREATE FUNCTION public.academy_cancel_run(p_run_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs; s record;
BEGIN
    IF NOT public.academy_can_manage_run(p_run_id) THEN RAISE EXCEPTION 'Brak uprawnień do edycji.' USING ERRCODE='42501'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=p_run_id FOR UPDATE;
    IF r.status='cancelled' THEN RETURN; END IF;
    IF COALESCE(length(btrim(p_reason)),0) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Podaj powód odwołania.'; END IF;
    IF EXISTS(SELECT 1 FROM public.course_enrollments WHERE run_id=r.id AND completed_at IS NOT NULL) THEN RAISE EXCEPTION 'Nie można odwołać ukończonej edycji.'; END IF;
    UPDATE public.course_runs SET status='cancelled',cancellation_reason=p_reason,updated_at=now() WHERE id=r.id;
    FOR s IN SELECT id FROM public.course_sessions WHERE run_id=r.id LOOP PERFORM academy_private.cancel_session(s.id,p_reason); END LOOP;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_RUN_CANCELLED',r.course_id,jsonb_build_object('run_id',r.id,'reason',p_reason));
END $$;

CREATE FUNCTION academy_private.user_may_register(p_user_id uuid,p_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=p_user_id
        AND p.role::text IN ('consultant','admin') AND NOT COALESCE(p.is_external,false)
        AND COALESCE(p.employment_status::text,'active')<>'exited')
    AND NOT EXISTS(SELECT 1 FROM public.course_versions v,
        jsonb_array_elements_text(COALESCE(v.metadata->'prerequisite_course_ids','[]')) prerequisite(value)
        WHERE v.id=p_version_id AND NOT EXISTS(SELECT 1 FROM public.course_completions c
            WHERE c.user_id=p_user_id AND c.course_id=prerequisite.value::uuid));
$$;

CREATE FUNCTION academy_private.confirm_registration(p_registration_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE reg public.course_run_registrations; r public.course_runs; v_enrollment uuid;
BEGIN
    SELECT * INTO reg FROM public.course_run_registrations WHERE id=p_registration_id FOR UPDATE;
    SELECT * INTO r FROM public.course_runs WHERE id=reg.run_id;
    INSERT INTO public.course_enrollments(user_id,course_id,version_id,run_id)
        VALUES(reg.user_id,r.course_id,r.version_id,r.id)
        ON CONFLICT(user_id,run_id) WHERE run_id IS NOT NULL DO UPDATE SET run_id=EXCLUDED.run_id
        RETURNING id INTO v_enrollment;
    UPDATE public.course_run_registrations SET status='confirmed',enrollment_id=v_enrollment,updated_at=now() WHERE id=reg.id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_REGISTRATION_CONFIRMED',r.course_id,jsonb_build_object('registration_id',reg.id,'user_id',reg.user_id,'run_id',r.id));
    RETURN v_enrollment;
END $$;

CREATE FUNCTION academy_private.promote_run_waitlist(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs; reg record; v_slots integer; v_changed boolean:=false;
BEGIN
    SELECT * INTO r FROM public.course_runs WHERE id=p_run_id FOR UPDATE;
    IF r.status<>'published' OR EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=r.id AND status='scheduled' AND starts_at<=now()) THEN RETURN; END IF;
    v_slots:=r.capacity-(SELECT count(*) FROM public.course_run_registrations WHERE run_id=r.id AND status='confirmed');
    FOR reg IN SELECT * FROM public.course_run_registrations WHERE run_id=r.id AND status='waitlisted' ORDER BY created_at,id FOR UPDATE LOOP
        EXIT WHEN v_slots<=0;
        IF NOT academy_private.user_may_register(reg.user_id,r.version_id) THEN
            UPDATE public.course_run_registrations SET status='cancelled',updated_at=now() WHERE id=reg.id;
            CONTINUE;
        END IF;
        PERFORM academy_private.confirm_registration(reg.id);
        v_slots:=v_slots-1; v_changed:=true;
    END LOOP;
    IF v_changed THEN PERFORM academy_private.refresh_run_meetings(r.id); END IF;
END $$;

CREATE FUNCTION public.academy_register_run(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs; reg public.course_run_registrations; v_id uuid;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'Brak dostępu do Akademii.' USING ERRCODE='42501'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=p_run_id FOR UPDATE;
    IF NOT FOUND OR r.status<>'published' OR NOT EXISTS(SELECT 1 FROM public.courses WHERE id=r.course_id AND status='published') THEN
        RAISE EXCEPTION 'Edycja nie jest dostępna do zapisów.';
    END IF;
    IF NOT academy_private.user_may_register(auth.uid(),r.version_id) THEN RAISE EXCEPTION 'Najpierw ukończ wymagane szkolenia wstępne.'; END IF;
    SELECT * INTO reg FROM public.course_run_registrations WHERE run_id=r.id AND user_id=auth.uid();
    IF FOUND AND reg.status IN ('confirmed','waitlisted') THEN
        RETURN jsonb_build_object('registrationId',reg.id,'status',reg.status,'enrollmentId',reg.enrollment_id);
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=r.id AND status='scheduled')
        OR EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=r.id AND status='scheduled' AND starts_at<=now()) THEN
        RAISE EXCEPTION 'Zapisy na rozpoczętą edycję są zamknięte.';
    END IF;
    IF (SELECT count(*) FROM public.course_run_registrations WHERE run_id=r.id AND status='waitlisted')>=1000 THEN
        RAISE EXCEPTION 'Lista rezerwowa jest pełna.';
    END IF;
    INSERT INTO public.course_run_registrations(run_id,user_id,status) VALUES(r.id,auth.uid(),'waitlisted')
        ON CONFLICT(run_id,user_id) DO UPDATE SET status='waitlisted',created_at=now(),updated_at=now() RETURNING id INTO v_id;
    PERFORM academy_private.promote_run_waitlist(r.id);
    SELECT * INTO reg FROM public.course_run_registrations WHERE id=v_id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_RUN_REGISTERED',r.course_id,jsonb_build_object('run_id',r.id,'status',reg.status));
    RETURN jsonb_build_object('registrationId',reg.id,'status',reg.status,'enrollmentId',reg.enrollment_id);
END $$;

CREATE FUNCTION public.academy_cancel_registration(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs; reg public.course_run_registrations;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'Brak dostępu do Akademii.' USING ERRCODE='42501'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=p_run_id FOR UPDATE;
    SELECT * INTO reg FROM public.course_run_registrations WHERE run_id=p_run_id AND user_id=auth.uid() FOR UPDATE;
    IF NOT FOUND OR reg.status='cancelled' THEN RETURN; END IF;
    IF EXISTS(SELECT 1 FROM public.course_completions WHERE enrollment_id=reg.enrollment_id) THEN RAISE EXCEPTION 'Ukończony udział pozostaje w historii.'; END IF;
    UPDATE public.course_run_registrations SET status='cancelled',updated_at=now() WHERE id=reg.id;
    PERFORM academy_private.promote_run_waitlist(r.id);
    PERFORM academy_private.refresh_run_meetings(r.id);
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_REGISTRATION_CANCELLED',r.course_id,jsonb_build_object('run_id',r.id,'registration_id',reg.id));
END $$;

CREATE FUNCTION public.academy_confirm_session_window(p_session_id uuid,p_starts_at timestamptz,p_ends_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.course_sessions; r public.course_runs;
BEGIN
    SELECT * INTO s FROM public.course_sessions WHERE id=p_session_id;
    IF NOT FOUND OR NOT public.academy_can_manage_run(s.run_id) THEN RAISE EXCEPTION 'Brak uprawnień do obecności.' USING ERRCODE='42501'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=s.run_id FOR UPDATE;
    SELECT * INTO s FROM public.course_sessions WHERE id=p_session_id FOR UPDATE;
    IF p_starts_at IS NULL OR p_ends_at IS NULL OR r.status<>'published' OR s.status<>'scheduled' OR p_ends_at>now() OR p_ends_at<=p_starts_at
        OR p_ends_at>p_starts_at+interval '24 hours' OR p_starts_at<s.starts_at-interval '12 hours' OR p_ends_at>s.ends_at+interval '12 hours' THEN
        RAISE EXCEPTION 'Podaj rzeczywisty czas zakończonego spotkania.';
    END IF;
    IF EXISTS(SELECT 1 FROM public.course_enrollments WHERE run_id=r.id AND completed_at IS NOT NULL)
        OR EXISTS(SELECT 1 FROM public.session_attendance WHERE session_id=s.id AND source='manual') THEN
        RAISE EXCEPTION 'Czas spotkania został już użyty do potwierdzenia obecności.';
    END IF;
    UPDATE public.course_sessions SET actual_starts_at=p_starts_at,actual_ends_at=p_ends_at,
        window_confirmed_by=auth.uid(),window_confirmed_at=now(),revision=revision+1,updated_at=now() WHERE id=s.id;
    -- Discard only machine decisions when the teaching window changes; raw reports remain evidence.
    DELETE FROM public.session_attendance WHERE session_id=s.id AND source='teams';
    IF s.meeting_mode='managed_teams' THEN PERFORM academy_private.enqueue_session(s.id,'sync_attendance',now()+interval '5 minutes'); END IF;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_SESSION_WINDOW_CONFIRMED',r.course_id,jsonb_build_object('session_id',s.id,'starts_at',p_starts_at,'ends_at',p_ends_at));
END $$;

CREATE OR REPLACE FUNCTION public.academy_attendance_satisfied(p_enrollment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT EXISTS(SELECT 1 FROM public.course_enrollments e JOIN public.course_runs r ON r.id=e.run_id
        JOIN public.course_run_registrations reg ON reg.enrollment_id=e.id AND reg.run_id=e.run_id AND reg.user_id=e.user_id
        WHERE e.id=p_enrollment_id AND r.version_id=e.version_id AND reg.status='confirmed' AND r.status='published'
        AND EXISTS(SELECT 1 FROM public.course_sessions s WHERE s.run_id=r.id AND s.required AND s.status='scheduled')
        AND NOT EXISTS(SELECT 1 FROM public.course_sessions s LEFT JOIN public.session_attendance a ON a.session_id=s.id AND a.enrollment_id=e.id
            WHERE s.run_id=r.id AND s.required AND s.status='scheduled'
            AND (s.window_confirmed_at IS NULL OR s.actual_ends_at>now() OR COALESCE(a.status,'needs_review')<>'present')));
$$;

CREATE FUNCTION public.academy_record_attendance(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.course_sessions; r public.course_runs; e public.course_enrollments; v_seconds integer; v_duration integer; v_threshold integer;
BEGIN
    SELECT * INTO s FROM public.course_sessions WHERE id=(p_input->>'sessionId')::uuid;
    IF NOT FOUND OR NOT public.academy_can_manage_run(s.run_id) THEN RAISE EXCEPTION 'Brak uprawnień do obecności.' USING ERRCODE='42501'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=s.run_id FOR UPDATE;
    SELECT * INTO s FROM public.course_sessions WHERE id=s.id FOR UPDATE;
    SELECT * INTO e FROM public.course_enrollments WHERE id=(p_input->>'enrollmentId')::uuid AND run_id=r.id FOR UPDATE;
    IF NOT FOUND OR e.user_id=auth.uid() OR NOT EXISTS(SELECT 1 FROM public.course_run_registrations WHERE enrollment_id=e.id AND status='confirmed') THEN
        RAISE EXCEPTION 'Nie możesz potwierdzić własnej obecności ani osoby bez zapisu.' USING ERRCODE='42501';
    END IF;
    IF e.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Zaliczenie ma certyfikat; korekta wymaga osobnej procedury administratora.'; END IF;
    IF r.status<>'published' OR s.status<>'scheduled' OR s.window_confirmed_at IS NULL OR s.actual_ends_at>now() THEN
        RAISE EXCEPTION 'Najpierw potwierdź rzeczywisty czas zakończonego spotkania.';
    END IF;
    IF p_input->>'status' NOT IN ('present','insufficient') OR COALESCE(length(btrim(p_input->>'note')),0) NOT BETWEEN 5 AND 2000 THEN
        RAISE EXCEPTION 'Wybierz decyzję i podaj uzasadnienie (min. 5 znaków).';
    END IF;
    IF jsonb_typeof(p_input->'attendedSeconds') IS DISTINCT FROM 'number'
        OR (p_input->>'attendedSeconds') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Podaj potwierdzony czas obecności. Brak danych nie może oznaczać zaliczenia.';
    END IF;
    v_duration:=floor(extract(epoch FROM s.actual_ends_at-s.actual_starts_at));
    SELECT (completion_rules->>'attendance_percent')::integer INTO v_threshold FROM public.course_versions WHERE id=r.version_id;
    v_seconds:=(p_input->>'attendedSeconds')::integer;
    IF v_seconds<0 OR v_seconds>v_duration OR (p_input->>'status'='present' AND v_seconds<ceil(v_duration*v_threshold/100.0)) THEN
        RAISE EXCEPTION 'Czas obecności nie spełnia wybranej decyzji.';
    END IF;
    INSERT INTO public.session_attendance(session_id,enrollment_id,status,attended_seconds,source,reviewed_by,note)
        VALUES(s.id,e.id,p_input->>'status',v_seconds,'manual',auth.uid(),btrim(p_input->>'note'))
        ON CONFLICT(session_id,enrollment_id) DO UPDATE SET status=EXCLUDED.status,attended_seconds=EXCLUDED.attended_seconds,
            source='manual',reviewed_by=auth.uid(),note=EXCLUDED.note,updated_at=now();
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_ATTENDANCE_REVIEWED',r.course_id,jsonb_build_object('session_id',s.id,'enrollment_id',e.id,
            'status',p_input->>'status','note',p_input->>'note','attended_seconds',v_seconds,
            'teaching_duration_seconds',v_duration,'attendance_percent_required',v_threshold));
    RETURN academy_private.finalize_enrollment(e.id);
END $$;

CREATE FUNCTION public.academy_save_organizer(p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'Wymagany administrator.' USING ERRCODE='42501'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=(p_input->>'profileId')::uuid
        AND NOT COALESCE(p.is_external,false) AND COALESCE(p.employment_status::text,'active')<>'exited') THEN
        RAISE EXCEPTION 'Wybierz aktywne konto Compass.';
    END IF;
    IF NULLIF(p_input->>'id','') IS NOT NULL THEN
        SELECT id INTO v_id FROM public.academy_organizers WHERE id=(p_input->>'id')::uuid FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Organizator nie istnieje.'; END IF;
        IF EXISTS(SELECT 1 FROM public.course_sessions s JOIN public.course_runs r ON r.id=s.run_id
            WHERE s.organizer_id=v_id AND r.status='published' AND s.status='scheduled')
            AND EXISTS(SELECT 1 FROM public.academy_organizers WHERE id=v_id AND (tenant_id<>(p_input->>'tenantId')::uuid
                OR object_id<>(p_input->>'objectId')::uuid OR profile_id<>(p_input->>'profileId')::uuid)) THEN
            RAISE EXCEPTION 'Organizator ma opublikowane sesje. Dodaj nowe konto i przeplanuj sesje.';
        END IF;
        UPDATE public.academy_organizers SET profile_id=(p_input->>'profileId')::uuid,tenant_id=(p_input->>'tenantId')::uuid,
            object_id=(p_input->>'objectId')::uuid,enabled=(p_input->>'enabled')::boolean,configured_by=auth.uid(),updated_at=now() WHERE id=v_id;
    ELSE
        INSERT INTO public.academy_organizers(profile_id,tenant_id,object_id,enabled,configured_by)
            VALUES((p_input->>'profileId')::uuid,(p_input->>'tenantId')::uuid,(p_input->>'objectId')::uuid,(p_input->>'enabled')::boolean,auth.uid()) RETURNING id INTO v_id;
    END IF;
    INSERT INTO public.academy_audit_events(actor_id,action,details) VALUES(auth.uid(),'ACADEMY_ORGANIZER_CONFIGURED',jsonb_build_object('organizer_id',v_id,'enabled',p_input->'enabled'));
    RETURN v_id;
END $$;

CREATE FUNCTION public.academy_save_m365_identity(p_input jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'Wymagany administrator.' USING ERRCODE='42501'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=(p_input->>'userId')::uuid) THEN RAISE EXCEPTION 'Nieprawidłowe konto Compass.'; END IF;
    IF EXISTS(SELECT 1 FROM public.academy_m365_identities WHERE tenant_id=(p_input->>'tenantId')::uuid
        AND object_id=(p_input->>'objectId')::uuid AND user_id<>(p_input->>'userId')::uuid) THEN RAISE EXCEPTION 'Tożsamość jest przypisana do innego uczestnika.'; END IF;
    INSERT INTO public.academy_m365_identities(user_id,tenant_id,object_id,verified_email,verified_by)
        VALUES((p_input->>'userId')::uuid,(p_input->>'tenantId')::uuid,(p_input->>'objectId')::uuid,
            NULLIF(lower(btrim(p_input->>'verifiedEmail')),''),auth.uid())
        ON CONFLICT(tenant_id,object_id) DO UPDATE SET verified_email=EXCLUDED.verified_email,verified_by=auth.uid(),verified_at=now();
    INSERT INTO public.academy_audit_events(actor_id,action,details) VALUES(auth.uid(),'ACADEMY_IDENTITY_VERIFIED',jsonb_build_object('user_id',p_input->>'userId'));
END $$;

CREATE FUNCTION public.academy_list_m365_identities(p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'Wymagany administrator.' USING ERRCODE='42501'; END IF;
    RETURN(SELECT COALESCE(jsonb_agg(item ORDER BY verified_at DESC),'[]') FROM (
        SELECT x.verified_at,jsonb_build_object('id',x.id,'userId',p.id,'fullName',p.full_name,'email',p.email,
            'tenantId',x.tenant_id,'objectId',x.object_id,'verifiedEmail',x.verified_email,'verifiedAt',x.verified_at) item
        FROM public.academy_m365_identities x JOIN public.profiles p ON p.id=x.user_id
        WHERE COALESCE(p_search,'')='' OR position(lower(left(p_search,100)) IN lower(COALESCE(p.full_name,'')||' '||p.email))>0
        ORDER BY x.verified_at DESC LIMIT 100) rows);
END $$;
CREATE FUNCTION public.academy_remove_m365_identity(p_identity_id uuid,p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE x public.academy_m365_identities;
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'Wymagany administrator.' USING ERRCODE='42501'; END IF;
    IF COALESCE(length(btrim(p_note)),0) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Podaj uzasadnienie usunięcia mapowania.'; END IF;
    DELETE FROM public.academy_m365_identities WHERE id=p_identity_id RETURNING * INTO x;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mapowanie nie istnieje.'; END IF;
    INSERT INTO public.academy_audit_events(actor_id,action,details) VALUES(auth.uid(),'ACADEMY_IDENTITY_REMOVED',
        jsonb_build_object('user_id',x.user_id,'identity_id',x.id,'tenant_id',x.tenant_id,'object_id',x.object_id,'note',p_note));
END $$;

CREATE OR REPLACE FUNCTION public.academy_enrollment_has_access(p_enrollment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT public.academy_can_access() AND EXISTS(SELECT 1 FROM public.course_enrollments e
        WHERE e.id=p_enrollment_id AND (e.user_id=auth.uid() OR public.academy_can_manage_course(e.course_id))
        AND (e.run_id IS NULL OR e.completed_at IS NOT NULL OR EXISTS(
            SELECT 1 FROM public.course_run_registrations reg JOIN public.course_runs r ON r.id=reg.run_id
            WHERE reg.enrollment_id=e.id AND reg.user_id=e.user_id AND reg.status='confirmed' AND r.status='published')));
$$;

CREATE FUNCTION public.academy_list_runs(p_course_id uuid DEFAULT NULL,p_run_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT COALESCE(jsonb_agg(item ORDER BY created_at DESC),'[]') FROM (
        SELECT r.created_at,jsonb_build_object('id',r.id,'courseId',r.course_id,'versionId',r.version_id,
            'versionNumber',v.version_number,'courseTitle',v.metadata->>'title','courseSlug',c.slug,
            'title',r.title,'capacity',r.capacity,'status',r.status,
            'confirmedCount',(SELECT count(*) FROM public.course_run_registrations WHERE run_id=r.id AND status='confirmed'),
            'waitlistCount',(SELECT count(*) FROM public.course_run_registrations WHERE run_id=r.id AND status='waitlisted'),
            'canManage',public.academy_can_manage_run(r.id),'canPublish',public.is_admin(),
            'myRegistration',(SELECT jsonb_build_object('id',reg.id,'status',reg.status,'enrollmentId',reg.enrollment_id,
                    'completedAt',(SELECT completed_at FROM public.course_enrollments WHERE id=reg.enrollment_id))
                FROM public.course_run_registrations reg WHERE reg.run_id=r.id AND reg.user_id=auth.uid()),
            'sessions',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id',s.id,'runId',s.run_id,'title',s.title,'startsAt',s.starts_at,'endsAt',s.ends_at,
                'timeZone',s.time_zone,'mode',s.meeting_mode,'required',s.required,'status',s.status,
                'syncStatus',s.sync_status,'organizerId',s.organizer_id,
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
            AND (public.academy_can_manage_run(r.id) OR (r.status='published' AND c.status='published')
                OR EXISTS(SELECT 1 FROM public.course_run_registrations reg WHERE reg.run_id=r.id AND reg.user_id=auth.uid()))
        ORDER BY r.created_at DESC LIMIT 200
    ) rows;
$$;

CREATE FUNCTION public.academy_run_participants(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF NOT public.academy_can_manage_run(p_run_id) THEN RAISE EXCEPTION 'Brak uprawnień do listy uczestników.' USING ERRCODE='42501'; END IF;
    RETURN(SELECT COALESCE(jsonb_agg(jsonb_build_object('registrationId',r.id,'userId',r.user_id,'enrollmentId',r.enrollment_id,
        'fullName',p.full_name,'email',p.email,'status',r.status,'completedAt',e.completed_at,
        'attendance',(SELECT COALESCE(jsonb_agg(jsonb_build_object('sessionId',a.session_id,'status',a.status,
            'attendedSeconds',a.attended_seconds,'source',a.source,'note',a.note)),'[]') FROM public.session_attendance a WHERE a.enrollment_id=r.enrollment_id)
        ) ORDER BY r.created_at,r.id),'[]') FROM public.course_run_registrations r
        JOIN public.profiles p ON p.id=r.user_id LEFT JOIN public.course_enrollments e ON e.id=r.enrollment_id WHERE r.run_id=p_run_id);
END $$;

CREATE FUNCTION public.academy_session_calendar(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.course_sessions; r public.course_runs; reg public.course_run_registrations; v_cancelled boolean;
BEGIN
    SELECT * INTO s FROM public.course_sessions WHERE id=p_session_id;
    SELECT * INTO r FROM public.course_runs WHERE id=s.run_id;
    SELECT * INTO reg FROM public.course_run_registrations WHERE run_id=r.id AND user_id=auth.uid();
    IF NOT public.academy_can_access() OR r.id IS NULL OR r.status='draft' OR s.meeting_mode<>'external_link'
        OR NOT(public.academy_can_manage_run(r.id) OR (reg.id IS NOT NULL AND reg.enrollment_id IS NOT NULL)) THEN
        RAISE EXCEPTION 'Brak dostępu do wydarzenia kalendarzowego.' USING ERRCODE='42501';
    END IF;
    v_cancelled:=s.status='cancelled' OR r.status='cancelled' OR (NOT public.academy_can_manage_run(r.id) AND reg.status<>'confirmed');
    RETURN jsonb_build_object('id',s.id,'title',s.title,'courseTitle',(SELECT metadata->>'title' FROM public.course_versions WHERE id=r.version_id),
        'startsAt',s.starts_at,'endsAt',s.ends_at,'updatedAt',greatest(s.updated_at,r.updated_at,reg.updated_at),
        'revision',s.revision+COALESCE(reg.calendar_revision,0),'status',CASE WHEN v_cancelled THEN 'cancelled' ELSE 'scheduled' END,
        'joinUrl',CASE WHEN NOT v_cancelled THEN s.external_join_url END);
END $$;

CREATE FUNCTION public.academy_list_organizers()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',o.id,'profileId',o.profile_id,'fullName',p.full_name,'email',p.email,
        'tenantId',o.tenant_id,'objectId',o.object_id,'enabled',o.enabled AND NOT COALESCE(p.is_external,false)
            AND COALESCE(p.employment_status::text,'active')<>'exited') ORDER BY p.full_name),'[]')
    FROM public.academy_organizers o JOIN public.profiles p ON p.id=o.profile_id WHERE public.academy_is_trainer();
$$;
CREATE FUNCTION public.academy_organizer_candidates(p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'Wymagany administrator.' USING ERRCODE='42501'; END IF;
    RETURN(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'fullName',p.full_name,'email',p.email)),'[]') FROM (
        SELECT p.id,p.full_name,p.email FROM public.profiles p JOIN auth.users u ON u.id=p.id
        WHERE NOT COALESCE(p.is_external,false) AND COALESCE(p.employment_status::text,'active')<>'exited'
            AND (COALESCE(p_search,'')='' OR position(lower(left(p_search,100)) IN lower(COALESCE(p.full_name,'')||' '||p.email))>0)
        ORDER BY p.full_name,p.id LIMIT 50) p);
END $$;
CREATE FUNCTION public.academy_integration_issues()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT COALESCE(jsonb_agg(item ORDER BY updated_at DESC),'[]') FROM (
        SELECT j.updated_at,jsonb_build_object('id',j.id,'sessionId',s.id,'sessionTitle',s.title,'runId',s.run_id,
            'kind',j.kind,'status',j.status,'attempts',j.attempts,'lastError',j.last_error,'nextAttemptAt',j.available_at,'updatedAt',j.updated_at) item
        FROM public.academy_integration_jobs j JOIN public.course_sessions s ON s.id=j.session_id
        WHERE public.academy_can_manage_run(s.run_id) AND j.status IN ('failed','retry','pending','processing')
        ORDER BY j.updated_at DESC LIMIT 100) rows;
$$;
CREATE FUNCTION public.academy_retry_integration(p_job_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.academy_integration_jobs; s public.course_sessions;
BEGIN
    SELECT * INTO j FROM public.academy_integration_jobs WHERE id=p_job_id;
    SELECT * INTO s FROM public.course_sessions WHERE id=j.session_id;
    IF NOT FOUND OR NOT public.academy_can_manage_run(s.run_id) THEN RAISE EXCEPTION 'Brak uprawnień do integracji.' USING ERRCODE='42501'; END IF;
    UPDATE public.academy_integration_jobs SET status='retry',attempts=0,available_at=now(),last_error=NULL,updated_at=now()
        WHERE id=j.id AND status IN ('failed','retry') AND revision=s.revision;
    IF NOT FOUND THEN RAISE EXCEPTION 'Zadanie jest już wykonywane lub zastąpiła je nowsza zmiana.'; END IF;
    INSERT INTO public.academy_audit_events(actor_id,action,details) VALUES(auth.uid(),'ACADEMY_INTEGRATION_RETRIED',jsonb_build_object('job_id',j.id));
END $$;

CREATE FUNCTION public.academy_claim_jobs(p_worker_id text,p_limit integer DEFAULT 5,p_lease_seconds integer DEFAULT 180)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j record; v_result jsonb:='[]'; v_token uuid; v_count integer:=0;
BEGIN
    IF p_limit IS NULL OR p_lease_seconds IS NULL OR p_limit NOT BETWEEN 1 AND 20 OR p_lease_seconds NOT BETWEEN 60 AND 900
        OR COALESCE(length(p_worker_id),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid_claim'; END IF;
    UPDATE public.academy_integration_jobs SET status='retry',available_at=now(),last_error='lease_expired',updated_at=now()
        WHERE status='processing' AND lease_expires_at<=now();
    FOR j IN SELECT * FROM public.academy_integration_jobs WHERE status IN ('pending','retry') AND available_at<=now()
        ORDER BY available_at,created_at,id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
        EXIT WHEN v_count>=p_limit;
        PERFORM id FROM public.course_sessions WHERE id=j.session_id FOR UPDATE SKIP LOCKED;
        IF NOT FOUND OR EXISTS(SELECT 1 FROM public.academy_integration_jobs WHERE session_id=j.session_id AND status='processing') THEN CONTINUE; END IF;
        v_token:=gen_random_uuid();
        UPDATE public.academy_integration_jobs SET status='processing',attempts=attempts+1,claimed_by=p_worker_id,
            lease_token=v_token,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now() WHERE id=j.id;
        v_result:=v_result||jsonb_build_array(jsonb_build_object('id',j.id,'sessionId',j.session_id,'revision',j.revision,
            'kind',j.kind,'attempt',j.attempts+1,'leaseToken',v_token));
        v_count:=v_count+1;
    END LOOP;
    RETURN v_result;
END $$;

CREATE FUNCTION public.academy_job_lease_current(p_job_id uuid,p_lease_token uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT EXISTS(SELECT 1 FROM public.academy_integration_jobs WHERE id=p_job_id AND lease_token=p_lease_token
        AND status='processing' AND lease_expires_at>now());
$$;

CREATE FUNCTION public.academy_job_context(p_job_id uuid,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.academy_integration_jobs; s public.course_sessions; r public.course_runs; o public.academy_organizers;
    i public.academy_session_integrations; v public.course_versions; v_attendees jsonb; v_participants jsonb;
BEGIN
    IF NOT public.academy_job_lease_current(p_job_id,p_lease_token) THEN RAISE EXCEPTION 'lease_lost'; END IF;
    SELECT * INTO j FROM public.academy_integration_jobs WHERE id=p_job_id;
    SELECT * INTO s FROM public.course_sessions WHERE id=j.session_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=s.run_id;
    SELECT * INTO v FROM public.course_versions WHERE id=r.version_id;
    SELECT * INTO o FROM public.academy_organizers WHERE id=s.organizer_id;
    SELECT * INTO i FROM public.academy_session_integrations WHERE session_id=s.id;
    -- Trusted addresses only: verified auth address and explicit administrator-verified M365 aliases.
    SELECT COALESCE(jsonb_agg(jsonb_build_object('email',mail.email,'name',mail.full_name)),'[]') INTO v_attendees FROM (
        SELECT DISTINCT u.email,p.full_name FROM public.course_run_registrations reg
            JOIN public.profiles p ON p.id=reg.user_id JOIN auth.users u ON u.id=p.id
            WHERE reg.run_id=r.id AND reg.status='confirmed' AND u.email_confirmed_at IS NOT NULL
            AND u.email IS NOT NULL AND p.id IS DISTINCT FROM o.profile_id
        UNION SELECT u.email,p.full_name FROM public.courses c JOIN public.profiles p ON p.id=c.author_id
            JOIN auth.users u ON u.id=p.id WHERE c.id=r.course_id AND u.email_confirmed_at IS NOT NULL
            AND u.email IS NOT NULL AND p.id IS DISTINCT FROM o.profile_id
    ) mail;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('profileId',p.id,
        'identities',(SELECT COALESCE(jsonb_agg(jsonb_build_object('tenantId',x.tenant_id,'objectId',x.object_id)),'[]') FROM public.academy_m365_identities x WHERE x.user_id=p.id),
        'verifiedEmails',(SELECT COALESCE(jsonb_agg(email),'[]') FROM (
            SELECT u.email WHERE u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL
            UNION SELECT x.verified_email FROM public.academy_m365_identities x WHERE x.user_id=p.id AND x.verified_email IS NOT NULL) verified)
        )),'[]') INTO v_participants FROM public.course_run_registrations reg JOIN public.profiles p ON p.id=reg.user_id
        JOIN auth.users u ON u.id=p.id WHERE reg.run_id=r.id AND reg.status='confirmed';
    RETURN jsonb_build_object('id',s.id,'revision',s.revision,'approved',v.status='published',
        'published',r.status='published','cancelled',s.status='cancelled' OR r.status='cancelled',
        'mode',s.meeting_mode,'externalJoinUrl',s.external_join_url,'organizerEnabled',COALESCE(o.enabled,false)
            AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=o.profile_id AND NOT COALESCE(p.is_external,false)
                AND COALESCE(p.employment_status::text,'active')<>'exited'),
        'meeting',CASE WHEN i.session_id IS NULL THEN NULL ELSE jsonb_build_object('eventId',i.event_id,'joinUrl',i.join_url,
            'transactionId',i.transaction_id,'organizerId',i.organizer_object_id) END,
        'onlineMeetingId',i.online_meeting_id,'attendanceWindowConfirmed',s.window_confirmed_at IS NOT NULL,
        'input',jsonb_build_object('sessionId',s.id,'organizer',jsonb_build_object('tenantId',COALESCE(o.tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),
            'userId',COALESCE(o.object_id,'00000000-0000-0000-0000-000000000000'::uuid)),
            'subject',s.title,'startDateTime',s.starts_at,'endDateTime',s.ends_at,'timeZone',s.time_zone,
            'descriptionText','Szkolenie w Akademii Compass. Materiały i zasady ukończenia znajdziesz w swoim panelu szkolenia.', 'attendees',v_attendees),
        'attendanceWindow',jsonb_build_object('start',COALESCE(s.actual_starts_at,s.starts_at),'end',COALESCE(s.actual_ends_at,s.ends_at)),
        'attendanceThresholdPercent',(v.completion_rules->>'attendance_percent')::integer,'participants',v_participants);
END $$;

CREATE FUNCTION public.academy_fail_job(p_job_id uuid,p_lease_token uuid,p_code text,p_status text,p_next_attempt_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.academy_integration_jobs; v_run_id uuid;
BEGIN
    IF p_status NOT IN ('retry','failed') OR length(p_code)>100 OR p_code !~ '^[a-z_]+$' THEN RAISE EXCEPTION 'invalid_job_failure'; END IF;
    SELECT s.run_id INTO v_run_id FROM public.academy_integration_jobs job JOIN public.course_sessions s ON s.id=job.session_id WHERE job.id=p_job_id;
    PERFORM id FROM public.course_runs WHERE id=v_run_id FOR UPDATE;
    PERFORM s.id FROM public.course_sessions s JOIN public.academy_integration_jobs job ON job.session_id=s.id WHERE job.id=p_job_id FOR UPDATE OF s;
    SELECT * INTO j FROM public.academy_integration_jobs WHERE id=p_job_id AND lease_token=p_lease_token AND status='processing' FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    UPDATE public.academy_integration_jobs SET status=p_status,available_at=COALESCE(p_next_attempt_at,now()),last_error=p_code,
        lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=j.id;
    UPDATE public.course_sessions SET sync_status='error',updated_at=now() WHERE id=j.session_id AND revision=j.revision
        AND j.kind IN ('sync_meeting','cancel_meeting');
    INSERT INTO public.academy_audit_events(action,details) VALUES('ACADEMY_INTEGRATION_FAILED',jsonb_build_object('job_id',j.id,'code',p_code,'retry',p_status='retry','attempt',j.attempts));
END $$;

CREATE FUNCTION public.academy_complete_job(p_job_id uuid,p_lease_token uuid,p_outcome jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.academy_integration_jobs; s public.course_sessions; r public.course_runs; v_kind text:=p_outcome->>'kind';
    decision jsonb; report jsonb; e public.course_enrollments; v_completion jsonb;
BEGIN
    -- All state-changing paths lock run -> session -> job to avoid cycles with author edits.
    SELECT * INTO j FROM public.academy_integration_jobs WHERE id=p_job_id;
    SELECT * INTO s FROM public.course_sessions WHERE id=j.session_id;
    SELECT * INTO r FROM public.course_runs WHERE id=s.run_id FOR UPDATE;
    SELECT * INTO s FROM public.course_sessions WHERE id=j.session_id FOR UPDATE;
    SELECT * INTO j FROM public.academy_integration_jobs WHERE id=p_job_id AND lease_token=p_lease_token AND status='processing' AND lease_expires_at>now() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'lease_lost'; END IF;
    IF v_kind='meeting_synced' THEN
        IF j.kind<>'sync_meeting' OR NULLIF(p_outcome#>>'{meeting,eventId}','') IS NULL
            OR NOT COALESCE(academy_private.valid_teams_url(p_outcome#>>'{meeting,joinUrl}'),false)
            OR NOT EXISTS(SELECT 1 FROM public.academy_organizers o WHERE o.id=s.organizer_id AND o.object_id=(p_outcome#>>'{meeting,organizerId}')::uuid) THEN
            RAISE EXCEPTION 'invalid_meeting_result';
        END IF;
        INSERT INTO public.academy_session_integrations(session_id,event_id,join_url,transaction_id,organizer_object_id)
            VALUES(s.id,p_outcome#>>'{meeting,eventId}',p_outcome#>>'{meeting,joinUrl}',p_outcome#>>'{meeting,transactionId}',(p_outcome#>>'{meeting,organizerId}')::uuid)
            ON CONFLICT(session_id) DO UPDATE SET event_id=EXCLUDED.event_id,join_url=EXCLUDED.join_url,transaction_id=EXCLUDED.transaction_id,
                organizer_object_id=EXCLUDED.organizer_object_id,cancelled_at=NULL,updated_at=now();
        -- Even an obsolete response keeps the remote ID. The next revision reconciles it.
        IF s.revision=j.revision AND s.status='scheduled' AND r.status='published' THEN
            UPDATE public.course_sessions SET sync_status='ready',updated_at=now() WHERE id=s.id;
        ELSE
            PERFORM academy_private.enqueue_session(s.id,CASE WHEN s.status='cancelled' OR r.status='cancelled' THEN 'cancel_meeting' ELSE 'sync_meeting' END);
        END IF;
    ELSIF v_kind='meeting_cancelled' THEN
        IF j.kind<>'cancel_meeting' THEN RAISE EXCEPTION 'invalid_job_result'; END IF;
        UPDATE public.academy_session_integrations SET cancelled_at=now(),updated_at=now() WHERE session_id=s.id;
        UPDATE public.course_sessions SET sync_status='cancelled',updated_at=now() WHERE id=s.id AND status='cancelled';
    ELSIF v_kind='attendance_synced' THEN
        IF j.kind<>'sync_attendance' OR s.window_confirmed_at IS NULL THEN RAISE EXCEPTION 'invalid_attendance_result'; END IF;
        IF s.revision=j.revision AND s.status='scheduled' AND r.status='published' THEN
            UPDATE public.academy_session_integrations SET online_meeting_id=p_outcome->>'onlineMeetingId',updated_at=now() WHERE session_id=s.id;
            FOR report IN SELECT value FROM jsonb_array_elements(p_outcome->'reports') LOOP
                INSERT INTO public.academy_attendance_reports(session_id,report_id,evidence) VALUES(s.id,report->>'id',report)
                    ON CONFLICT(session_id,report_id) DO UPDATE SET evidence=EXCLUDED.evidence,imported_at=now();
            END LOOP;
            FOR decision IN SELECT value FROM jsonb_array_elements(p_outcome#>'{evaluation,decisions}') LOOP
                SELECT en.* INTO e FROM public.course_enrollments en JOIN public.course_run_registrations reg ON reg.enrollment_id=en.id
                    WHERE en.run_id=r.id AND en.user_id=(decision->>'profileId')::uuid AND reg.status='confirmed' FOR UPDATE OF en;
                IF NOT FOUND OR e.completed_at IS NOT NULL THEN CONTINUE; END IF;
                INSERT INTO public.session_attendance(session_id,enrollment_id,status,attended_seconds,source,report_ids)
                    VALUES(s.id,e.id,decision->>'status',(decision->>'attendedSeconds')::integer,'teams',decision->'reportIds')
                    ON CONFLICT(session_id,enrollment_id) DO UPDATE SET status=EXCLUDED.status,attended_seconds=EXCLUDED.attended_seconds,
                        report_ids=EXCLUDED.report_ids,updated_at=now() WHERE session_attendance.source='teams';
                v_completion:=academy_private.finalize_enrollment(e.id);
            END LOOP;
        END IF;
    ELSIF v_kind='external_link_validated' THEN
        IF s.meeting_mode<>'external_link' THEN RAISE EXCEPTION 'invalid_job_result'; END IF;
    ELSIF v_kind<>'skipped' THEN RAISE EXCEPTION 'invalid_job_result';
    END IF;
    UPDATE public.academy_integration_jobs SET status=CASE WHEN v_kind='skipped' THEN 'skipped' ELSE 'done' END,
        lease_token=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=now() WHERE id=j.id;
    INSERT INTO public.academy_audit_events(action,course_id,details) VALUES('ACADEMY_INTEGRATION_COMPLETED',r.course_id,
        jsonb_build_object('job_id',j.id,'kind',v_kind,'revision',j.revision,'current_revision',s.revision));
END $$;

-- In-app messages are transactional and deduplicated; they also work with external links.
CREATE TABLE public.academy_notification_receipts(
    dedupe_key text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.academy_notification_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_notification_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.academy_notification_receipts TO service_role;
CREATE FUNCTION academy_private.notify(p_key text,p_user_id uuid,p_run_id uuid,p_title text,p_body text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    INSERT INTO public.academy_notification_receipts(dedupe_key,user_id) VALUES(p_key,p_user_id) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN false; END IF;
    INSERT INTO public.notifications(user_id,type,title_pl,title_en,body_pl,body_en,action_url,priority)
        VALUES(p_user_id,'system_announcement',p_title,'Academy training update',p_body,p_body,'/learning/edycje/'||p_run_id,'normal');
    RETURN true;
END $$;
CREATE FUNCTION academy_private.registration_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_title text; v_run_title text;
BEGIN
    IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
    IF TG_OP='INSERT' AND NEW.status='waitlisted' AND (SELECT count(*) FROM public.course_run_registrations
        WHERE run_id=NEW.run_id AND status='confirmed')<(SELECT capacity FROM public.course_runs WHERE id=NEW.run_id) THEN RETURN NEW; END IF;
    SELECT title INTO v_run_title FROM public.course_runs WHERE id=NEW.run_id;
    v_title:=CASE NEW.status WHEN 'confirmed' THEN 'Potwierdzono zapis na szkolenie'
        WHEN 'waitlisted' THEN 'Jesteś na liście rezerwowej' ELSE 'Anulowano zapis na szkolenie' END;
    PERFORM academy_private.notify('registration:'||NEW.id||':'||NEW.status||':'||NEW.updated_at,NEW.user_id,NEW.run_id,v_title,v_run_title);
    RETURN NEW;
END $$;
CREATE FUNCTION academy_private.registration_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN NEW.calendar_revision:=OLD.calendar_revision+1; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER academy_registration_revision BEFORE UPDATE OF status ON public.course_run_registrations
    FOR EACH ROW EXECUTE FUNCTION academy_private.registration_revision();
CREATE TRIGGER academy_registration_notification AFTER INSERT OR UPDATE OF status ON public.course_run_registrations
    FOR EACH ROW EXECUTE FUNCTION academy_private.registration_notification();
CREATE FUNCTION academy_private.session_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_run_status text; reg record; v_title text;
BEGIN
    SELECT status INTO v_run_status FROM public.course_runs WHERE id=NEW.run_id;
    IF v_run_status='draft' THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND NEW.status=OLD.status AND NEW.starts_at=OLD.starts_at AND NEW.ends_at=OLD.ends_at
        AND NEW.title=OLD.title AND NEW.external_join_url IS NOT DISTINCT FROM OLD.external_join_url THEN RETURN NEW; END IF;
    v_title:=CASE WHEN NEW.status='cancelled' THEN 'Odwołano spotkanie szkoleniowe' ELSE 'Zaktualizowano spotkanie szkoleniowe' END;
    FOR reg IN SELECT user_id FROM public.course_run_registrations WHERE run_id=NEW.run_id AND status='confirmed' LOOP
        PERFORM academy_private.notify('session:'||NEW.id||':'||NEW.revision||':'||reg.user_id,reg.user_id,NEW.run_id,v_title,
            NEW.title||CASE WHEN NEW.status='cancelled' THEN ' — '||COALESCE(NEW.cancellation_reason,'') ELSE '. Sprawdź aktualny termin i link w panelu szkolenia.' END);
    END LOOP;
    RETURN NEW;
END $$;
CREATE TRIGGER academy_session_notification AFTER INSERT OR UPDATE ON public.course_sessions
    FOR EACH ROW EXECUTE FUNCTION academy_private.session_notification();
CREATE FUNCTION public.academy_dispatch_reminders(p_limit integer DEFAULT 500)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item record; v_count integer:=0;
BEGIN
    IF p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'invalid_reminder_limit'; END IF;
    -- Missed old reminders are not sent after the meeting starts. Stable keys survive cron retries.
    FOR item IN SELECT s.id,s.run_id,s.title,s.starts_at,reg.user_id,
        'reminder:'||s.id||':'||s.starts_at||':'||reg.user_id||':'||w.hours AS notification_key
        FROM public.course_sessions s JOIN public.course_runs r ON r.id=s.run_id
        JOIN public.course_run_registrations reg ON reg.run_id=r.id AND reg.status='confirmed'
        CROSS JOIN (VALUES (24),(1)) w(hours)
        WHERE r.status='published' AND s.status='scheduled' AND s.starts_at>now()
            AND s.starts_at<=now()+make_interval(hours=>w.hours)
            AND s.starts_at>now()+make_interval(hours=>w.hours-1)
            AND NOT EXISTS(SELECT 1 FROM public.academy_notification_receipts nr
                WHERE nr.dedupe_key='reminder:'||s.id||':'||s.starts_at||':'||reg.user_id||':'||w.hours)
        ORDER BY s.starts_at,reg.user_id LIMIT p_limit LOOP
        IF academy_private.notify(item.notification_key,item.user_id,item.run_id,'Zbliża się spotkanie szkoleniowe',
            item.title||'. Sprawdź godzinę i dołącz przez panel szkolenia.') THEN v_count:=v_count+1; END IF;
    END LOOP;
    RETURN v_count;
END $$;

CREATE FUNCTION public.academy_purge_attendance_reports(p_retention_days integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_count integer;
BEGIN
    IF p_retention_days IS NULL OR p_retention_days NOT BETWEEN 30 AND 3650 THEN RAISE EXCEPTION 'invalid_retention_policy'; END IF;
    DELETE FROM public.academy_attendance_reports WHERE (session_id,report_id) IN (
        SELECT session_id,report_id FROM public.academy_attendance_reports
        WHERE imported_at<now()-make_interval(days=>p_retention_days) ORDER BY imported_at LIMIT 1000 FOR UPDATE SKIP LOCKED);
    GET DIAGNOSTICS v_count=ROW_COUNT;
    IF v_count>0 THEN INSERT INTO public.academy_audit_events(action,details)
        VALUES('ACADEMY_RAW_ATTENDANCE_PURGED',jsonb_build_object('count',v_count,'retention_days',p_retention_days)); END IF;
    RETURN v_count;
END $$;

-- Explicit privileges: helper internals are never public RPCs; worker RPCs are service-only.
DO $$ DECLARE f record; BEGIN
    FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='academy_private' AND p.proname IN ('valid_teams_url','enqueue_session','refresh_run_meetings','user_may_register',
            'confirm_registration','promote_run_waitlist','cancel_session','notify','registration_notification','registration_revision','session_notification') LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
    END LOOP;
    FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
        AND p.proname IN ('academy_can_manage_run','academy_is_run_registered','academy_create_run','academy_update_run','academy_save_session',
            'academy_publish_run','academy_cancel_session','academy_cancel_run','academy_register_run','academy_cancel_registration',
            'academy_confirm_session_window','academy_record_attendance','academy_save_organizer','academy_save_m365_identity','academy_list_runs',
            'academy_run_participants','academy_list_organizers','academy_organizer_candidates','academy_integration_issues','academy_retry_integration',
            'academy_list_m365_identities','academy_remove_m365_identity','academy_enrollment_has_access','academy_session_calendar') LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
    END LOOP;
    FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
        AND p.proname IN ('academy_claim_jobs','academy_job_lease_current','academy_job_context','academy_fail_job','academy_complete_job',
            'academy_dispatch_reminders','academy_purge_attendance_reports') LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
    END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.academy_attendance_satisfied(uuid) FROM PUBLIC,anon,authenticated;
COMMIT;
