-- Przegląd bezpieczeństwa: szkic z AI niesie klucz w `options`, a polityka przepuszczała
-- każdego, kto może zarządzać kursem, także redaktora globalnego bez dostępu do klucza.
-- Klucz liczymy jak przy opcjach pytań: kopia w kolejnym szkicu ujawnia ten sam klucz.
-- Warunek: po 20261109200800_academy_question_drafts.sql.
-- Cofnięcie: supabase/rollbacks/20261110160000_academy_question_drafts_key.sql
BEGIN;

DROP POLICY academy_question_drafts_read ON public.academy_question_drafts;
CREATE POLICY academy_question_drafts_read ON public.academy_question_drafts FOR SELECT TO authenticated
    USING (
        public.academy_can_manage_course(course_id)
        AND EXISTS(SELECT 1 FROM public.course_versions v
                   WHERE v.course_id=academy_question_drafts.course_id AND public.academy_can_read_quiz_key(v.id))
    );

NOTIFY pgrst,'reload schema';

DO $$
DECLARE v_qual text;
BEGIN
    SELECT qual INTO v_qual FROM pg_policies
    WHERE schemaname='public' AND tablename='academy_question_drafts' AND policyname='academy_question_drafts_read';
    IF v_qual IS NULL OR position('academy_can_read_quiz_key' IN v_qual)=0 OR position('academy_can_manage_course' IN v_qual)=0 THEN
        RAISE EXCEPTION 'question drafts still readable without quiz key access';
    END IF;
END $$;

COMMIT;
