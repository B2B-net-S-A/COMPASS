-- The learner overview needs one upcoming session and a page of waitlisted
-- editions, not every registration and every session in the user's history.
BEGIN;

CREATE INDEX academy_registration_user_active_status
    ON public.course_run_registrations(user_id,status,run_id)
    WHERE status IN ('confirmed','waitlisted');

CREATE FUNCTION public.academy_my_run_overview(p_waitlist_page integer, p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user_id uuid := auth.uid(); v_total bigint; v_waiting jsonb; v_upcoming jsonb;
BEGIN
    IF v_user_id IS NULL OR NOT public.academy_can_access() THEN
        RAISE EXCEPTION 'Brak dostępu do Akademii.' USING ERRCODE='42501';
    END IF;
    IF p_waitlist_page IS NULL OR p_waitlist_page NOT BETWEEN 1 AND 100000
        OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN
        RAISE EXCEPTION 'Nieprawidłowe parametry listy rezerwowej.' USING ERRCODE='22023';
    END IF;

    SELECT count(*) INTO v_total
    FROM public.course_run_registrations reg
    JOIN public.course_runs r ON r.id=reg.run_id
    WHERE reg.user_id=v_user_id AND reg.status='waitlisted' AND r.status='published';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'runId',waiting.id,'courseTitle',waiting.course_title,'runTitle',waiting.title)
        ORDER BY waiting.created_at DESC,waiting.id DESC),'[]'::jsonb)
    INTO v_waiting
    FROM (
        SELECT r.id,r.title,r.created_at,v.metadata->>'title' AS course_title
        FROM public.course_run_registrations reg
        JOIN public.course_runs r ON r.id=reg.run_id
        JOIN public.course_versions v ON v.id=r.version_id
        WHERE reg.user_id=v_user_id AND reg.status='waitlisted' AND r.status='published'
        ORDER BY r.created_at DESC,r.id DESC
        LIMIT p_limit OFFSET (p_waitlist_page-1)*p_limit
    ) waiting;

    SELECT jsonb_build_object('runId',r.id,'sessionTitle',s.title,
        'startsAt',s.starts_at,'timeZone',s.time_zone)
    INTO v_upcoming
    FROM public.course_run_registrations reg
    JOIN public.course_runs r ON r.id=reg.run_id
    JOIN public.course_sessions s ON s.run_id=r.id
    WHERE reg.user_id=v_user_id AND reg.status='confirmed' AND r.status='published'
        AND s.status='scheduled' AND s.ends_at>now()
    ORDER BY s.starts_at,s.id
    LIMIT 1;

    RETURN jsonb_build_object('waiting',jsonb_build_object(
        'items',v_waiting,'total',v_total,'page',p_waitlist_page,'pageSize',p_limit),
        'upcoming',v_upcoming);
END $$;

REVOKE ALL ON FUNCTION public.academy_my_run_overview(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_my_run_overview(integer,integer) TO authenticated;
COMMIT;
