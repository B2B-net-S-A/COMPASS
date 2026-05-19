-- ============================================================
-- Phase 26c — Inbox sync state: track Group mailbox type
-- Date: 2026-05-19
--
-- Context:
--   administracja@b2bnetwork.pl turned out to be a Microsoft 365 Group
--   (Unified Group / GroupMailbox), not a user/shared mailbox. Graph helper
--   was rewritten to use /groups/{id}/threads/posts. To keep the sync_state
--   self-describing (and to support multiple mailboxes of different kinds
--   in the future), we record both the kind and the Graph group object id.
--
-- Changes:
--   1. inbox_sync_state += mailbox_kind ('user'|'group'), group_id TEXT NULL
--   2. Backfill administracja@b2bnetwork.pl row with group_id from prod
--      (c5630e8f-7aee-498e-9561-0c4a376ffa79 — looked up live via Graph).
--
-- The helper also accepts INBOX_PRIMARY_GROUP_ID env override; this DB column
-- is the source of truth when multiple mailboxes are added.
-- ============================================================

ALTER TABLE inbox_sync_state
    ADD COLUMN IF NOT EXISTS mailbox_kind TEXT NOT NULL DEFAULT 'user'
        CHECK (mailbox_kind IN ('user', 'group')),
    ADD COLUMN IF NOT EXISTS group_id TEXT;

COMMENT ON COLUMN inbox_sync_state.mailbox_kind IS
    'user = standard mailbox via /users/{upn}/messages; group = Microsoft 365 Group via /groups/{id}/threads/posts. Phase 26c.';
COMMENT ON COLUMN inbox_sync_state.group_id IS
    'Graph object id for the group when mailbox_kind=group. NULL for user mailboxes.';

-- Backfill the existing administracja@b2bnetwork.pl seed row
UPDATE inbox_sync_state
SET mailbox_kind = 'group',
    group_id     = 'c5630e8f-7aee-498e-9561-0c4a376ffa79',
    updated_at   = NOW()
WHERE mailbox = 'administracja@b2bnetwork.pl';
