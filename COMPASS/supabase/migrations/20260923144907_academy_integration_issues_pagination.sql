-- The original dashboard silently hid every issue after the newest 100.
-- Keep no-argument RPC calls compatible by giving all new parameters defaults.
BEGIN;

DROP FUNCTION public.academy_integration_issues();

CREATE FUNCTION public.academy_integration_issues(
    p_after_updated_at timestamptz DEFAULT NULL,
    p_after_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
    IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
       OR (p_after_updated_at IS NULL) <> (p_after_id IS NULL) THEN
        RAISE EXCEPTION 'Nieprawidłowe parametry strony problemów integracji.' USING ERRCODE='22023';
    END IF;

    WITH visible AS MATERIALIZED (
        SELECT j.id,j.updated_at,j.kind,j.status,j.attempts,j.last_error,j.available_at,
               s.id AS session_id,s.title AS session_title,s.run_id
        FROM public.academy_integration_jobs j
        JOIN public.course_sessions s ON s.id=j.session_id
        WHERE j.status IN ('failed','retry','pending','processing')
          AND public.academy_can_manage_run(s.run_id)
          AND (p_after_updated_at IS NULL OR (j.updated_at,j.id)<(p_after_updated_at,p_after_id))
        ORDER BY j.updated_at DESC,j.id DESC LIMIT p_limit+1
    ), page AS (
        SELECT * FROM visible ORDER BY updated_at DESC,id DESC LIMIT p_limit
    )
    SELECT jsonb_build_object(
        'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id',id,'sessionId',session_id,'sessionTitle',session_title,'runId',run_id,
            'kind',kind,'status',status,'attempts',attempts,'lastError',last_error,
            'nextAttemptAt',available_at,'updatedAt',updated_at)
            ORDER BY updated_at DESC,id DESC) FROM page),'[]'::jsonb),
        'nextCursor',CASE WHEN (SELECT count(*) FROM visible)>p_limit THEN
            (SELECT jsonb_build_object('updatedAt',updated_at,'id',id)
             FROM page ORDER BY updated_at,id LIMIT 1) ELSE NULL END
    ) INTO v_result;
    RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.academy_integration_issues(timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_integration_issues(timestamptz,uuid,integer) TO authenticated;

CREATE INDEX academy_jobs_issues_page ON public.academy_integration_jobs(updated_at DESC,id DESC)
    WHERE status IN ('failed','retry','pending','processing');

COMMIT;
