-- ============================================================
-- Phase 22c — Exit interview + offboarding tasks + state machine
-- Date: 2026-05-17
--
-- Depends on:
--   - 20260517000001_phase22a_profile_lifecycle_columns.sql (employment_status, termination_date)
--
-- Tables:
--   exit_interviews            — structured exit survey (NPS + 4 satisfaction scales + reason + free-text)
--                                Snapshot fields preserved even after anonymization.
--   exit_interview_attachments — files in lifecycle-docs/exit/{user_id}/ (knowledge transfer docs)
--   offboarding_tasks          — analog of onboarding_tasks for the exit checklist
--
-- Workflow:
--   scheduled → submitted (employee fills form, optionally is_anonymous=TRUE)
--   submitted → reviewed (TCM closes with note)
--   reviewed → archived
--
-- Anonymization: trigger sets user_id=NULL on transition scheduled→submitted
-- if is_anonymous=TRUE. Snapshot fields (role/manager/tenure) remain intact.
-- ============================================================

BEGIN;

-- ─── 1. exit_interviews ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exit_interviews (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    is_anonymous                BOOLEAN NOT NULL DEFAULT FALSE,
    -- Snapshot fields (preserved after anonymization)
    role_snapshot               TEXT NOT NULL,
    manager_snapshot            UUID REFERENCES profiles(id) ON DELETE SET NULL,
    department_snapshot         TEXT,
    tenure_months               INTEGER CHECK (tenure_months IS NULL OR tenure_months >= 0),
    -- Survey answers
    exit_reason                 TEXT CHECK (exit_reason IS NULL OR exit_reason IN (
        'new_opportunity', 'compensation', 'role_misfit', 'management',
        'work_life_balance', 'career_growth', 'personal', 'other'
    )),
    exit_reason_detail          TEXT,
    nps_score                   INTEGER CHECK (nps_score IS NULL OR (nps_score BETWEEN 0 AND 10)),
    satisfaction_team           INTEGER CHECK (satisfaction_team IS NULL OR (satisfaction_team BETWEEN 1 AND 5)),
    satisfaction_manager        INTEGER CHECK (satisfaction_manager IS NULL OR (satisfaction_manager BETWEEN 1 AND 5)),
    satisfaction_projects       INTEGER CHECK (satisfaction_projects IS NULL OR (satisfaction_projects BETWEEN 1 AND 5)),
    would_recommend             BOOLEAN,
    what_worked                 TEXT,
    what_to_improve             TEXT,
    knowledge_transfer_notes    TEXT,
    -- Workflow
    status                      TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
        'scheduled', 'submitted', 'reviewed', 'archived'
    )),
    scheduled_for               DATE,
    submitted_at                TIMESTAMPTZ,
    reviewed_by                 UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at                 TIMESTAMPTZ,
    reviewer_note               TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exit_interviews_status
    ON exit_interviews(status);

