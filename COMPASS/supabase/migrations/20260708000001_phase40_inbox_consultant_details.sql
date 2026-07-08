-- ============================================================
-- Phase 40 — Inbox ticket: consultant details (directory-backed + manual)
-- ============================================================
-- The "Nowe zgłoszenie" form links the consultant a ticket concerns to the
-- contractors directory (Phase 33, ~588 rows) instead of the near-empty
-- profiles(role='consultant') set (3 rows) — which is why linking never worked.
--
-- We denormalise the consultant name/phone/client onto support_inbox_meta so:
--   * a matched contractor auto-fills phone + client,
--   * a handler can still type a consultant manually (no contractor row needed),
--   * the ticket keeps a stable snapshot even if the contractor later changes.
--
-- The optional contractor_id links back to the directory when matched; the
-- legacy consultant_id (profiles FK) column is kept for backward compatibility
-- but is no longer written to (0 tickets ever used it).
-- ============================================================

BEGIN;

ALTER TABLE support_inbox_meta
    ADD COLUMN IF NOT EXISTS consultant_name  TEXT,
    ADD COLUMN IF NOT EXISTS consultant_phone TEXT,
    ADD COLUMN IF NOT EXISTS client_name      TEXT,
    ADD COLUMN IF NOT EXISTS contractor_id    UUID REFERENCES contractors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_meta_contractor ON support_inbox_meta(contractor_id);

COMMENT ON COLUMN support_inbox_meta.consultant_name  IS 'Phase 40 — consultant the ticket concerns (from matched contractor or typed manually).';
COMMENT ON COLUMN support_inbox_meta.consultant_phone IS 'Phase 40 — consultant phone (auto-filled from contractor or entered manually).';
COMMENT ON COLUMN support_inbox_meta.client_name      IS 'Phase 40 — client (auto-filled from contractor.current_client or entered manually).';
COMMENT ON COLUMN support_inbox_meta.contractor_id    IS 'Phase 40 — link to contractors directory when the consultant was matched (NULL for manual entries).';

COMMIT;
