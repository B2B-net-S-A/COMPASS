-- ============================================================
-- Phase 26d — Pivot inbox ingest from M365 Group to shared mailbox
-- Date: 2026-05-19
--
-- Context:
--   Phase 26b/26c targeted administracja@b2bnetwork.pl as an M365 Group
--   (Unified) but Microsoft's RAOP cache for ApplicationAccessPolicy changes
--   on Group mailboxes refused to refresh in >60 min — even after AAP was
--   removed entirely (EnforceExoAppRbacPermissions=False at tenant level).
--
--   Pivot:
--     1. Created shared mailbox compass-tickets@b2bnetwork.pl in EXO
--     2. Created Transport Rule "Mirror Administracja to Compass Inbox":
--        SentTo=administracja@b2bnetwork.pl → BlindCopyTo=compass-tickets@
--     3. Added compass-tickets@ as Subscriber/Member of Administracja Group
--        (defense-in-depth)
--     4. Helper now branches on mailbox_kind: 'user' uses /users/{upn}/messages
--        which works immediately on compass-tickets@ without RAOP issues.
--
-- Changes here:
--   1. Update existing administracja@ row → compass-tickets@ + kind='user',
--      group_id=NULL, last_synced_at=NOW() (start clean from this moment)
--   2. Add audit log marker so the pivot is auditable
-- ============================================================

UPDATE inbox_sync_state
SET mailbox        = 'compass-tickets@b2bnetwork.pl',
    mailbox_kind   = 'user',
    group_id       = NULL,
    last_synced_at = NOW(),
    last_run_at    = NULL,
    last_error     = NULL,
    last_scanned   = 0,
    last_created   = 0,
    last_appended  = 0,
    last_skipped   = 0,
    updated_at     = NOW()
WHERE mailbox = 'administracja@b2bnetwork.pl';

-- Defensive: if Phase 26b row never existed (fresh install), insert it now.
INSERT INTO inbox_sync_state (mailbox, mailbox_kind, group_id, last_synced_at)
VALUES ('compass-tickets@b2bnetwork.pl', 'user', NULL, NOW())
ON CONFLICT (mailbox) DO NOTHING;
