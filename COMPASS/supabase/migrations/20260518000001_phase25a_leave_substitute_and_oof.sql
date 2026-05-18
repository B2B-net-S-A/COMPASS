-- ============================================================
-- Phase 25a — Leave substitute + Outlook Out-of-Office
-- Date: 2026-05-18
--
-- Depends on:
--   - 20260507120001_phase11b_hr_internal_schema.sql (leave_requests)
--   - 20260514000001_leave_outlook_event_id.sql (outlook_event_id)
--   - 20260516000002_phase20b_manager_id_and_helpers.sql (profiles.manager_id)
--
-- Adds:
--   - leave_requests.substitute_id — kto zastępuje pracownika podczas urlopu
--   - leave_requests.oof_internal_message — tekst OOF dla skrzynek wewnętrznych
--   - leave_requests.oof_external_message — tekst OOF dla skrzynek zewnętrznych
--   - leave_requests.graph_oof_set, graph_oof_set_at — flaga że OOF został wstawiony w Outlook
--   - leave_requests.graph_sync_error — ostatni błąd Graph sync (OOF lub Calendar)
--
-- Workflow:
--   1. Pracownik tworzy urlop z wybranym zastępcą + (opcjonalnym) custom OOF.
--   2. Admin akceptuje → server action wywołuje setOutOfOffice(upn, dates, msgs).
--      Po sukcesie: graph_oof_set=TRUE, graph_oof_set_at=NOW().
--   3. Email do zastępcy (informacja).
--   4. Cancel/Reject zaapprowowanego → disableOutOfOffice(upn) + clear flag.
--
-- Graph sync jest soft-fail: leave_requests pozostaje approved nawet jeśli
-- Graph rejected; flaga graph_sync_error trzyma diagnostykę dla admina.
-- ============================================================

BEGIN;

ALTER TABLE leave_requests
    ADD COLUMN IF NOT EXISTS substitute_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS oof_internal_message   TEXT,
    ADD COLUMN IF NOT EXISTS oof_external_message   TEXT,
    ADD COLUMN IF NOT EXISTS graph_oof_set          BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS graph_oof_set_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS graph_sync_error       TEXT;

CREATE INDEX IF NOT EXISTS idx_leave_requests_substitute
    ON leave_requests(substitute_id) WHERE substitute_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leave_requests_graph_sync_error
    ON leave_requests(graph_sync_error) WHERE graph_sync_error IS NOT NULL;
-- Useful for global "active leaves" banner (status=approved AND start≤today≤end).
CREATE INDEX IF NOT EXISTS idx_leave_requests_active_window
    ON leave_requests(start_date, end_date) WHERE status = 'approved';

COMMENT ON COLUMN leave_requests.substitute_id IS
    'Phase 25a. Pracownik wyznaczony jako zastępca podczas urlopu. NULL = brak zastępcy (dopuszczalne np. dla sick_leave / single-day).';
COMMENT ON COLUMN leave_requests.oof_internal_message IS
    'Phase 25a. Custom tekst Out-of-Office dla skrzynek wewnątrz tenanta (b2bnetwork.pl). NULL = system wygeneruje default z zastępcą.';
COMMENT ON COLUMN leave_requests.oof_external_message IS
    'Phase 25a. Custom tekst Out-of-Office dla skrzynek zewnętrznych. NULL = system wygeneruje default.';
COMMENT ON COLUMN leave_requests.graph_oof_set IS
    'Phase 25a. TRUE gdy Graph API potwierdził ustawienie automaticRepliesSetting w skrzynce pracownika.';
COMMENT ON COLUMN leave_requests.graph_sync_error IS
    'Phase 25a. Last error message from Graph sync (OOF lub Calendar). NULL = OK. Admin widzi w UI z ostrzeżeniem.';

-- ─── Audit log action types (comment only) ─────────────────────────────
-- Server actions emit (audit_logs.action is TEXT, no schema change required):
--   'LEAVE_SUBSTITUTE_ASSIGNED', 'LEAVE_OOF_SET', 'LEAVE_OOF_FAILED',
--   'LEAVE_OOF_DISABLED'.

COMMIT;
