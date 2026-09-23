-- Archive admission boundary. Existing enrollments, content and meeting evidence
-- remain intact. Archive and admission serialize on the same course row BEFORE
-- any run or registration locks. NO KEY UPDATE permits unrelated FK key-share
-- checks while still conflicting with status changes and course review locks.
-- Self-paced academy_enroll already locks the course and checks publication.
BEGIN;

CREATE OR REPLACE FUNCTION public.academy_archive_course(p_course_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses;
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO c FROM public.courses WHERE id=p_course_id FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'course_not_found'; END IF;
    IF c.status='archived' THEN RETURN; END IF;
    -- Direct lesson/quiz writes lock their draft version in a row trigger.
    -- Wait for those in-flight writes before closing the course, so none can
    -- commit after archival. Authoring RPCs already lock course then version.
    IF c.draft_version_id IS NOT NULL THEN
        PERFORM 1 FROM public.course_versions WHERE id=c.draft_version_id AND course_id=c.id FOR UPDATE;
    END IF;
    UPDATE public.courses SET status='archived',updated_at=now() WHERE id=p_course_id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'COURSE_ARCHIVED',p_course_id,jsonb_build_object('previous_status',c.status));
END $$;

CREATE OR REPLACE FUNCTION public.academy_create_run(p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses; v public.course_versions; v_id uuid;
BEGIN
    IF NOT public.academy_can_lead_course((p_input->>'courseId')::uuid) THEN RAISE EXCEPTION 'Brak uprawnień do edycji szkolenia.' USING ERRCODE='42501'; END IF;
    SELECT * INTO c FROM public.courses WHERE id=(p_input->>'courseId')::uuid FOR NO KEY UPDATE;
    IF NOT FOUND OR c.status<>'published' OR c.legacy_review_required THEN
        RAISE EXCEPTION 'Edycja wymaga zatwierdzonego szkolenia live lub mieszanego.';
    END IF;
    SELECT * INTO v FROM public.course_versions WHERE id=(p_input->>'versionId')::uuid
        AND course_id=(p_input->>'courseId')::uuid AND status='published' FOR SHARE;
    IF NOT FOUND OR v.metadata->>'delivery_mode' NOT IN ('live','blended') THEN
        RAISE EXCEPTION 'Edycja wymaga zatwierdzonego szkolenia live lub mieszanego.';
    END IF;
    INSERT INTO public.course_runs(course_id,version_id,title,capacity,created_by)
        VALUES(v.course_id,v.id,btrim(p_input->>'title'),(p_input->>'capacity')::integer,auth.uid()) RETURNING id INTO v_id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_RUN_CREATED',v.course_id,jsonb_build_object('run_id',v_id,'version_id',v.id));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.academy_update_run(p_run_id uuid,p_title text,p_capacity integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs;
BEGIN
    IF NOT public.academy_can_manage_run(p_run_id) THEN RAISE EXCEPTION 'Brak uprawnień do edycji.' USING ERRCODE='42501'; END IF;
    PERFORM 1 FROM public.courses WHERE id=(SELECT course_id FROM public.course_runs WHERE id=p_run_id) FOR NO KEY UPDATE;
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

CREATE OR REPLACE FUNCTION public.academy_cancel_registration(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs; reg public.course_run_registrations;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'Brak dostępu do Akademii.' USING ERRCODE='42501'; END IF;
    PERFORM 1 FROM public.courses WHERE id=(SELECT course_id FROM public.course_runs WHERE id=p_run_id) FOR NO KEY UPDATE;
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

CREATE OR REPLACE FUNCTION public.academy_publish_run(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses; r public.course_runs; s record;
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'Publikacja terminu wymaga administratora.' USING ERRCODE='42501'; END IF;
    SELECT * INTO c FROM public.courses WHERE id=(SELECT course_id FROM public.course_runs WHERE id=p_run_id) FOR NO KEY UPDATE;
    IF NOT FOUND OR c.status<>'published' OR c.legacy_review_required THEN RAISE EXCEPTION 'Program nie jest zatwierdzony.'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=p_run_id FOR UPDATE;
    IF NOT FOUND OR r.status='cancelled' THEN RAISE EXCEPTION 'Nie można opublikować tej edycji.'; END IF;
    IF r.status='published' THEN RETURN; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.course_versions v
        WHERE v.id=r.version_id AND v.course_id=c.id AND v.status='published') THEN RAISE EXCEPTION 'Program nie jest zatwierdzony.'; END IF;
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

CREATE OR REPLACE FUNCTION public.academy_register_run(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses; r public.course_runs; reg public.course_run_registrations; v_id uuid;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'Brak dostępu do Akademii.' USING ERRCODE='42501'; END IF;
    SELECT * INTO c FROM public.courses WHERE id=(SELECT course_id FROM public.course_runs WHERE id=p_run_id) FOR NO KEY UPDATE;
    IF NOT FOUND OR c.status<>'published' OR c.legacy_review_required THEN RAISE EXCEPTION 'Edycja nie jest dostępna do zapisów.'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=p_run_id FOR UPDATE;
    IF NOT FOUND OR r.status<>'published' THEN
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

CREATE OR REPLACE FUNCTION academy_private.promote_run_waitlist(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses; r public.course_runs; reg record; v_slots integer; v_changed boolean:=false;
BEGIN
    -- All callers acquire this parent lock before their run lock. Re-acquiring
    -- it here also protects any future direct internal use of this helper.
    SELECT * INTO c FROM public.courses WHERE id=(SELECT course_id FROM public.course_runs WHERE id=p_run_id) FOR NO KEY UPDATE;
    IF NOT FOUND OR c.status<>'published' OR c.legacy_review_required THEN RETURN; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=p_run_id FOR UPDATE;
    IF NOT FOUND OR r.status<>'published' OR EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=r.id AND status='scheduled' AND starts_at<=now()) THEN RETURN; END IF;
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

CREATE OR REPLACE FUNCTION academy_private.confirm_registration(p_registration_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses; reg public.course_run_registrations; r public.course_runs; v_enrollment uuid;
BEGIN
    SELECT * INTO c FROM public.courses WHERE id=(
        SELECT run.course_id FROM public.course_runs run JOIN public.course_run_registrations registration ON registration.run_id=run.id
        WHERE registration.id=p_registration_id) FOR NO KEY UPDATE;
    IF NOT FOUND OR c.status<>'published' OR c.legacy_review_required THEN RAISE EXCEPTION 'Edycja nie jest dostępna do zapisów.'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=(SELECT run_id FROM public.course_run_registrations WHERE id=p_registration_id) FOR UPDATE;
    IF NOT FOUND OR r.status<>'published' THEN RAISE EXCEPTION 'Edycja nie jest dostępna do zapisów.'; END IF;
    SELECT * INTO reg FROM public.course_run_registrations WHERE id=p_registration_id FOR UPDATE;
    IF NOT FOUND OR reg.status<>'waitlisted' THEN RAISE EXCEPTION 'Oczekujący zapis jest wymagany.'; END IF;
    INSERT INTO public.course_enrollments(user_id,course_id,version_id,run_id)
        VALUES(reg.user_id,r.course_id,r.version_id,r.id)
        ON CONFLICT(user_id,run_id) WHERE run_id IS NOT NULL DO UPDATE SET run_id=EXCLUDED.run_id
        RETURNING id INTO v_enrollment;
    UPDATE public.course_run_registrations SET status='confirmed',enrollment_id=v_enrollment,updated_at=now() WHERE id=reg.id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_REGISTRATION_CONFIRMED',r.course_id,jsonb_build_object('registration_id',reg.id,'user_id',reg.user_id,'run_id',r.id));
    RETURN v_enrollment;
END $$;

-- Preserve the authenticated RPC boundary and keep promotion helpers private.
REVOKE ALL ON FUNCTION academy_private.promote_run_waitlist(uuid),academy_private.confirm_registration(uuid)
    FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.academy_archive_course(uuid),public.academy_create_run(jsonb),
    public.academy_update_run(uuid,text,integer),public.academy_cancel_registration(uuid),
    public.academy_publish_run(uuid),public.academy_register_run(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_archive_course(uuid),public.academy_create_run(jsonb),
    public.academy_update_run(uuid,text,integer),public.academy_cancel_registration(uuid),
    public.academy_publish_run(uuid),public.academy_register_run(uuid) TO authenticated;
COMMIT;
