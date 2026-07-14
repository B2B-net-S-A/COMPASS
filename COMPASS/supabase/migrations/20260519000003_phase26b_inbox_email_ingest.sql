-- ============================================================
-- Phase 26b — Inbox email ingest from administracja@b2bnetwork.pl
-- Date: 2026-05-19
--
-- Depends on:
--   - 20260506100001_phase10_inbox_kanban.sql (support_inbox_meta, is_inbox_handler)
--
-- Changes:
--   1. Extend support_inbox_meta with email-thread + body + headers columns
--      (external_conversation_id, email_body_html, email_body_text,
--       email_headers JSONB, email_skip_reason)
--   2. CREATE TABLE inbox_sync_state — singleton per mailbox holding last_synced_at
--      cursor, last run timestamp and last error message. Bumped by cron on each run.
--   3. Storage bucket 'inbox-attachments' (private) + RLS for handlers only.
--      Folder pattern: inbox-attachments/{ticket_id}/{filename}.
--   4. Seed initial row for administracja@b2bnetwork.pl with last_synced_at=NOW()
--      so MVP starts from deploy moment (no backfill — confirmed scope).
--
-- Audit log actions added in lib/actions/audit.ts (no schema change — TEXT column):
--   INBOX_EMAIL_INGESTED, INBOX_EMAIL_THREAD_APPENDED,
--   INBOX_EMAIL_REOPENED, INBOX_EMAIL_SKIPPED
-- ============================================================

BEGIN;

-- ─── 1. Extend support_inbox_meta ───────────────────────────────────────────

ALTER TABLE support_inbox_meta
    ADD COLUMN IF NOT EXISTS external_conversation_id TEXT,
    ADD COLUMN IF NOT EXISTS email_body_html          TEXT,
    ADD COLUMN IF NOT EXISTS email_body_text          TEXT,
    ADD COLUMN IF NOT EXISTS email_headers            JSONB,
    ADD COLUMN IF NOT EXISTS email_skip_reason        TEXT;

CREATE INDEX IF NOT EXISTS idx_inbox_meta_conversation
    ON support_inbox_meta(external_conversation_id)
    WHERE external_conversation_id IS NOT NULL;

COMMENT ON COLUMN support_inbox_meta.external_conversation_id IS
    'Microsoft Graph conversationId — used to append new messages to existing ticket as comments instead of creating duplicates.';
COMMENT ON COLUMN support_inbox_meta.email_headers IS
    'Raw selected internetMessageHeaders (Auto-Submitted, X-Auto-Response-Suppress, From, To, Subject) for noise filter audit/debug.';
COMMENT ON COLUMN support_inbox_meta.email_skip_reason IS
    'Set when message was matched but explicitly skipped (NDR/OOF/internal noise). NULL for ingested messages.';

-- ─── 2. inbox_sync_state — singleton per mailbox ────────────────────────────

CREATE TABLE IF NOT EXISTS inbox_sync_state (
    mailbox          TEXT PRIMARY KEY,
    last_synced_at   TIMESTAMPTZ NOT NULL,
    last_run_at      TIMESTAMPTZ,
    last_error       TEXT,
    last_scanned     INTEGER NOT NULL DEFAULT 0,
    last_created     INTEGER NOT NULL DEFAULT 0,
    last_appended    INTEGER NOT NULL DEFAULT 0,
    last_skipped     INTEGER NOT NULL DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE inbox_sync_state IS
    'Per-mailbox cursor for /api/cron/inbox-ingest. last_synced_at is the receivedDateTime of the most recent message we ingested (or NOW() at first deploy).';

ALTER TABLE inbox_sync_state ENABLE ROW LEVEL SECURITY;

-- SELECT — handlers only (admin panel reads it for status banner)
DROP POLICY IF EXISTS "inbox_sync_state_select_handlers" ON inbox_sync_state;
CREATE POLICY "inbox_sync_state_select_handlers" ON inbox_sync_state
    FOR SELECT TO authenticated
    USING (is_inbox_handler());

-- No INSERT/UPDATE/DELETE policies → only service-role (cron) writes.
-- RLS is enabled but no permissive policy = blocked for all authenticated.

-- ─── 3. Storage bucket 'inbox-attachments' (private) ────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('inbox-attachments', 'inbox-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Folder pattern: inbox-attachments/{ticket_id}/{filename}
-- Handlers can read all attachments; writes happen via service-role from cron.

DROP POLICY IF EXISTS "inbox_attachments_select_handlers" ON storage.objects;
CREATE POLICY "inbox_attachments_select_handlers" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'inbox-attachments'
        AND is_inbox_handler()
    );

DROP POLICY IF EXISTS "inbox_attachments_delete_admin" ON storage.objects;
CREATE POLICY "inbox_attachments_delete_admin" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'inbox-attachments'
        AND is_admin()
    );

-- No INSERT/UPDATE policies → only service-role (cron) uploads.

-- ─── 4. Seed initial cursor for administracja@b2bnetwork.pl ─────────────────

INSERT INTO inbox_sync_state (mailbox, last_synced_at, last_run_at)
VALUES ('administracja@b2bnetwork.pl', NOW(), NULL)
ON CONFLICT (mailbox) DO NOTHING;

-- ─── 5. notifications.type — add inbox_email_reopened ───────────────────────
-- NOTE: must include ALL types added by earlier migrations (Phase 23 bonus_*,
-- Phase 26a bonus_assigned/updated) — DROP + CREATE wipes the entire list, so
-- we re-state the full set.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'contract_ending', 'health_score_low', 'new_project_match',
        'loyalty_tier_up', 'referral_update', 'document_uploaded',
        'system_announcement', 'payment_received',
        'course_completed', 'course_approved', 'course_rejected',
        'support_ticket_assigned', 'support_ticket_replied', 'support_ticket_resolved',
        'news_published',
        'incubator_pitch_status_changed', 'incubator_application_received', 'incubator_application_status_changed',
        'inbox_ticket_assigned', 'inbox_sla_breach',
        -- Phase 23
        'bonus_proposed', 'bonus_cancelled', 'bonus_linked',
        -- Phase 26 (a)
        'bonus_assigned', 'bonus_updated',
        -- Phase 26b
        'inbox_email_reopened', 'inbox_email_arrived'
    ));

COMMIT;