CREATE INDEX IF NOT EXISTS idx_exit_interviews_user
    ON exit_interviews(user_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exit_interviews_pending_review
    ON exit_interviews(status)
    WHERE status = 'submitted';

CREATE INDEX IF NOT EXISTS idx_exit_interviews_analytics
    ON exit_interviews(submitted_at, exit_reason, nps_score)
    WHERE status IN ('submitted', 'reviewed', 'archived');

DROP TRIGGER IF EXISTS exit_interviews_updated_at ON exit_interviews;
CREATE TRIGGER exit_interviews_updated_at BEFORE UPDATE ON exit_interviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE exit_interviews IS
    'Phase 22. Structured exit survey. user_id NULL means anonymized (is_anonymous=TRUE). Snapshot fields preserved for aggregate analytics.';
COMMENT ON COLUMN exit_interviews.is_anonymous IS
    'Phase 22. If true on submit, trigger sets user_id=NULL but preserves role_snapshot/department_snapshot/manager_snapshot/tenure_months.';

-- ─── 2. Trigger: state machine + anonymization ────────────────────────────
CREATE OR REPLACE FUNCTION enforce_exit_interview_transitions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- INSERT: must start in 'scheduled'.
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

    -- UPDATE without status change → allowed (e.g., editing scheduled_for).
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Allowed transitions:
    --   scheduled → submitted   (employee fills survey)
    --   submitted → reviewed    (TCM reviews + notes)
    --   reviewed → archived
    --   submitted → archived    (skip-review path; admin only — enforced in app)

    IF OLD.status = 'scheduled' AND NEW.status = 'submitted' THEN
        IF NEW.submitted_at IS NULL THEN
            NEW.submitted_at := NOW();
        END IF;
        IF NEW.exit_reason IS NULL OR NEW.nps_score IS NULL THEN
            RAISE EXCEPTION 'Submit wymaga: exit_reason oraz nps_score.'
                USING ERRCODE = 'P0001';
        END IF;
        -- ANONYMIZATION: if is_anonymous=TRUE, null out user_id BUT keep snapshot fields.
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

    IF NEW.status = 'archived' AND OLD.status IN ('reviewed', 'submitted') THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid exit_interview status transition: % → %', OLD.status, NEW.status
        USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_exit_interview_transitions ON exit_interviews;
CREATE TRIGGER trg_exit_interview_transitions
    BEFORE INSERT OR UPDATE
    ON exit_interviews
    FOR EACH ROW EXECUTE FUNCTION enforce_exit_interview_transitions();

-- ─── 3. Block reversal: cannot move profile from offboarding → active ─────
-- if a submitted/reviewed exit interview exists.
CREATE OR REPLACE FUNCTION block_employment_reversal_after_exit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.employment_status = 'offboarding'
       AND NEW.employment_status NOT IN ('offboarding', 'exited') THEN
        IF EXISTS (
            SELECT 1 FROM exit_interviews
            WHERE (user_id = NEW.id OR manager_snapshot IS NOT NULL)
              AND status IN ('submitted', 'reviewed', 'archived')
              AND (user_id = NEW.id OR (is_anonymous = TRUE AND created_at > NEW.updated_at - INTERVAL '90 days'))
        ) THEN
            RAISE EXCEPTION 'Nie można cofnąć statusu offboarding — istnieje wypełniony exit interview. Skontaktuj się z TCM.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_offboarding_reversal ON profiles;
CREATE TRIGGER trg_profile_offboarding_reversal
    BEFORE UPDATE OF employment_status
    ON profiles
    FOR EACH ROW EXECUTE FUNCTION block_employment_reversal_after_exit();

-- ─── 4. exit_interview_attachments ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exit_interview_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id    UUID NOT NULL REFERENCES exit_interviews(id) ON DELETE CASCADE,
    file_path       TEXT NOT NULL,
    file_name       TEXT NOT NULL,
    file_size       INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 26214400), -- 25 MB
    file_hash       TEXT,
    uploaded_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exit_interview_attachments_interview
    ON exit_interview_attachments(interview_id);

COMMENT ON TABLE exit_interview_attachments IS
    'Phase 22. Files uploaded with an exit interview (knowledge transfer docs). Path: lifecycle-docs/exit/{user_id}/{ts}_{file}.';

-- ─── 5. offboarding_tasks ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offboarding_tasks (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    category           TEXT NOT NULL CHECK (category IN (
        'access_revoke', 'equipment_return', 'final_settlement',
        'docs_archive', 'knowledge_transfer', 'other'
    )),
    title              TEXT NOT NULL,
    description        TEXT,
    responsible_role   TEXT NOT NULL DEFAULT 'manager' CHECK (responsible_role IN (
        'employee', 'manager', 'tcm', 'admin', 'finanse'
    )),
    is_required        BOOLEAN NOT NULL DEFAULT TRUE,
    due_date           DATE,
    completed_at       TIMESTAMPTZ,
    completed_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notes              TEXT,
    position           INTEGER NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offboarding_tasks_user
    ON offboarding_tasks(user_id, position);

CREATE INDEX IF NOT EXISTS idx_offboarding_tasks_overdue
    ON offboarding_tasks(due_date)
    WHERE completed_at IS NULL;

DROP TRIGGER IF EXISTS offboarding_tasks_updated_at ON offboarding_tasks;
CREATE TRIGGER offboarding_tasks_updated_at BEFORE UPDATE ON offboarding_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE offboarding_tasks IS
    'Phase 22. Checklist tasks for exiting employee — access revoke, equipment return, knowledge transfer, etc.';

-- ─── 6. Trigger: enforce offboarding task completion ──────────────────────
CREATE OR REPLACE FUNCTION enforce_offboarding_task_completion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL THEN
        IF NEW.completed_by IS NULL THEN
            RAISE EXCEPTION 'completed_by jest wymagane przy oznaczaniu offboarding tasku jako wykonanego.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offboarding_task_completion ON offboarding_tasks;
CREATE TRIGGER trg_offboarding_task_completion
    BEFORE UPDATE OF completed_at, completed_by
    ON offboarding_tasks
    FOR EACH ROW EXECUTE FUNCTION enforce_offboarding_task_completion();

COMMIT;
