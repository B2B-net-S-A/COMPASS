-- ============================================================
-- Phase 22f — Cancellation + lifecycle_notes + external employees
-- Date: 2026-05-17
--
-- Depends on:
--   - 20260517000001..._phase22a..e (full Phase 22 schema)
--
-- Adds:
--   profiles.is_external + external_notes — pracownicy bez konta w auth.users
--   onboarding_progress.cancelled_at/_by/_reason — anuluj onboarding
--   exit_interviews status enum extended with 'cancelled' + cancelled_at/_by/_reason
--   lifecycle_notes table — private TCM notes per pracownik
-- ============================================================

BEGIN;

-- ─── 1. profiles: external employee flag ─────────────────────────────────
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS is_external BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS external_notes TEXT;

COMMENT ON COLUMN profiles.is_external IS
    'Phase 22f. External employee — onboarding tracked w Compass ale osoba nie ma konta auth.users (nie loguje się). TCM oznacza taski w jej imieniu.';
COMMENT ON COLUMN profiles.external_notes IS
    'Phase 22f. Free-text notatka kontekstowa o external employee (np. powód braku konta, kontakt zewnętrzny).';

CREATE INDEX IF NOT EXISTS idx_profiles_is_external
    ON profiles(is_external)
    WHERE is_external = TRUE;

-- ─── 2. onboarding_progress cancellation ─────────────────────────────────
ALTER TABLE onboarding_progress
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_onboarding_progress_cancelled
    ON onboarding_progress(cancelled_at)
    WHERE cancelled_at IS NOT NULL;

COMMENT ON COLUMN onboarding_progress.cancelled_at IS
    'Phase 22f. Kiedy onboarding został anulowany. NOT NULL = cancelled (terminalny stan analogiczny do completed_at).';

-- ─── 3. exit_interviews: cancelled status + columns ──────────────────────
ALTER TABLE exit_interviews DROP CONSTRAINT IF EXISTS exit_interviews_status_check;
ALTER TABLE exit_interviews
    ADD CONSTRAINT exit_interviews_status_check
    CHECK (status IN ('scheduled', 'submitted', 'reviewed', 'archived', 'cancelled'));

ALTER TABLE exit_interviews
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Update transitions trigger to allow scheduled → cancelled and require cancellation metadata.
CREATE OR REPLACE FUNCTION enforce_exit_interview_transitions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'scheduled' THEN
            RAISE EXCEPTION 'Nowy exit interview musi mieć status=scheduled (got: %)', NEW.status
                USING ERRCODE = 'P0001';
        END IF;
        IF NEW.role_snapshot IS NULL OR NEW.role_snapshot = '' THEN
            RAISE EXCEPTION 'role_snapshot jest wymagane przy tworzeniu exit_interview'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'scheduled' AND NEW.status = 'submitted' THEN
        IF NEW.submitted_at IS NULL THEN
            NEW.submitted_at := NOW();
        END IF;
        IF NEW.exit_reason IS NULL OR NEW.nps_score IS NULL THEN
            RAISE EXCEPTION 'Submit wymaga: exit_reason oraz nps_score.'
                USING ERRCODE = 'P0001';
        END IF;
        IF NEW.is_anonymous = TRUE THEN
            NEW.user_id := NULL;
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'submitted' AND NEW.status = 'reviewed' THEN
        IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL THEN
            RAISE EXCEPTION 'Reviewed wymaga: reviewed_by + reviewed_at.'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status = 'archived' AND OLD.status IN ('reviewed', 'submitted', 'cancelled') THEN
        RETURN NEW;
    END IF;

    -- Phase 22f: scheduled → cancelled (jeśli pracownik jednak zostaje).
    IF OLD.status = 'scheduled' AND NEW.status = 'cancelled' THEN
        IF NEW.cancelled_by IS NULL THEN
            RAISE EXCEPTION 'Cancellation wymaga: cancelled_by.'
                USING ERRCODE = 'P0001';
        END IF;
        IF NEW.cancelled_at IS NULL THEN
            NEW.cancelled_at := NOW();
        END IF;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid exit_interview status transition: % → %', OLD.status, NEW.status
        USING ERRCODE = 'P0001';
END;
$$;

-- block_employment_reversal_after_exit should now SKIP cancelled interviews.
CREATE OR REPLACE FUNCTION block_employment_reversal_after_exit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.employment_status = 'offboarding'
       AND NEW.employment_status NOT IN ('offboarding', 'exited') THEN
        IF EXISTS (
            SELECT 1 FROM exit_interviews
            WHERE user_id = NEW.id
              AND status IN ('submitted', 'reviewed', 'archived')
        ) THEN
            RAISE EXCEPTION 'Nie można cofnąć statusu offboarding — istnieje wypełniony exit interview. Skontaktuj się z TCM.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ─── 4. lifecycle_notes — private notes TCM ──────────────────────────────
CREATE TABLE IF NOT EXISTS lifecycle_notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    author_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
    category        TEXT NOT NULL DEFAULT 'general' CHECK (category IN (
        'general', 'onboarding', 'exit', 'flag'
    )),
    content         TEXT NOT NULL CHECK (length(content) > 0),
    is_private      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_notes_user
    ON lifecycle_notes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lifecycle_notes_flags
    ON lifecycle_notes(category)
    WHERE category = 'flag';

DROP TRIGGER IF EXISTS lifecycle_notes_updated_at ON lifecycle_notes;
CREATE TRIGGER lifecycle_notes_updated_at BEFORE UPDATE ON lifecycle_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE lifecycle_notes IS
    'Phase 22f. Private TCM notes per pracownik. is_private=TRUE → tylko TCM/admin widzą. FALSE → widzą też pracownik+manager.';

ALTER TABLE lifecycle_notes ENABLE ROW LEVEL SECURITY;

-- TCM/admin: pełen access
DROP POLICY IF EXISTS "lifecycle_notes_all_tcm_admin" ON lifecycle_notes;
CREATE POLICY "lifecycle_notes_all_tcm_admin" ON lifecycle_notes
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

-- Owner: widzi non-private notes o sobie
DROP POLICY IF EXISTS "lifecycle_notes_select_owner_public" ON lifecycle_notes;
CREATE POLICY "lifecycle_notes_select_owner_public" ON lifecycle_notes
    FOR SELECT TO authenticated
    USING (
        is_private = FALSE
        AND auth.uid() = user_id
    );

-- Manager: widzi non-private notes o swoich team-membersach
DROP POLICY IF EXISTS "lifecycle_notes_select_manager_public" ON lifecycle_notes;
CREATE POLICY "lifecycle_notes_select_manager_public" ON lifecycle_notes
    FOR SELECT TO authenticated
    USING (
        is_private = FALSE
        AND is_manager_of(user_id)
    );

-- ─── 5. Audit log (komentarz tylko, action jest TEXT) ────────────────────
-- New actions w Phase 22f:
--   ONBOARDING_CANCELLED, ONBOARDING_RESTARTED
--   EXIT_INTERVIEW_CANCELLED
--   LIFECYCLE_PROFILE_UPDATED
--   EXTERNAL_EMPLOYEE_CREATED
--   LIFECYCLE_NOTE_ADDED, LIFECYCLE_NOTE_DELETED
--   TEMPLATE_DUPLICATED

COMMIT;
