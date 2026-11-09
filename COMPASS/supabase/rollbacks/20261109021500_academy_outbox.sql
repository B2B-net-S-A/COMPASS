-- Cofnięcie 20261109021500_academy_outbox.sql. Usuwa kolejkę razem z wierszami, a kod
-- wraca wtedy do stanu „czeka na migrację”, czyli niczego nie wysyła.
BEGIN;

DROP TABLE public.academy_outbox;
DROP FUNCTION academy_private.outbox_guard();

DO $$
BEGIN
 IF to_regclass('public.academy_outbox') IS NOT NULL THEN RAISE EXCEPTION 'academy_outbox: tabela nadal istnieje'; END IF;
 IF to_regprocedure('academy_private.outbox_guard()') IS NOT NULL THEN RAISE EXCEPTION 'academy_outbox: strażnik nadal istnieje'; END IF;
END $$;

COMMIT;
