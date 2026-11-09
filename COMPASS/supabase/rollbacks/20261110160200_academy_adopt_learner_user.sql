-- Cofnięcie 20261110160200_academy_adopt_learner_user.sql. Konta już przejęte zostają.
BEGIN;
DROP FUNCTION IF EXISTS public.academy_adopt_learner_user(uuid);
NOTIFY pgrst,'reload schema';
COMMIT;
