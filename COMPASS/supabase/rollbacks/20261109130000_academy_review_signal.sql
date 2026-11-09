-- Cofnięcie B0.8: wyłącza sygnał w dzwonku i wycofywanie zgłoszeń.
-- Zostają: wiersze w notifications i wpisy audytu oraz rozszerzona lista akcji w academy_course_review_history,
-- bo dodatkowa akcja w filtrze nikomu nie przeszkadza, a historia zachowuje wcześniejsze wycofania.
BEGIN;
DROP TRIGGER IF EXISTS academy_review_signal ON public.course_versions;
DROP FUNCTION IF EXISTS academy_private.review_signal();
DROP FUNCTION IF EXISTS academy_private.review_notify(text,uuid,text,text,text,text);
DROP FUNCTION IF EXISTS public.academy_withdraw_submission(uuid,uuid);
NOTIFY pgrst,'reload schema';
DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='academy_review_signal' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'cofnięcie B0.8: wyzwalacz nadal istnieje';
    END IF;
END $$;
COMMIT;
