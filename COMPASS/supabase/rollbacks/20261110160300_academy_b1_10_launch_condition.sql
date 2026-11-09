-- Cofnięcie 20261110160300_academy_b1_10_launch_condition.sql.
BEGIN;

DELETE FROM public.academy_launch_conditions
WHERE item='Izolacja konta nauki w warstwie danych: test JWT po pełnym katalogu (B1.10)' AND status='not_started';

CREATE POLICY "Enable read loyalty_rules" ON public.loyalty_rules
    FOR SELECT USING ((SELECT auth.role())='authenticated');

NOTIFY pgrst,'reload schema';

COMMIT;
