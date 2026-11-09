-- Cofnięcie B3.5. Już wykonane powiązania i przeniesiona obecność zostają.
BEGIN;
DROP FUNCTION IF EXISTS public.academy_bind_learner_on_entry(uuid,uuid);
DROP FUNCTION IF EXISTS academy_private.bind_learner_to_run(uuid,text);
COMMIT;
