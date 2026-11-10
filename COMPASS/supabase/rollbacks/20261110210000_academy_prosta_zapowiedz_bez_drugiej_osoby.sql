-- Cofnięcie wersji prostej, krok 4. Stosuje wyłącznie właściciel. Zapowiedzi opublikowane
-- przez organizatora zostają opublikowane (ślad: ACADEMY_ANNOUNCEMENT_PUBLISHED w audycie);
-- kolejne znów wymagają recenzji drugiej osoby.
BEGIN;

DROP FUNCTION public.academy_publish_announcement(uuid);

-- Wyzwalacz niezależności edycji jak w 20260922141936_academy_staff_and_legacy_review.sql.
CREATE OR REPLACE FUNCTION academy_private.guard_run_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='published' AND OLD.status IS DISTINCT FROM NEW.status AND NOT public.academy_can_review_run(NEW.id) THEN RAISE EXCEPTION 'independent_admin_review_required'; END IF;
 RETURN NEW;
END $$;

DO $check$
BEGIN
    IF to_regprocedure('public.academy_publish_announcement(uuid)') IS NOT NULL
        OR pg_get_functiondef('academy_private.guard_run_review()'::regprocedure) LIKE '%academy_is_global_editor%' THEN
        RAISE EXCEPTION 'prosta_4_down: funkcja nadal istnieje';
    END IF;
END $check$;

NOTIFY pgrst, 'reload schema';
COMMIT;
