-- Przegląd bezpieczeństwa: lista dla crona szła po wszystkich certyfikatach, bez rolloutu
-- i bez konta nauki, więc przy zamkniętym rolloucie powstawały wiersze held do ludzi
-- spoza pilota, także do kont już zakończonych. Rollout z B1.2 odcina konta zakończone
-- tylko poza redaktorami globalnymi, dlatego konto nauki jest tu warunkiem osobnym.
-- Warunek: po 20261110090000_academy_b1_2_learner_accounts.sql
-- i 20261110113000_academy_b5_1_certificate_validity.sql.
-- Cofnięcie: supabase/rollbacks/20261110160100_academy_certificates_expiring_rollout.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.academy_certificates_expiring(p_within_days integer)
RETURNS TABLE(completion_id uuid,recipient text,full_name text,course_title text,course_slug text,valid_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT x.id,p.email,p.full_name,x.certificate_snapshot->>'course_title',c.slug,(x.certificate_snapshot->>'valid_until')::timestamptz
    FROM public.course_completions x
    JOIN public.profiles p ON p.id=x.user_id
    JOIN public.courses c ON c.id=x.course_id
    WHERE x.revoked_at IS NULL AND p.email IS NOT NULL AND p.employment_status IS DISTINCT FROM 'exited'
        AND academy_private.rollout_allows_user(x.user_id)
        AND NOT EXISTS(SELECT 1 FROM public.academy_learner_accounts a WHERE a.user_id=x.user_id
            AND (a.ended_at IS NOT NULL OR (a.access_until IS NOT NULL AND a.access_until<=now())))
        AND (x.certificate_snapshot->>'valid_until')::timestamptz>now()
        AND (x.certificate_snapshot->>'valid_until')::timestamptz<=now()+make_interval(days=>p_within_days)
        AND NOT EXISTS(SELECT 1 FROM public.course_completions newer WHERE newer.user_id=x.user_id AND newer.course_id=x.course_id
            AND newer.id<>x.id AND newer.revoked_at IS NULL AND newer.completed_at>x.completed_at)
    ORDER BY 6;
$$;

DO $$
DECLARE v_def text:=pg_get_functiondef('public.academy_certificates_expiring(integer)'::regprocedure);
BEGIN
    IF position('rollout_allows_user' IN v_def)=0 OR position('academy_learner_accounts' IN v_def)=0 THEN
        RAISE EXCEPTION 'expiring list ignores rollout or ended learner accounts';
    END IF;
    IF has_function_privilege('authenticated','public.academy_certificates_expiring(integer)','EXECUTE') THEN
        RAISE EXCEPTION 'expiring list is exposed to users';
    END IF;
END $$;

COMMIT;
