-- Cofnięcie B0.5. Kasuje wyniki scenariuszy i warunki bramki. Zrzuty w bucket zostają do ręcznego usunięcia
-- z panelu Storage (Supabase nie pozwala kasować obiektów SQL-em); bucket usuwa się razem z nimi.
BEGIN;
DROP POLICY IF EXISTS academy_readiness_evidence_admin_read ON storage.objects;
DROP POLICY IF EXISTS academy_readiness_evidence_admin_insert ON storage.objects;
DROP FUNCTION IF EXISTS public.academy_record_readiness_result(text,text,text,text,text);
DROP FUNCTION IF EXISTS public.academy_update_launch_condition(text,text,text);
DROP TABLE IF EXISTS public.academy_readiness_results;
DROP TABLE IF EXISTS public.academy_launch_conditions;
NOTIFY pgrst,'reload schema';
DO $$
BEGIN
    IF to_regclass('public.academy_readiness_results') IS NOT NULL THEN RAISE EXCEPTION 'cofnięcie B0.5: tabela nadal istnieje'; END IF;
END $$;
COMMIT;
