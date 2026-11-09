-- Cofnięcie 20261110123000_academy_b5_2_document_verify.sql. Znikają linki weryfikacji,
-- same dokumenty zostają bez zmian.
BEGIN;
DROP FUNCTION public.academy_verify_document(text);
DROP FUNCTION public.academy_set_document_share(text,uuid,boolean);
DROP TABLE public.academy_document_shares;
NOTIFY pgrst,'reload schema';
COMMIT;
