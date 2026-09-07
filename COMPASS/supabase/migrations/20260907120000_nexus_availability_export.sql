-- One consistent, complete snapshot for NEXUS allocation and temporary cover.
-- No leave reasons, notes, documents or compensation leave this function.
BEGIN;

CREATE OR REPLACE FUNCTION public.nexus_availability_export()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH calendar AS (
        SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')::date AS day
    ), working AS (
        SELECT day, EXTRACT(ISODOW FROM day) < 6
            AND NOT EXISTS (
                SELECT 1 FROM public.public_holidays h WHERE h.date = day
            ) AS working_day
        FROM calendar
    ), people AS (
        SELECT p.id, lower(trim(p.email)) AS email,
            COALESCE(p.employment_status::text, 'active') AS employment_status,
            w.working_day
                AND COALESCE(p.employment_status::text, 'active') IN ('active', 'offboarding')
                AND (p.hired_at IS NULL OR p.hired_at <= w.day)
                AND (p.termination_date IS NULL OR p.termination_date >= w.day)
                AND NOT EXISTS (
                    SELECT 1 FROM public.leave_requests l
                    WHERE l.user_id = p.id AND l.status = 'approved'
                        AND l.half_day IS NULL
                        AND w.day BETWEEN l.start_date AND l.end_date
                ) AS available,
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'id', l.id, 'start_date', l.start_date,
                    'end_date', l.end_date, 'substitute_id', l.substitute_id
                ) ORDER BY l.start_date, l.id)
                FROM public.leave_requests l
                WHERE l.user_id = p.id AND l.status = 'approved'
                    AND l.half_day IS NULL
                    AND l.end_date >= w.day AND l.start_date <= w.day + 30
            ), '[]'::jsonb) AS absences
        FROM public.profiles p CROSS JOIN working w
        WHERE p.email IS NOT NULL AND trim(p.email) <> ''
    )
    SELECT jsonb_build_object(
        'schema_version', 1,
        'basis', 'calendar_full_day_approved_absences',
        'complete', true,
        'generated_at', CURRENT_TIMESTAMP,
        'date', w.day,
        'working_day', w.working_day,
        'window_end', w.day + 30,
        'count', (SELECT count(*) FROM people),
        'people', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM people p), '[]'::jsonb)
    ) FROM working w;
$$;

REVOKE ALL ON FUNCTION public.nexus_availability_export() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_availability_export() TO service_role;

COMMENT ON FUNCTION public.nexus_availability_export() IS
    'Server-only NEXUS workforce availability. Full-day approved leave only; no reasons or documents.';

COMMIT;
