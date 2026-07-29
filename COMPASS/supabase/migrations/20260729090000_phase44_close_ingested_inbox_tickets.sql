-- Phase 44 — wyłączenie auto-importu maili do Kanbana: sprzątanie tablicy.
--
-- Kontekst: ingest z compass-tickets@ ruszył realnie dopiero 27.07.2026 (crony
-- Coolify wcześniej nie odpalały) i w dwie doby wrzucił 178 ticketów. Wątkowanie
-- po conversationId nie zadziałało dla tej poczty, więc KAŻDA odpowiedź w wątku
-- (RE:/ODP:/Fw:) zakładała osobny ticket. Przy 44 ticketach ręcznych tablica
-- przestała być czytelna. Kod integracji usunięty w tym samym PR.
--
-- Ta migracja NIE kasuje danych. Zamyka tylko zaimportowane tickety, żeby zeszły
-- z tablicy (kolumny open/in_progress/waiting_user). Treść maili, 24 komentarze
-- i support_inbox_meta zostają — gdyby ktoś czegoś szukał, jest do odzyskania
-- zwykłym UPDATE ... SET status='open'.
--
-- Nietknięte: tickety source='manual_paste' i 'user'.
-- Idempotentna: drugi przebieg trafia na 0 wierszy.

DO $$
DECLARE
    v_closed INTEGER;
BEGIN
    WITH ingested AS (
        SELECT t.id
        FROM support_tickets t
        JOIN support_inbox_meta m ON m.ticket_id = t.id
        WHERE m.source = 'email'
          AND t.status <> 'closed'
    ), updated AS (
        UPDATE support_tickets t
        SET status = 'closed',
            resolved_at = COALESCE(t.resolved_at, NOW()),
            updated_at = NOW()
        FROM ingested i
        WHERE t.id = i.id
        RETURNING t.id
    )
    SELECT count(*) INTO v_closed FROM updated;

    -- Ślad w audycie — migracja nie ma zalogowanego użytkownika, więc zapisuje go sama.
    INSERT INTO audit_logs (user_id, action, details, ip_address)
    VALUES (
        NULL,
        'INBOX_EMAIL_TICKETS_BULK_CLOSED',
        jsonb_build_object(
            'closed_count', v_closed,
            'reason', 'Phase 44 — usunięcie integracji Kanban ↔ skrzynka mailowa',
            'source', 'migration phase44'
        ),
        'migration:phase44'
    );

    RAISE NOTICE 'Phase 44: zamknięto % zaimportowanych ticketów', v_closed;
END $$;
