BEGIN;

-- Filter withdrawn/cancelled live registrations before paging. A plain
-- PostgREST select is capped at 1,000 rows and can silently hide history.
CREATE FUNCTION public.academy_my_enrollments_page(
    p_active_page integer,
    p_completed_page integer,
    p_revoked_page integer,
    p_limit integer
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
    IF auth.uid() IS NULL OR NOT public.academy_can_access() THEN
        RAISE EXCEPTION 'Brak dostępu do Akademii.' USING ERRCODE='42501';
    END IF;
    IF p_active_page IS NULL OR p_active_page NOT BETWEEN 1 AND 100000
        OR p_completed_page IS NULL OR p_completed_page NOT BETWEEN 1 AND 100000
        OR p_revoked_page IS NULL OR p_revoked_page NOT BETWEEN 1 AND 100000
        OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
        RAISE EXCEPTION 'Nieprawidłowe parametry listy szkoleń.' USING ERRCODE='22023';
    END IF;

    WITH eligible AS MATERIALIZED (
        SELECT e.*, cc.revoked_at AS completion_revoked_at,
            cc.revoked_reason AS completion_revoked_reason,
            CASE WHEN cc.revoked_at IS NOT NULL THEN 'revoked'
                 WHEN e.completed_at IS NOT NULL THEN 'completed'
                 ELSE 'active' END AS section
        FROM public.course_enrollments e
        LEFT JOIN public.course_completions cc ON cc.enrollment_id=e.id AND cc.user_id=e.user_id
        WHERE e.user_id=auth.uid()
            AND (e.run_id IS NULL OR e.completed_at IS NOT NULL OR EXISTS (
                SELECT 1 FROM public.course_run_registrations reg
                JOIN public.course_runs r ON r.id=reg.run_id
                WHERE reg.enrollment_id=e.id AND reg.user_id=e.user_id
                    AND reg.status='confirmed' AND r.status='published'
            ))
    ), counts AS (
        SELECT count(*) FILTER (WHERE section='active') AS active_total,
            count(*) FILTER (WHERE section='completed') AS completed_total,
            count(*) FILTER (WHERE section='revoked') AS revoked_total
        FROM eligible
    ), ranked AS (
        SELECT e.*, row_number() OVER (
            PARTITION BY section
            ORDER BY CASE WHEN section='active' THEN COALESCE(last_accessed_at,enrolled_at)
                          WHEN section='completed' THEN completed_at
                          ELSE completion_revoked_at END DESC NULLS LAST,
                enrolled_at DESC,id DESC
        ) AS position
        FROM eligible e
    ), page AS MATERIALIZED (
        SELECT * FROM ranked WHERE
            (section='active' AND position>(p_active_page-1)*p_limit AND position<=p_active_page*p_limit)
            OR (section='completed' AND position>(p_completed_page-1)*p_limit AND position<=p_completed_page*p_limit)
            OR (section='revoked' AND position>(p_revoked_page-1)*p_limit AND position<=p_revoked_page*p_limit)
    )
    SELECT jsonb_build_object(
        'totals',jsonb_build_object('active',counts.active_total,
            'completed',counts.completed_total,'revoked',counts.revoked_total),
        'items',COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'enrollment',to_jsonb(p),
                'course',to_jsonb(c),
                'version',to_jsonb(v),
                'requiredLessonIds',COALESCE((
                    SELECT jsonb_agg(l.id ORDER BY l.order_index,l.id)
                    FROM public.course_lessons l WHERE l.version_id=p.version_id
                ),'[]'::jsonb)
            ) ORDER BY CASE p.section WHEN 'active' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,p.position)
            FROM page p
            JOIN public.courses c ON c.id=p.course_id
            JOIN public.course_versions v ON v.id=p.version_id
        ),'[]'::jsonb)
    ) INTO v_result FROM counts;
    RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.academy_my_enrollments_page(integer,integer,integer,integer)
    FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_my_enrollments_page(integer,integer,integer,integer)
    TO authenticated;

COMMIT;
