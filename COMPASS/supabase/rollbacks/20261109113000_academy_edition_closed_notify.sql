-- Cofnięcie B3.8. Wysłane już powiadomienia w aplikacji zostają.
BEGIN;
DROP FUNCTION IF EXISTS public.academy_notify_edition_closed(uuid);
COMMIT;
