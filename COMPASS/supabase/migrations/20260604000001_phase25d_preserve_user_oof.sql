-- ============================================================
-- Phase 25d — Preserve user-set Out-of-Office auto-reply
-- Date: 2026-06-04
--
-- Bug report (Dorota, 2026-05-28):
--   Maria miała w Outlooku własny custom auto-reply ustawiony ręcznie.
--   Po tym jak Dorota wpisała jej urlop w Compass (Phase 25b), Compass
--   nadpisał jej auto-reply standardowym tekstem "Jestem na urlopie do…".
--
-- Fix:
--   Przed PATCH do mailboxSettings.automaticRepliesSetting czytamy
--   bieżący stan przez GET /users/{upn}/mailboxSettings/automaticRepliesSetting.
--   Jeśli status != 'disabled' ORAZ treść nie zawiera markera
--   <!-- compass-managed-oof-v1 --> ORAZ scheduled end jeszcze nie minął
--   → pomijamy zapis. User-set OOF zostaje nienaruszony.
--
-- Adds:
--   - leave_requests.graph_oof_skip_reason — np. 'user_custom' gdy Compass
--     świadomie nie nadpisał OOF bo user miał własny. NULL gdy OOF ustawiony
--     lub failure (failure jest w graph_sync_error). Audytowane też w
--     audit_logs jako LEAVE_OOF_SKIPPED_USER_CUSTOM.
--
-- Backwards compat:
--   - Stare wiersze bez markera → preserve (treść user-managed wg semantyki).
--     Po pierwszym redeploy każdy nowy/retry-owany OOF dostanie marker w HTML.
-- ============================================================

BEGIN;

ALTER TABLE leave_requests
    ADD COLUMN IF NOT EXISTS graph_oof_skip_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_leave_requests_graph_oof_skip_reason
    ON leave_requests(graph_oof_skip_reason) WHERE graph_oof_skip_reason IS NOT NULL;

COMMENT ON COLUMN leave_requests.graph_oof_skip_reason IS
    'Phase 25d. Powód świadomego pominięcia OOF set przez Compass (np. ''user_custom'' gdy pracownik miał własny auto-reply). NULL = OOF ustawiony lub failure (sprawdź graph_sync_error). Audit log: LEAVE_OOF_SKIPPED_USER_CUSTOM.';

-- ─── Audit log action types (comment only) ─────────────────────────────
-- New action emitted by server actions:
--   'LEAVE_OOF_SKIPPED_USER_CUSTOM' — Compass wykrył istniejący user-set OOF i nie nadpisał go.

COMMIT;
