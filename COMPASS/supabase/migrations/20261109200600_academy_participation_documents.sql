-- B2.9: certyfikat = obecność + zdany test. Sama obecność daje zaświadczenie udziału,
-- osobny dokument poza course_completions, bez nagrody. Późniejsze zdanie daje certyfikat,
-- a zaświadczenie zostaje w historii. Nowe kursy live mają domyślnie wymagany test.
-- Cofnięcie: nieodwracalne, cofamy PITR.
BEGIN;

CREATE TABLE public.academy_participation_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id uuid NOT NULL UNIQUE REFERENCES public.course_enrollments(id),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    course_id uuid NOT NULL REFERENCES public.courses(id),
    run_id uuid REFERENCES public.course_runs(id),
    version_id uuid NOT NULL REFERENCES public.course_versions(id),
    issued_at timestamptz NOT NULL DEFAULT now(),
    snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object')
);
CREATE INDEX academy_participation_user ON public.academy_participation_documents(user_id,issued_at DESC);
CREATE INDEX academy_participation_run ON public.academy_participation_documents(run_id) WHERE run_id IS NOT NULL;
ALTER TABLE public.academy_participation_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_participation_documents FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.academy_participation_documents TO authenticated;
GRANT ALL ON public.academy_participation_documents TO service_role;
CREATE POLICY academy_participation_read ON public.academy_participation_documents FOR SELECT TO authenticated
    USING (public.academy_can_access() AND (user_id=auth.uid() OR public.academy_can_monitor_enrollment(enrollment_id)));

CREATE FUNCTION academy_private.guard_participation_history()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'completion_history_is_immutable'; END $$;
CREATE TRIGGER academy_participation_history BEFORE UPDATE OR DELETE ON public.academy_participation_documents
    FOR EACH ROW EXECUTE FUNCTION academy_private.guard_participation_history();
REVOKE ALL ON FUNCTION academy_private.guard_participation_history() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION pg_temp.patch(p_signature text,p_from text,p_to text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_old text:=pg_get_functiondef(p_signature::regprocedure); v_new text:=replace(v_old,p_from,p_to);
BEGIN
    IF v_new=v_old THEN RAISE EXCEPTION '%: expected fragment missing: %',p_signature,p_from; END IF;
    EXECUTE v_new;
END $$;

SELECT pg_temp.patch('public.academy_create_course(jsonb)',
    $f$'quiz_required',v_mode<>'live'$f$,$t$'quiz_required',true$t$);

SELECT pg_temp.patch('academy_private.finalize_enrollment(uuid)',
    $f$v_participant text; v_author_name text;
BEGIN$f$,$t$v_participant text; v_author_name text; v_issued integer:=0;
BEGIN$t$);
SELECT pg_temp.patch('academy_private.finalize_enrollment(uuid)',
    $f$    IF (v.completion_rules->>'require_all_lessons')::boolean AND EXISTS($f$,
    $t$    -- Obecność bez zdanego testu: osobny dokument, bo wiersz ukończenia przy
    -- UNIQUE(enrollment_id) i niezmiennej historii zablokowałby późniejszy certyfikat.
    IF v.metadata->>'delivery_mode' IN ('live','blended') AND (v.completion_rules->>'quiz_required')::boolean
        AND NOT EXISTS(SELECT 1 FROM public.course_quiz_attempts a WHERE a.enrollment_id=e.id AND a.user_id=e.user_id AND a.course_id=e.course_id AND a.passed)
        AND public.academy_attendance_satisfied(e.id) THEN
        INSERT INTO public.academy_participation_documents(enrollment_id,user_id,course_id,run_id,version_id,issued_at,snapshot)
        SELECT e.id,e.user_id,e.course_id,e.run_id,e.version_id,v_completed,jsonb_build_object(
            'course_title',v.metadata->>'title','version_number',v.version_number,
            'participant_name',COALESCE(p.full_name,p.email,'Uczestnik'),'issued_at',v_completed,
            'run_title',(SELECT r.title FROM public.course_runs r WHERE r.id=e.run_id),
            'document_code',encode(sha256(convert_to('participation:'||e.id::text||':'||v_completed::text,'UTF8')),'hex'))
        FROM public.profiles p WHERE p.id=e.user_id
        ON CONFLICT (enrollment_id) DO NOTHING;
        GET DIAGNOSTICS v_issued=ROW_COUNT;
        IF v_issued>0 THEN
            INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
            VALUES(auth.uid(),'PARTICIPATION_DOCUMENT_ISSUED',c.id,jsonb_build_object('enrollment_id',e.id,'version_id',v.id));
        END IF;
    END IF;
    IF (v.completion_rules->>'require_all_lessons')::boolean AND EXISTS($t$);

NOTIFY pgrst,'reload schema';

DO $$
BEGIN
    IF to_regclass('public.academy_participation_documents') IS NULL THEN RAISE EXCEPTION 'participation documents missing'; END IF;
    IF position('academy_participation_documents' IN pg_get_functiondef('academy_private.finalize_enrollment(uuid)'::regprocedure))=0 THEN
        RAISE EXCEPTION 'finalize does not issue participation documents';
    END IF;
    IF position($q$'quiz_required',true$q$ IN pg_get_functiondef('public.academy_create_course(jsonb)'::regprocedure))=0 THEN
        RAISE EXCEPTION 'live default still skips the quiz';
    END IF;
    IF has_table_privilege('authenticated','public.academy_participation_documents','INSERT') THEN RAISE EXCEPTION 'users can insert documents'; END IF;
END $$;

COMMIT;
