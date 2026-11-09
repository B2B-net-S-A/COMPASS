-- Cofnięcie 20261110160100_academy_certificates_expiring_rollout.sql: lista bez rolloutu i bez konta nauki.
BEGIN;

CREATE OR REPLACE FUNCTION public.academy_certificates_expiring(p_within_days integer)
RETURNS TABLE(completion_id uuid,recipient text,full_name text,course_title text,course_slug text,valid_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT x.id,p.email,p.full_name,x.certificate_snapshot->>'course_title',c.slug,(x.certificate_snapshot->>'valid_until')::timestamptz
    FROM public.course_completions x
    JOIN public.profiles p ON p.id=x.user_id
    JOIN public.courses c ON c.id=x.course_id
    WHERE x.revoked_at IS NULL AND p.email IS NOT NULL AND p.employment_status IS DISTINCT FROM 'exited'
        AND (x.certificate_snapshot->>'valid_until')::timestamptz>now()
        AND (x.certificate_snapshot->>'valid_until')::timestamptz<=now()+make_interval(days=>p_within_days)
        AND NOT EXISTS(SELECT 1 FROM public.course_completions newer WHERE newer.user_id=x.user_id AND newer.course_id=x.course_id
            AND newer.id<>x.id AND newer.revoked_at IS NULL AND newer.completed_at>x.completed_at)
    ORDER BY 6;
$$;

COMMIT;
