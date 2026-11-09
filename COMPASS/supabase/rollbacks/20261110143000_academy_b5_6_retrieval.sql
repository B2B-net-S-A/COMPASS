-- Cofnięcie 20261110143000_academy_b5_6_retrieval.sql. Usuwa harmonogram i odpowiedzi powtórek.
BEGIN;
DROP FUNCTION public.academy_retrieval_answer(uuid,uuid,uuid);
DROP FUNCTION public.academy_retrieval_open(uuid);
DROP FUNCTION public.academy_retrieval_mark_notified(uuid);
DROP FUNCTION public.academy_retrieval_due(integer);
DROP FUNCTION academy_private.retrieval_reveal(public.academy_retrieval_schedule,uuid);
DROP TABLE public.academy_retrieval_schedule;
NOTIFY pgrst,'reload schema';
COMMIT;
