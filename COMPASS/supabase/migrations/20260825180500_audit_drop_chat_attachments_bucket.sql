-- Audyt 2026-08-25 · akcje — sprzątanie po usuniętym komunikatorze.
--
-- Komunikator (/messages, lib/actions/communicator.ts) został usunięty w Etapie C.
-- Został po nim bucket `chat-attachments` z ustawieniem PUBLIC = true oraz polityka
-- SELECT `bucket_id = 'chat-attachments'` bez żadnego powiązania z rozmową — czyli
-- każdy zalogowany mógł czytać każdy załącznik czatu, a publiczny bucket oznacza,
-- że wystarczał sam adres URL, bez logowania.
--
-- Dziś nic tego bucketu nie zapisuje ani nie czyta (zero odwołań w kodzie), a stan
-- na produkcji przed migracją to 0 obiektów — usunięcie nie kasuje żadnych danych.
-- Zostawienie go byłoby otwartą, nienadzorowaną powierzchnią zapisu: polityka INSERT
-- nadal pozwalała każdemu zalogowanemu wgrywać pliki do publicznie czytelnego kosza.

BEGIN;

DO $$
DECLARE
    v_objects BIGINT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'chat-attachments') THEN
        RAISE NOTICE 'Bucket chat-attachments już nie istnieje — nic do zrobienia.';
        RETURN;
    END IF;

    SELECT count(*) INTO v_objects FROM storage.objects WHERE bucket_id = 'chat-attachments';

    -- Bezpiecznik: gdyby ktoś zdążył coś tam wgrać między audytem a wdrożeniem,
    -- migracja ma się WYWALIĆ, a nie po cichu skasować cudze pliki.
    IF v_objects > 0 THEN
        RAISE EXCEPTION
            'Bucket chat-attachments ma % obiektów — migracja zakłada, że jest pusty. Sprawdź zawartość przed usunięciem.',
            v_objects;
    END IF;

    DROP POLICY IF EXISTS "Users can view chat attachments" ON storage.objects;
    DROP POLICY IF EXISTS "Users can upload chat attachments" ON storage.objects;

    DELETE FROM storage.buckets WHERE id = 'chat-attachments';

    RAISE NOTICE 'Usunięto bucket chat-attachments wraz z dwiema politykami.';
END $$;

COMMIT;
