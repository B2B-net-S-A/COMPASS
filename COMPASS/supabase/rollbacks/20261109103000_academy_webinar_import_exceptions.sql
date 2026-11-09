-- Cofnięcie B3.6. Usuwa wyjątki importu i listę wykluczonych adresów; obecność już zaimportowana zostaje.
BEGIN;
DROP FUNCTION IF EXISTS public.academy_set_webinar_excluded(uuid,text,boolean,text);
DROP FUNCTION IF EXISTS public.academy_list_webinar_excluded(uuid);
DROP FUNCTION IF EXISTS public.academy_resolve_webinar_exception(uuid,text,uuid,uuid,text);
DROP FUNCTION IF EXISTS public.academy_list_webinar_exceptions(uuid);
DROP FUNCTION IF EXISTS public.academy_commit_webinar_import_v2(uuid,jsonb);
DROP FUNCTION IF EXISTS public.academy_preview_webinar_import_v2(uuid,text,jsonb,jsonb,text,uuid);
DROP FUNCTION IF EXISTS academy_private.webinar_exception(text,integer,text,text,text,jsonb,integer);
DROP TABLE IF EXISTS public.academy_webinar_exceptions;
DROP TABLE IF EXISTS public.academy_webinar_excluded_emails;
ALTER TABLE public.academy_webinar_import_batches DROP COLUMN IF EXISTS exceptions;
COMMIT;
