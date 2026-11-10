-- Cofnięcie wersji prostej, krok 3. Stosuje wyłącznie właściciel. Znika zapis zgody trenera
-- (dowód zostaje w academy_audit_events jako ACADEMY_RUN_PUBLICATION_REQUESTED) i liczba oglądających.
BEGIN;

DROP FUNCTION public.academy_run_recording_viewers(uuid);
DROP FUNCTION public.academy_request_run_publication(uuid, boolean);
DROP TABLE public.academy_run_publication_requests;

DO $check$
BEGIN
    IF to_regclass('public.academy_run_publication_requests') IS NOT NULL
        OR to_regprocedure('public.academy_request_run_publication(uuid,boolean)') IS NOT NULL THEN
        RAISE EXCEPTION 'prosta_3_down: obiekty nadal istnieją';
    END IF;
END $check$;

NOTIFY pgrst, 'reload schema';
COMMIT;
