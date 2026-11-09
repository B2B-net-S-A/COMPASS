-- B5.1: ważność certyfikatu i recertyfikacja. Termin ustawia się w programie, a data
-- „ważny do” zostaje zamrożona w migawce certyfikatu, więc późniejsza zmiana terminu
-- nie przepisuje wystawionych dokumentów. Zapis samodzielny dostaje numer cyklu: po
-- wygaśnięciu certyfikatu otwiera się kolejny, a stary dokument zostaje w historii.
-- Cofnięcie: nieodwracalne, cofamy PITR, bo drugi cykl to już nowe ukończenia.
BEGIN;

ALTER TABLE public.academy_programmes ADD COLUMN validity_months integer
    CHECK (validity_months IS NULL OR validity_months BETWEEN 1 AND 120);
COMMENT ON COLUMN public.academy_programmes.validity_months IS 'Ważność certyfikatu w miesiącach; NULL to dokument bezterminowy.';

ALTER TABLE public.course_enrollments ADD COLUMN cycle integer NOT NULL DEFAULT 1 CHECK (cycle>=1);
DROP INDEX public.academy_enrollment_self_paced;
CREATE UNIQUE INDEX academy_enrollment_self_paced ON public.course_enrollments(user_id,course_id,cycle) WHERE run_id IS NULL;

CREATE OR REPLACE FUNCTION pg_temp.patch(p_signature text,p_from text,p_to text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_old text:=pg_get_functiondef(p_signature::regprocedure); v_new text:=replace(v_old,p_from,p_to);
BEGIN
    IF v_new=v_old THEN RAISE EXCEPTION '%: expected fragment missing: %',p_signature,p_from; END IF;
    EXECUTE v_new;
END $$;

SELECT pg_temp.patch('academy_private.finalize_enrollment(uuid)',
    $f$v_participant text; v_author_name text;$f$,
    $t$v_participant text; v_author_name text; v_validity_months integer;$t$);
SELECT pg_temp.patch('academy_private.finalize_enrollment(uuid)',
    $f$    SELECT full_name INTO v_author_name FROM public.profiles WHERE id=c.author_id;$f$,
    $t$    SELECT full_name INTO v_author_name FROM public.profiles WHERE id=c.author_id;
    SELECT p.validity_months INTO v_validity_months FROM public.academy_programmes p WHERE p.id=c.programme_id;$t$);
SELECT pg_temp.patch('academy_private.finalize_enrollment(uuid)',
    $f$'author_name',v_author_name,'completed_at',v_completed,'certificate_hash',v_hash),true)$f$,
    $t$'author_name',v_author_name,'completed_at',v_completed,'certificate_hash',v_hash,
        'valid_until',CASE WHEN v_validity_months IS NOT NULL THEN v_completed+make_interval(months=>v_validity_months) END),true)$t$);

SELECT pg_temp.patch('public.academy_enroll(uuid,uuid)',
    $f$DECLARE c public.courses%ROWTYPE; v public.course_versions%ROWTYPE; v_id uuid;$f$,
    $t$DECLARE c public.courses%ROWTYPE; v public.course_versions%ROWTYPE; v_id uuid; v_cycle integer;$t$);
SELECT pg_temp.patch('public.academy_enroll(uuid,uuid)',
    $f$    SELECT id INTO v_id FROM public.course_enrollments WHERE user_id=auth.uid() AND course_id=c.id AND run_id IS NULL;
    IF FOUND THEN RETURN v_id; END IF;$f$,
    $t$    -- Najnowszy cykl. Kolejny otwiera tylko wygasły, nieunieważniony certyfikat tego cyklu.
    SELECT id,cycle INTO v_id,v_cycle FROM public.course_enrollments WHERE user_id=auth.uid() AND course_id=c.id AND run_id IS NULL ORDER BY cycle DESC LIMIT 1;
    IF FOUND AND NOT EXISTS(SELECT 1 FROM public.course_completions cc WHERE cc.enrollment_id=v_id AND cc.revoked_at IS NULL
        AND (cc.certificate_snapshot->>'valid_until')::timestamptz<=now()) THEN RETURN v_id; END IF;$t$);
SELECT pg_temp.patch('public.academy_enroll(uuid,uuid)',
    $f$INSERT INTO public.course_enrollments(user_id,course_id,version_id) VALUES(auth.uid(),c.id,v.id) RETURNING id INTO v_id;$f$,
    $t$INSERT INTO public.course_enrollments(user_id,course_id,version_id,cycle) VALUES(auth.uid(),c.id,v.id,COALESCE(v_cycle,0)+1) RETURNING id INTO v_id;$t$);

CREATE FUNCTION public.academy_set_programme_validity(p_programme_id uuid,p_months integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_old integer;
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
    IF p_months IS NOT NULL AND p_months NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'invalid_programme_validity'; END IF;
    SELECT validity_months INTO v_old FROM public.academy_programmes WHERE id=p_programme_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'programme_not_found'; END IF;
    UPDATE public.academy_programmes SET validity_months=p_months WHERE id=p_programme_id;
    INSERT INTO public.academy_audit_events(actor_id,action,details)
    VALUES(auth.uid(),'PROGRAMME_VALIDITY_SET',jsonb_build_object('programme_id',p_programme_id,'from',v_old,'to',p_months));
END $$;
REVOKE ALL ON FUNCTION public.academy_set_programme_validity(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_set_programme_validity(uuid,integer) TO authenticated;

-- Tylko dla crona na service role. Certyfikat odnowiony w późniejszym cyklu nie budzi przypomnienia.
CREATE FUNCTION public.academy_certificates_expiring(p_within_days integer)
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
REVOKE ALL ON FUNCTION public.academy_certificates_expiring(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_certificates_expiring(integer) TO service_role;

NOTIFY pgrst,'reload schema';

DO $$
BEGIN
    IF position('valid_until' IN pg_get_functiondef('academy_private.finalize_enrollment(uuid)'::regprocedure))=0 THEN
        RAISE EXCEPTION 'finalize does not freeze valid_until';
    END IF;
    IF position('ORDER BY cycle DESC' IN pg_get_functiondef('public.academy_enroll(uuid,uuid)'::regprocedure))=0 THEN
        RAISE EXCEPTION 'enroll does not open a new cycle';
    END IF;
    IF (SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='academy_enrollment_self_paced') NOT LIKE '%user_id, course_id, cycle%' THEN
        RAISE EXCEPTION 'self-paced index still blocks a second cycle';
    END IF;
    IF has_function_privilege('authenticated','public.academy_certificates_expiring(integer)','EXECUTE') THEN
        RAISE EXCEPTION 'expiring list is exposed to users';
    END IF;
END $$;

COMMIT;
