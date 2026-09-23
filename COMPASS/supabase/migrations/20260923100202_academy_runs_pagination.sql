BEGIN;

-- The original academy_list_runs is retained for detail links and existing
-- callers. List screens use this bounded, filtered projection so a later
-- edition cannot disappear behind its historical LIMIT 200.
CREATE FUNCTION public.academy_list_runs_page(
    p_course_id uuid, p_offset integer, p_limit integer, p_scope text,
    p_window_start timestamptz, p_window_end timestamptz, p_course_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
    IF NOT public.academy_can_access() THEN
        RAISE EXCEPTION 'Brak dostępu do Akademii.' USING ERRCODE='42501';
    END IF;
    IF p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 101
        OR p_scope IS NULL OR p_scope NOT IN ('managed','registered','calendar','my_calendar','catalog')
        OR (p_course_ids IS NOT NULL AND cardinality(p_course_ids)>50)
        OR (p_scope='catalog' AND (p_course_ids IS NULL OR cardinality(p_course_ids)=0 OR p_window_start IS NULL))
        OR (p_scope IN ('calendar','my_calendar') AND (p_window_start IS NULL OR p_window_end IS NULL
            OR p_window_end<=p_window_start OR p_window_end>p_window_start+interval '40 days')) THEN
        RAISE EXCEPTION 'Nieprawidłowe parametry listy edycji.' USING ERRCODE='22023';
    END IF;

    WITH candidates AS (
        SELECT r.id,r.course_id,r.created_at,first_session.starts_at AS first_starts_at,
            window_session.starts_at AS window_starts_at
        FROM public.course_runs r
        JOIN public.courses c ON c.id=r.course_id
        LEFT JOIN LATERAL (
            SELECT s.starts_at FROM public.course_sessions s
            WHERE s.run_id=r.id AND s.status='scheduled'
            ORDER BY s.starts_at,s.id LIMIT 1
        ) first_session ON true
        LEFT JOIN LATERAL (
            SELECT min(s.starts_at) AS starts_at FROM public.course_sessions s
            WHERE s.run_id=r.id AND s.status='scheduled'
                -- Calendar inputs are nominal UTC dates for Warsaw month boundaries.
                -- Convert each boundary separately so DST changes do not shift a page.
                AND s.starts_at>=((p_window_start AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Warsaw')
                AND s.starts_at<((p_window_end AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Warsaw')
        ) window_session ON p_scope IN ('calendar','my_calendar')
        WHERE (p_course_id IS NULL OR r.course_id=p_course_id)
            AND (p_course_ids IS NULL OR r.course_id=ANY(p_course_ids))
            AND (public.academy_can_manage_run(r.id)
                OR (r.status='published' AND c.status='published' AND NOT c.legacy_review_required)
                OR EXISTS (SELECT 1 FROM public.course_run_registrations reg
                    WHERE reg.run_id=r.id AND reg.user_id=auth.uid()))
            AND (p_scope<>'managed' OR public.academy_can_manage_run(r.id))
            AND (p_scope NOT IN ('registered','my_calendar') OR EXISTS (
                SELECT 1 FROM public.course_run_registrations reg
                WHERE reg.run_id=r.id AND reg.user_id=auth.uid() AND reg.status<>'cancelled'))
            AND (p_scope NOT IN ('calendar','my_calendar') OR window_session.starts_at IS NOT NULL)
            AND (p_scope<>'catalog' OR (r.status='published' AND c.status='published'
                AND NOT c.legacy_review_required AND first_session.starts_at>p_window_start))
    ), catalog_candidates AS (
        SELECT DISTINCT ON (course_id) id,created_at,first_starts_at,window_starts_at
        FROM candidates WHERE p_scope='catalog'
        ORDER BY course_id,first_starts_at,created_at DESC,id DESC
    ), page_source AS (
        SELECT id,created_at,first_starts_at,window_starts_at FROM candidates WHERE p_scope<>'catalog'
        UNION ALL
        SELECT id,created_at,first_starts_at,window_starts_at FROM catalog_candidates
    ), page AS MATERIALIZED (
        SELECT id,created_at,first_starts_at,window_starts_at FROM page_source
        ORDER BY CASE WHEN p_scope='catalog' THEN first_starts_at
                      WHEN p_scope IN ('calendar','my_calendar') THEN window_starts_at END ASC NULLS LAST,
            created_at DESC,id DESC
        LIMIT p_limit OFFSET p_offset
    )
    SELECT COALESCE(jsonb_agg(item ORDER BY created_at DESC,id DESC),'[]'::jsonb) INTO v_result FROM (
        SELECT page.created_at,page.id,jsonb_build_object('id',r.id,'courseId',r.course_id,'versionId',r.version_id,
            'versionNumber',v.version_number,'courseTitle',v.metadata->>'title','courseSlug',c.slug,
            'title',r.title,'capacity',r.capacity,'status',r.status,
            'confirmedCount',(SELECT count(*) FROM public.course_run_registrations WHERE run_id=r.id AND status='confirmed'),
            'waitlistCount',(SELECT count(*) FROM public.course_run_registrations WHERE run_id=r.id AND status='waitlisted'),
            'canManage',public.academy_can_manage_run(r.id),'canPublish',public.academy_can_review_run(r.id),
            'myRegistration',(SELECT jsonb_build_object('id',reg.id,'status',reg.status,'enrollmentId',reg.enrollment_id,
                    'completedAt',(SELECT completed_at FROM public.course_enrollments WHERE id=reg.enrollment_id),
                    'completionRevokedAt',(SELECT revoked_at FROM public.course_completions WHERE enrollment_id=reg.enrollment_id),
                    'completionRevokedReason',(SELECT revoked_reason FROM public.course_completions WHERE enrollment_id=reg.enrollment_id),
                    'learnerProgress',academy_private.learner_run_progress(reg.enrollment_id))
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
                ) ORDER BY s.starts_at,s.id),'[]'::jsonb) FROM public.course_sessions s
                LEFT JOIN public.academy_session_integrations i ON i.session_id=s.id AND i.cancelled_at IS NULL WHERE s.run_id=r.id)
        ) item
        FROM page JOIN public.course_runs r ON r.id=page.id
        JOIN public.course_versions v ON v.id=r.version_id JOIN public.courses c ON c.id=r.course_id
    ) rows;
    RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.academy_list_runs_page(uuid,integer,integer,text,timestamptz,timestamptz,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_list_runs_page(uuid,integer,integer,text,timestamptz,timestamptz,uuid[]) TO authenticated;
COMMIT;
