-- ============================================================================
-- Archiwum treści maili z auto-importu + DROP martwych kolumn z support_inbox_meta
-- ============================================================================
-- Kontekst: podczas incydentu 2026-08-25 („zniknął nam cały kanban") wyszło na
-- jaw, że select('*') w listInboxTickets ciągnął przy KAŻDYM renderze tablicy
-- ~4,1 MB martwych treści maili z usuniętego auto-importu (Phase 44) —
-- email_body_html / email_body_text / email_headers, pojedyncze wiersze do 441 kB.
--
-- UWAGA na atrybucję: to over-fetch był realnym problemem wydajnościowym, ale
-- NIE był przyczyną pustej tablicy — tą okazała się długość URL-a zapytania
-- (`.in()` z 397 id). Ta migracja usuwa martwy balast; naprawa incydentu siedzi
-- w listInboxTickets (pytanie paczkami).
--
-- Decyzja Artura (2026-08-25): ARCHIWUM + DROP — treści maili zostają odzyskiwalne
-- (Phase 44: „martwe, ale celowo zachowane, do odzyskania"), ale wyprowadzone do
-- osobnej tabeli, której żadna ścieżka listowa nigdy nie dotyka.
--
-- Idempotentna: kopiowanie wykonuje się tylko, gdy kolumny źródłowe jeszcze
-- istnieją (dynamiczny SQL — po DROP ponowny przebieg nie sparsowałby SELECT-a);
-- DROP COLUMN IF EXISTS; CREATE TABLE IF NOT EXISTS.

-- 1) Tabela-archiwum. RLS włączone, ZERO polityk — dostęp wyłącznie service-rolą
--    (wzorzec timesheet_reminder_log): treści maili to dane osobowe, żaden widok
--    aplikacji ich nie renderuje od Phase 44.
CREATE TABLE IF NOT EXISTS support_inbox_email_archive (
    ticket_id UUID PRIMARY KEY REFERENCES support_tickets(id) ON DELETE CASCADE,
    email_body_html TEXT,
    email_body_text TEXT,
    email_headers JSONB,
    email_skip_reason TEXT,
    external_conversation_id TEXT,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE support_inbox_email_archive ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE support_inbox_email_archive IS
    'Zimne archiwum treści maili z usuniętego auto-importu (Phase 44). Zasilone jednorazowo migracją 2026-08-25 przy DROP kolumn z support_inbox_meta. Service-role only (RLS bez polityk).';

-- 2) Kopia treści — tylko wiersze niosące cokolwiek i tylko gdy kolumny źródłowe
--    jeszcze istnieją.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'support_inbox_meta'
          AND column_name = 'email_body_html'
    ) THEN
        EXECUTE $sql$
            INSERT INTO support_inbox_email_archive
                (ticket_id, email_body_html, email_body_text, email_headers, email_skip_reason, external_conversation_id)
            SELECT ticket_id, email_body_html, email_body_text, email_headers, email_skip_reason, external_conversation_id
            FROM support_inbox_meta
            WHERE email_body_html IS NOT NULL
               OR email_body_text IS NOT NULL
               OR email_headers IS NOT NULL
               OR email_skip_reason IS NOT NULL
               OR external_conversation_id IS NOT NULL
            ON CONFLICT (ticket_id) DO NOTHING
        $sql$;
    END IF;
END $$;

-- 3) DROP martwych kolumn (idx_inbox_meta_conversation spada razem z kolumną).
ALTER TABLE support_inbox_meta
    DROP COLUMN IF EXISTS email_body_html,
    DROP COLUMN IF EXISTS email_body_text,
    DROP COLUMN IF EXISTS email_headers,
    DROP COLUMN IF EXISTS email_skip_reason,
    DROP COLUMN IF EXISTS external_conversation_id;

-- 4) Odzyskanie miejsca z TOAST (heap ~320 kB + toast ~1,5 MB → drobne).
--    VACUUM nie może biec w transakcji migracji — zostawiamy autovacuum;
--    rozmiar odpowiedzi API spada natychmiast po DROP (kolumny znikają z SELECT *).
