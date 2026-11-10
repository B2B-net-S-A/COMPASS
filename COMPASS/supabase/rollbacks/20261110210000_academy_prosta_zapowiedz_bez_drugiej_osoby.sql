-- Cofnięcie wersji prostej, krok 4. Stosuje wyłącznie właściciel. Zapowiedzi opublikowane
-- przez organizatora zostają opublikowane (ślad: ACADEMY_ANNOUNCEMENT_PUBLISHED w audycie);
-- kolejne znów wymagają recenzji drugiej osoby.
BEGIN;

DROP FUNCTION public.academy_publish_announcement(uuid);

DO $check$
BEGIN
    IF to_regprocedure('public.academy_publish_announcement(uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'prosta_4_down: funkcja nadal istnieje';
    END IF;
END $check$;

NOTIFY pgrst, 'reload schema';
COMMIT;
