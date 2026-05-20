-- ============================================================================
-- Phase 25c — Lifecycle email opt-in tracking
-- ============================================================================
--
-- Welcome onboarding emails, exit interview invitations and offboarding
-- manager checklists no longer go out automatically when TCM starts the
-- onboarding/offboarding. They are sent only when TCM explicitly opts in
-- (checkbox in the start dialog) or clicks "Send now" on the detail page.
--
-- This migration adds tracking columns so the UI can show "sent on {date}
-- by {name}" and avoid double-clicks. NULL = email never sent.
--
-- Push notifications (in-app) are unchanged — they remain on by default
-- because they don't spam external mailboxes (no auth.users for externals).
-- ============================================================================

BEGIN;

-- ─── onboarding_progress: welcome email tracking ──────────────────────────
ALTER TABLE onboarding_progress
    ADD COLUMN IF NOT EXISTS welcome_email_sent_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS welcome_email_sent_by  UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN onboarding_progress.welcome_email_sent_at IS
    'Phase 25c: timestamp when TCM/admin explicitly sent the welcome onboarding email. NULL = never sent.';
COMMENT ON COLUMN onboarding_progress.welcome_email_sent_by IS
    'Phase 25c: actor (TCM/admin) who triggered the welcome email send.';

-- ─── exit_interviews: invitation + manager checklist tracking ─────────────
ALTER TABLE exit_interviews
    ADD COLUMN IF NOT EXISTS invitation_sent_at         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS invitation_sent_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS manager_checklist_sent_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS manager_checklist_sent_by  UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN exit_interviews.invitation_sent_at IS
    'Phase 25c: timestamp when TCM/admin explicitly sent the exit interview invitation to the employee. NULL = never sent.';
COMMENT ON COLUMN exit_interviews.invitation_sent_by IS
    'Phase 25c: actor (TCM/admin) who triggered the invitation send.';
COMMENT ON COLUMN exit_interviews.manager_checklist_sent_at IS
    'Phase 25c: timestamp when TCM/admin explicitly sent the offboarding checklist email to the manager. NULL = never sent.';
COMMENT ON COLUMN exit_interviews.manager_checklist_sent_by IS
    'Phase 25c: actor (TCM/admin) who triggered the manager checklist send.';

COMMIT;
