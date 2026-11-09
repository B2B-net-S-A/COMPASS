-- B1.10: izolacja konta nauki w warstwie danych staje się warunkiem bramki startu, bo bez
-- testu po pełnym katalogu konto nauki widzi w PostgREST to, co RLS daje roli consultant.
--
-- Zamyka też `loyalty_rules`, jedyną tabelę z odczytem dla każdego zalogowanego, której nie
-- czyta klient (odczyt katalogu produkcji 2026-11-09: 0 odwołań w kodzie, wszystkie funkcje
-- czytające są SECURITY DEFINER). Polityka zapisu dla administratorów zostaje.
--
-- Warunek: po 20261109130300_academy_readiness.sql.
-- Cofnięcie: supabase/rollbacks/20261110160300_academy_b1_10_launch_condition.sql
BEGIN;

INSERT INTO public.academy_launch_conditions(item,owner) VALUES
 ('Izolacja konta nauki w warstwie danych: test JWT po pełnym katalogu (B1.10)','właściciel')
ON CONFLICT(item) DO NOTHING;

DROP POLICY IF EXISTS "Enable read loyalty_rules" ON public.loyalty_rules;

NOTIFY pgrst,'reload schema';

DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM public.academy_launch_conditions WHERE item='Izolacja konta nauki w warstwie danych: test JWT po pełnym katalogu (B1.10)') THEN
        RAISE EXCEPTION 'B1.10: brak warunku bramki startu';
    END IF;
    IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='loyalty_rules' AND policyname='Enable read loyalty_rules') THEN
        RAISE EXCEPTION 'B1.10: loyalty_rules nadal czytelne dla każdego konta';
    END IF;
END $$;

COMMIT;
