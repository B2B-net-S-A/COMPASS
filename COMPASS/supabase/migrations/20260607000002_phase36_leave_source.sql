-- Phase 36 — reverse Outlook OOF → Compass sync (auto-pending leave requests).
--
-- Adds `source` to leave_requests so we can:
--   (a) label auto-detected requests in the approval queue ("z Outlook OOF"),
--   (b) suppress re-creation after a manager rejects one (cron treats a
--       rejected outlook_oof row as "covered" so it won't recreate that day).
--
-- Values: NULL/'self' = employee self-service, 'on_behalf' = manager/admin
-- (Phase 25b), 'outlook_oof' = auto-detected from Outlook Out-of-Office (Phase 36).
-- Additive + nullable → safe, no backfill needed (existing rows stay NULL = self).

ALTER TABLE leave_requests
    ADD COLUMN IF NOT EXISTS source TEXT;

COMMENT ON COLUMN leave_requests.source IS
    'Origin of the request: NULL/self = employee self-service, on_behalf = manager/admin (Phase 25b), outlook_oof = auto-detected from Outlook OOF (Phase 36).';

-- Fast lookup of auto-detected requests (cron idempotency + queue badge).
CREATE INDEX IF NOT EXISTS idx_leave_source_oof
    ON leave_requests(user_id, start_date)
    WHERE source = 'outlook_oof';
