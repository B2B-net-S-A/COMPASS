-- Cofnięcie 20261110160000_academy_question_drafts_key.sql: wraca polityka bez warunku klucza.
BEGIN;

DROP POLICY academy_question_drafts_read ON public.academy_question_drafts;
CREATE POLICY academy_question_drafts_read ON public.academy_question_drafts FOR SELECT TO authenticated
    USING (public.academy_can_manage_course(course_id));

NOTIFY pgrst,'reload schema';

COMMIT;
