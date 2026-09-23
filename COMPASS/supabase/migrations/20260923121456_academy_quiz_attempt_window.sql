-- New versions receive a fixed assessment policy. Historical versions keep
-- their prior unlimited retry behavior, including completed enrollments.
BEGIN;

ALTER TABLE public.course_versions
    ADD COLUMN quiz_attempt_limit integer,
    ADD COLUMN quiz_attempt_window_hours integer;
ALTER TABLE public.course_versions
    ALTER COLUMN quiz_attempt_limit SET DEFAULT 3,
    ALTER COLUMN quiz_attempt_window_hours SET DEFAULT 24,
    ADD CONSTRAINT academy_quiz_attempt_policy_pair CHECK (
        (quiz_attempt_limit IS NULL AND quiz_attempt_window_hours IS NULL)
        OR (quiz_attempt_limit BETWEEN 1 AND 10 AND quiz_attempt_window_hours BETWEEN 1 AND 168)
    );

CREATE FUNCTION academy_private.pin_quiz_attempt_policy()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
    IF TG_OP='INSERT' THEN
        -- An explicit NULL from a future writer must not restore unlimited retries.
        NEW.quiz_attempt_limit:=3;
        NEW.quiz_attempt_window_hours:=24;
    ELSIF NEW.quiz_attempt_limit IS DISTINCT FROM OLD.quiz_attempt_limit
        OR NEW.quiz_attempt_window_hours IS DISTINCT FROM OLD.quiz_attempt_window_hours THEN
        RAISE EXCEPTION 'immutable_quiz_attempt_policy';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER academy_pin_quiz_attempt_policy
    BEFORE INSERT OR UPDATE OF quiz_attempt_limit,quiz_attempt_window_hours ON public.course_versions
    FOR EACH ROW EXECUTE FUNCTION academy_private.pin_quiz_attempt_policy();
REVOKE ALL ON FUNCTION academy_private.pin_quiz_attempt_policy() FROM PUBLIC,anon,authenticated,service_role;

CREATE INDEX academy_quiz_attempt_window ON public.course_quiz_attempts(enrollment_id,attempted_at DESC);

-- The existing scoring transaction remains the only writer of attempts and
-- completions. Move it behind a guarded wrapper so legacy course-ID callers
-- and direct RPC callers share the same version-scoped limit.
ALTER FUNCTION public.academy_submit_quiz(uuid,jsonb) SET SCHEMA academy_private;
ALTER FUNCTION academy_private.academy_submit_quiz(uuid,jsonb) RENAME TO submit_quiz_scoring;
REVOKE ALL ON FUNCTION academy_private.submit_quiz_scoring(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.academy_submit_quiz(p_enrollment_id uuid,p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user_id uuid; v_version_id uuid; v_limit integer; v_hours integer; v_recent integer;
BEGIN
    IF NOT public.academy_can_access() THEN
        RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501';
    END IF;
    SELECT e.user_id,e.version_id,v.quiz_attempt_limit,v.quiz_attempt_window_hours
      INTO v_user_id,v_version_id,v_limit,v_hours
      FROM public.course_enrollments e JOIN public.course_versions v ON v.id=e.version_id
      WHERE e.id=p_enrollment_id AND e.user_id=auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'own_enrollment_required' USING ERRCODE='42501'; END IF;

    IF v_limit IS NOT NULL THEN
        -- One lock for every enrollment of this learner in the pinned version:
        -- two live runs cannot race into a fourth attempt.
        PERFORM pg_advisory_xact_lock(hashtextextended(
            'academy-quiz-attempt:'||v_user_id::text||':'||v_version_id::text,0));
        SELECT count(*) INTO v_recent FROM public.course_quiz_attempts a
          JOIN public.course_enrollments prior ON prior.id=a.enrollment_id
          WHERE prior.user_id=v_user_id AND prior.version_id=v_version_id
            AND a.user_id=v_user_id
            AND a.attempted_at>now()-make_interval(hours=>v_hours);
        IF v_recent>=v_limit THEN
            RAISE EXCEPTION 'quiz_attempt_window_exhausted' USING ERRCODE='P0001';
        END IF;
    END IF;

    RETURN academy_private.submit_quiz_scoring(p_enrollment_id,p_answers);
END $$;
REVOKE ALL ON FUNCTION public.academy_submit_quiz(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_submit_quiz(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
