-- B2.7: test poza kursem to kurs bez lekcji w tym samym modelu (delivery_mode='assessment').
-- Te same wersje, recenzja, zapis, RLS, dokument i eksport RODO.
-- Cofnięcie: nieodwracalne, cofamy PITR.
BEGIN;

ALTER TABLE public.courses DROP CONSTRAINT courses_delivery_mode_check;
ALTER TABLE public.courses ADD CONSTRAINT courses_delivery_mode_check
    CHECK (delivery_mode IN ('self_paced','live','blended','assessment'));

-- Punktowe zmiany: pozostałe części tych funkcji zmieniają też inne tory.
CREATE OR REPLACE FUNCTION pg_temp.patch(p_signature text,p_from text,p_to text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_old text:=pg_get_functiondef(p_signature::regprocedure); v_new text:=replace(v_old,p_from,p_to);
BEGIN
    IF v_new=v_old THEN RAISE EXCEPTION '%: expected fragment missing: %',p_signature,p_from; END IF;
    EXECUTE v_new;
END $$;

SELECT pg_temp.patch('academy_private.validate_metadata(jsonb,jsonb)',
    $f$NOT IN ('self_paced','live','blended')$f$,$t$NOT IN ('self_paced','live','blended','assessment')$t$);
SELECT pg_temp.patch('academy_private.validate_metadata(jsonb,jsonb)',
    $f$    IF p_metadata->>'delivery_mode'='self_paced'$f$,
    $t$    IF p_metadata->>'delivery_mode'='assessment' AND NOT (p_rules->>'quiz_required')::boolean THEN
        RAISE EXCEPTION 'assessment_requires_quiz';
    END IF;
    IF p_metadata->>'delivery_mode'='self_paced'$t$);
SELECT pg_temp.patch('public.academy_create_course(jsonb)',
    $f$'require_all_lessons',v_mode<>'live'$f$,$t$'require_all_lessons',v_mode NOT IN ('live','assessment')$t$);
SELECT pg_temp.patch('public.academy_submit_for_review(uuid)',
    $f$    IF v.metadata->>'delivery_mode'<>'live' AND NOT EXISTS (SELECT 1 FROM public.course_lessons WHERE version_id=v.id) THEN$f$,
    $t$    IF v.metadata->>'delivery_mode'='assessment' AND EXISTS (SELECT 1 FROM public.course_lessons WHERE version_id=v.id) THEN
        RAISE EXCEPTION 'assessment_has_no_lessons';
    END IF;
    IF v.metadata->>'delivery_mode' NOT IN ('live','assessment') AND NOT EXISTS (SELECT 1 FROM public.course_lessons WHERE version_id=v.id) THEN$t$);
SELECT pg_temp.patch('public.academy_enroll(uuid,uuid)',
    $f$v.metadata->>'delivery_mode'<>'self_paced'$f$,$t$v.metadata->>'delivery_mode' NOT IN ('self_paced','assessment')$t$);

DO $$
BEGIN
    IF position('assessment' IN pg_get_functiondef('public.academy_enroll(uuid,uuid)'::regprocedure))=0
        OR position('assessment_has_no_lessons' IN pg_get_functiondef('public.academy_submit_for_review(uuid)'::regprocedure))=0
        OR position('assessment_requires_quiz' IN pg_get_functiondef('academy_private.validate_metadata(jsonb,jsonb)'::regprocedure))=0 THEN
        RAISE EXCEPTION 'assessment mode not installed';
    END IF;
END $$;

COMMIT;
