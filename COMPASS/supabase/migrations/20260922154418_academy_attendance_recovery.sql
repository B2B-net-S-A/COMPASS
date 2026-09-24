BEGIN;

-- A session may finish before its planned end. Updating its remaining roster
-- must not supersede the already queued attendance import without a successor.
CREATE OR REPLACE FUNCTION academy_private.refresh_run_meetings(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s record;
BEGIN
    FOR s IN SELECT cs.id,cs.window_confirmed_at,cs.actual_ends_at
        FROM public.course_sessions cs JOIN public.course_runs r ON r.id=cs.run_id
        WHERE cs.run_id=p_run_id AND r.status='published' AND cs.status='scheduled' AND cs.ends_at>now()
        AND cs.meeting_mode='managed_teams' FOR UPDATE OF cs LOOP
        UPDATE public.course_sessions SET revision=revision+1,sync_status='pending',updated_at=now() WHERE id=s.id;
        PERFORM academy_private.enqueue_session(s.id,'sync_meeting');
        IF s.window_confirmed_at IS NOT NULL AND s.actual_ends_at<=now() THEN
            PERFORM academy_private.enqueue_session(s.id,'sync_attendance',now()+interval '5 minutes');
        END IF;
    END LOOP;
END $$;

-- An imported report can be valid yet leave unresolved identities. Re-import
-- after an administrator corrects the mapping without changing teaching time.
-- No browser caller can supply decisions, reports, user IDs or a revision.
CREATE FUNCTION public.academy_reconcile_attendance(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.course_sessions; r public.course_runs; j public.academy_integration_jobs;
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'Ta operacja wymaga uprawnień administratora.' USING ERRCODE='42501';
    END IF;
    SELECT * INTO s FROM public.course_sessions WHERE id=p_session_id;
    IF NOT FOUND OR NOT public.academy_can_manage_run(s.run_id) THEN
        RAISE EXCEPTION 'Brak uprawnień do obecności.' USING ERRCODE='42501';
    END IF;
    -- Keep the same lock order as the worker ACK and attendance decisions.
    SELECT * INTO r FROM public.course_runs WHERE id=s.run_id FOR UPDATE;
    SELECT * INTO s FROM public.course_sessions WHERE id=p_session_id FOR UPDATE;
    IF r.status<>'published' OR s.status<>'scheduled' OR s.meeting_mode<>'managed_teams'
        OR s.window_confirmed_at IS NULL OR s.actual_ends_at IS NULL OR s.actual_ends_at>now() THEN
        RAISE EXCEPTION 'Ponowienie wymaga zakończonego spotkania firmowego z potwierdzonym czasem zajęć.';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.academy_session_integrations i
        WHERE i.session_id=s.id AND i.cancelled_at IS NULL) THEN
        RAISE EXCEPTION 'Najpierw zakończ synchronizację spotkania Teams.';
    END IF;
    SELECT * INTO j FROM public.academy_integration_jobs
        WHERE session_id=s.id AND kind='sync_attendance' AND revision=s.revision FOR UPDATE;
    IF j.status='processing' AND j.lease_expires_at>now() THEN
        RAISE EXCEPTION 'Import obecności jest w trakcie. Poczekaj na wynik i ponów po jego zakończeniu.';
    END IF;
    -- Repeated requests against already queued work are harmless. Expired leases
    -- are cleared; a late ACK cannot commit against the replacement lease.
    IF j.status='pending' THEN RETURN; END IF;
    PERFORM academy_private.enqueue_session(s.id,'sync_attendance');
    UPDATE public.academy_integration_jobs SET status='pending',attempts=0,available_at=now(),
        claimed_by=NULL,lease_token=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=now()
        WHERE session_id=s.id AND kind='sync_attendance' AND revision=s.revision;
    -- academy_complete_job preserves manual decisions and skips completed
    -- enrollments. Reconciliation grants no authority to change certificates.
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_ATTENDANCE_RECONCILIATION_REQUESTED',r.course_id,
            jsonb_build_object('session_id',s.id,'revision',s.revision,'previous_status',j.status));
END $$;

REVOKE ALL ON FUNCTION public.academy_reconcile_attendance(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_reconcile_attendance(uuid) TO authenticated;
REVOKE ALL ON FUNCTION academy_private.refresh_run_meetings(uuid) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
