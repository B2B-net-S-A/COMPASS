-- Cofnięcie B3.12. Wiersze held w academy_outbox zostają i wygasają w swoim terminie.
BEGIN;
DROP FUNCTION IF EXISTS public.academy_record_run_audience(uuid,jsonb,integer,text[]);
DROP TABLE IF EXISTS public.academy_run_audience;
COMMIT;
