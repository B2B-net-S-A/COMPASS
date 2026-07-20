-- ============================================================
-- Phase 41 — Przekierowanie poczty do zastępcy na czas urlopu
-- Date: 2026-07-20
--
-- Depends on:
--   - 20260518000001_phase25a_leave_substitute_and_oof.sql (substitute_id, graph_sync_error)
--   - 20260521000001_phase27j_leave_outlook_event_id_and_owner_cancel.sql (wzorzec outlook_event_id)
--
-- Kontekst:
--   Phase 25 wymienia zastępcę w treści auto-reply OOF, ale poczta nieobecnej
--   osoby nadal leży wyłącznie w jej skrzynce — nikt jej nie obsługuje do powrotu.
--   Phase 41 zakłada w skrzynce pracownika regułę Outlooka (Graph messageRule)
--   przekierowującą przychodzącą pocztę do zastępcy (`forwardTo` — kopia,
--   oryginał zostaje u właściciela) i kasuje ją po urlopie.
--
-- KLUCZOWE ograniczenie, które determinuje projekt:
--   Reguła skrzynki NIE MA warunków czasowych — messageRulePredicates nie
--   zawiera żadnego pola daty/harmonogramu. Reguła jest niezależna od
--   automaticRepliesSetting: ustawienie OOF na 10–20.07 nie ogranicza reguły
--   do tego okna. Okno otwiera i zamyka cron (oof-reconcile, 0 6 * * *),
--   a nieudane zamknięcie = przekierowanie działające w nieskończoność.
--   Dlatego sprzątacz sierot (skan reguł po displayName) jest częścią systemu,
--   nie opcją — i dlatego ID reguły MUSI być trwale zapisane na wierszu.
--
-- Adds:
--   - leave_requests.outlook_forward_rule_id — ID reguły z Graph (nieprzezroczysty
--     string), potrzebne do późniejszego DELETE. NULL = brak aktywnego
--     przekierowania. Semantyka 1:1 z outlook_event_id (Phase 27j).
--
-- Uprawnienia (bez zmian w Entra/Exchange):
--   POST/DELETE /users/{upn}/mailFolders/inbox/messageRules wymaga
--   Application `MailboxSettings.ReadWrite` — dokładnie tego, którym Compass
--   od Phase 25 PATCH-uje OOF na tych samych skrzynkach.
--
-- Backwards compat:
--   Kolumna nullable, bez defaultu. Istniejące urlopy mają NULL = brak reguły,
--   co jest prawdą. Cron dociągnie przekierowanie dla trwających urlopów
--   z zastępcą przy pierwszym przebiegu po deployu.
-- ============================================================

BEGIN;

ALTER TABLE leave_requests
    ADD COLUMN IF NOT EXISTS outlook_forward_rule_id TEXT;

CREATE INDEX IF NOT EXISTS idx_leave_requests_forward_rule
    ON leave_requests(outlook_forward_rule_id) WHERE outlook_forward_rule_id IS NOT NULL;

COMMENT ON COLUMN leave_requests.outlook_forward_rule_id IS
    'Phase 41. ID reguły Outlooka (Graph messageRule) przekierowującej pocztę do zastępcy na czas urlopu. NULL = brak aktywnego przekierowania. Ustawiane przy akceptacji/cronie, zerowane przy anulowaniu/końcu urlopu. Reguła NIE wygasa sama (brak warunków czasowych w Graph) — cron oof-reconcile ją zamyka, a sprzątacz sierot łapie reguły, których ID zgubiliśmy. Audit log: LEAVE_FORWARD_SET / LEAVE_FORWARD_DISABLED.';

-- ─── Audit log action types (comment only) ─────────────────────────────
-- Server actions emit (audit_logs.action is TEXT, no schema change required):
--   'LEAVE_FORWARD_SET'            — reguła założona w skrzynce pracownika
--   'LEAVE_FORWARD_FAILED'         — Graph odrzucił założenie reguły (szczegóły w graph_sync_error)
--   'LEAVE_FORWARD_DISABLED'       — reguła skasowana (koniec urlopu / anulowanie / zmiana zastępcy)
--   'LEAVE_FORWARD_ORPHAN_REMOVED' — sprzątacz usunął regułę bez odpowiadającego aktywnego urlopu

COMMIT;
