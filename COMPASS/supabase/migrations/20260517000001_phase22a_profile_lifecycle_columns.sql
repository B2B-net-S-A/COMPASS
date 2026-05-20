-- ============================================================
-- Phase 22a — Profile lifecycle columns + lifecycle_events + has_lifecycle_access
-- Date: 2026-05-17
--
-- Depends on:
--   - 20260507120001_phase11b_hr_internal_schema.sql (profiles base)
--   - 20260516000001_phase20a_role_enum_extend.sql (talent_community in user_role)
--   - 20260516000002_phase20b_manager_id_and_helpers.sql (is_admin, is_talent_community)
--
-- Adds employment lifecycle tracking to profiles:
--   employment_status: pending → onboarding → active → offboarding → exited
--   hired_at, termination_date, buddy_id (peer support during onboarding)
--
-- Creates lifecycle_events — immutable audit timeline (INSERT-only).
-- Creates has_lifecycle_access() helper (admin OR talent_community).
-- ============================================================

BEGIN;

-- ─── 1. profiles: add lifecycle columns ───────────────────────────────────
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS employment_status TEXT NOT NULL DEFAULT 'active'
        CHECK (employment_status IN ('pending', 'onboarding', 'active', 'offboarding', 'exited')),
    ADD COLUMN IF NOT EXISTS hired_at DATE,
    ADD COLUMN IF NOT EXISTS termination_date DATE,
    ADD COLUMN IF NOT EXISTS buddy_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_no_self_buddy;
ALTER TABLE profiles
    ADD CONSTRAINT profiles_no_self_buddy CHECK (buddy_id IS NULL OR buddy_id <> id);

CREATE INDEX IF NOT EXISTS idx_profiles_employment_status
    ON profiles(employment_status);

CREATE INDEX IF NOT EXISTS idx_profiles_buddy_id
    ON profiles(buddy_id)
    WHERE buddy_id IS NOT NULL;

COMMENT ON COLUMN profiles.employment_status IS
    'Phase 22. Lifecycle state: pending (invited, no login yet), onboarding (checklist in progress), active (default), offboarding (exit started), exited (left company).';
COMMENT ON COLUMN profiles.hired_at IS
    'Phase 22. Hire date. Used for onboarding due_date calculation (hired_at + due_offset_days) and tenure_months computation.';
COMMENT ON COLUMN profiles.termination_date IS
    'Phase 22. Termination date set when offboarding starts. Used for exit interview scheduling + final settlement gating.';
COMMENT ON COLUMN profiles.buddy_id IS
    'Phase 22. Peer assigned during onboarding (separate from manager_id). Has read access to buddy onboarding progress + can mark buddy-responsible tasks.';

-- ─── 2. Backfill existing profiles ────────────────────────────────────────
-- Everyone currently in the system → active + hired_at fallback to work_start_date or created_at.
UPDATE profiles
SET hired_at = COALESCE(work_start_date, created_at::date)
WHERE hired_at IS NULL;

-- employment_status is already 'active' via DEFAULT for existing rows on ALTER.

-- ─── 3. Helper: has_lifecycle_access() ────────────────────────────────────
-- Admin + Talent Community Manager can manage onboarding/exit module.
CREATE OR REPLACE FUNCTION public.has_lifecycle_access()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role::TEXT IN ('admin', 'talent_community')
    );
$$;

COMMENT ON FUNCTION public.has_lifecycle_access IS
    'Phase 22. RLS gate for lifecycle module — admin OR talent_community. Used by onboarding_*, exit_interviews, offboarding_tasks, lifecycle_events.';

REVOKE EXECUTE ON FUNCTION public.has_lifecycle_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_lifecycle_access() TO authenticated, service_role;

-- ─── 4. Helper: is_buddy_of(target) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_buddy_of(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = target_user_id
          AND buddy_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.is_buddy_of IS
    'Phase 22. True iff current user is assigned as buddy for target_user_id. Used by onboarding RLS.';

REVOKE EXECUTE ON FUNCTION public.is_buddy_of(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_buddy_of(UUID) TO authenticated, service_role;

-- ─── 5. Table: lifecycle_events (immutable timeline) ──────────────────────
CREATE TABLE IF NOT EXISTS lifecycle_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL CHECK (event_type IN (
        'hired',
        'onboarding_started',
        'onboarding_completed',
        'role_changed',
        'manager_changed',
        'buddy_assigned',
        'offboarding_started',
        'exit_interview_completed',
        'exited'
    )),
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_user
    ON lifecycle_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_type
    ON lifecycle_events(event_type, created_at DESC);

COMMENT ON TABLE lifecycle_events IS
    'Phase 22. Immutable audit timeline for employee lifecycle (hired → onboarded → role/manager changes → offboarding → exited). INSERT-only via trigger.';

-- ─── 6. Trigger: lifecycle_events is INSERT-only (immutable) ──────────────
CREATE OR REPLACE FUNCTION block_lifecycle_events_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'lifecycle_events is append-only — % blocked', TG_OP
        USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_lifecycle_events_block_update ON lifecycle_events;
CREATE TRIGGER trg_lifecycle_events_block_update
    BEFORE UPDATE OR DELETE ON lifecycle_events
    FOR EACH ROW EXECUTE FUNCTION block_lifecycle_events_mutation();

-- ─── 7. RLS for lifecycle_events ──────────────────────────────────────────
ALTER TABLE lifecycle_events ENABLE ROW LEVEL SECURITY;

-- SELECT: owner (their own timeline) OR manager_of OR has_lifecycle_access
DROP POLICY IF EXISTS "lifecycle_events_select_owner_manager_or_tcm" ON lifecycle_events;
CREATE POLICY "lifecycle_events_select_owner_manager_or_tcm" ON lifecycle_events
    FOR SELECT TO authenticated
    USING (
        auth.uid() = user_id
        OR is_manager_of(user_id)
        OR has_lifecycle_access()
    );

-- INSERT: any authenticated (server actions inject via SECURITY DEFINER helpers)
-- We accept any insert because creation is gated by app-layer guards.
DROP POLICY IF EXISTS "lifecycle_events_insert_authenticated" ON lifecycle_events;
CREATE POLICY "lifecycle_events_insert_authenticated" ON lifecycle_events
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- UPDATE/DELETE blocked at trigger level — no RLS policies needed.

-- ─── 8. Backfill: insert 'hired' event for existing employees ─────────────
-- Only for HR-zone roles (not consultant IT) with hired_at set.
INSERT INTO lifecycle_events (user_id, event_type, metadata, created_at)
SELECT
    p.id,
    'hired',
    jsonb_build_object('backfilled', true, 'role', p.role::text),
    COALESCE(p.hired_at::timestamptz, p.created_at)
FROM profiles p
WHERE p.hired_at IS NOT NULL
  AND p.role::TEXT IN ('admin', 'internal', 'finanse', 'manager', 'talent_community')
  AND NOT EXISTS (
      SELECT 1 FROM lifecycle_events e
      WHERE e.user_id = p.id AND e.event_type = 'hired'
  );

COMMIT;
