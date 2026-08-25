-- Audyt 2026-08-25 · KROK A4.6 — limity rozmiaru i typu na bucketach.
--
-- Wszystkie 9 bucketów miało `file_size_limit = NULL` i `allowed_mime_types = NULL`.
-- Limity istniały WYŁĄCZNIE w kodzie (lib/actions/files.ts:10-12,
-- internal-leave.ts:505), więc żądanie kierowane prosto do Storage REST
-- kluczem anon + własnym JWT omijało je w całości: dowolny zalogowany mógł wgrać
-- plik dowolnej wielkości i dowolnego typu do bucketu pod firmową domeną.
--
-- Limity dobrane wg tego, co realnie przechodzi przez każdy bucket — celowo
-- z zapasem, żeby nie zablokować istniejących przepływów.
-- `avatars` i `chat-attachments` są publiczne, więc mają najciaśniejsze typy.

UPDATE storage.buckets SET
    file_size_limit = 5242880,                                  -- 5 MB
    -- `image/*`, a nie lista konkretnych typów: ten bucket zasila także
    -- synchronizacja zdjęć z Microsoft Graph (service-rolą), a limit MIME
    -- obowiązuje niezależnie od roli — zbyt wąska lista zatrzymałaby sync.
    allowed_mime_types = ARRAY['image/*']
WHERE id = 'avatars';

UPDATE storage.buckets SET
    file_size_limit = 10485760,                                 -- 10 MB
    allowed_mime_types = ARRAY[
        'application/pdf','image/jpeg','image/png','image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
WHERE id IN ('documents', 'contract-documents', 'lifecycle-docs', 'bonus-attachments');

UPDATE storage.buckets SET
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf']               -- faktury wyłącznie PDF
WHERE id = 'invoices';

UPDATE storage.buckets SET
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY[
        'application/pdf','image/jpeg','image/png','image/webp','text/plain',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
WHERE id IN ('chat-attachments', 'inbox-attachments', 'support-materials');

-- Dowolny bucket dodany w przyszłości też ma nie zostać bez limitu.
DO $$
DECLARE v_open text;
BEGIN
    SELECT string_agg(id, ', ') INTO v_open
    FROM storage.buckets
    WHERE file_size_limit IS NULL OR allowed_mime_types IS NULL;

    IF v_open IS NOT NULL THEN
        RAISE EXCEPTION 'A4.6 nie objął wszystkich bucketów — bez limitu zostały: %', v_open;
    END IF;
END $$;
