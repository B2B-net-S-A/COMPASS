-- ============================================================
-- Phase 22b — Onboarding tables (templates, items, progress, tasks)
-- Date: 2026-05-17
--
-- Depends on:
--   - 20260517000001_phase22a_profile_lifecycle_columns.sql (employment_status, hired_at)
--
-- Schema overview:
--   onboarding_templates       — named template per role (e.g. "Konsultant IT — Standard")
--   onboarding_template_items  — checklist items in the template (ordered by position)
--   onboarding_progress        — one row per employee per onboarding run (UNIQUE user_id)
--   onboarding_tasks           — concrete tasks copied from template_items on start
--
-- Workflow:
--   1. TCM creates template per role (Phase 22e seeds 3 defaults)
--   2. InviteUserDialog or TCM action calls start_onboarding_for_user(user_id)
--      → creates onboarding_progress + copies template_items → onboarding_tasks
--      → sets profiles.employment_status = 'onboarding'
--   3. Employee/manager/buddy/TCM complete tasks (upload files if required)
--   4. Mini check-ins at day 1, 7, 30 (score 1-5 + note)
--   5. completeOnboarding() — all required tasks done → status='active'
-- ============================================================

BEGIN;

-- ─── 1. onboarding_templates ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    target_role     TEXT NOT NULL CHECK (target_role IN (
        'consultant', 'internal', 'finanse', 'manager', 'talent_community'
    )),
    description     TEXT,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
    created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one default template per role (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_onboarding_templates_default_per_role
    ON onboarding_templates(target_role)
    WHERE is_default = TRUE AND is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_onboarding_templates_target_role
    ON onboarding_templates(target_role)
    WHERE is_archived = FALSE;

DROP TRIGGER IF EXISTS onboarding_templates_updated_at ON onboarding_templates;
CREATE TRIGGER onboarding_templates_updated_at BEFORE UPDATE ON onboarding_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE onboarding_templates IS
    'Phase 22. Reusable onboarding checklists per role. TCM/admin CRUD; one is_default per role used by auto-start.';

-- ─── 2. onboarding_template_items ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_template_items (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id        UUID NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
    position           INTEGER NOT NULL,
    category           TEXT NOT NULL CHECK (category IN (
        'docs', 'access', 'training', 'meeting', 'equipment', 'other'
    )),
    title              TEXT NOT NULL,
    description        TEXT,
    due_offset_days    INTEGER NOT NULL DEFAULT 7 CHECK (due_offset_days >= 0),
    requires_file      BOOLEAN NOT NULL DEFAULT FALSE,
    course_slug        TEXT,
    responsible_role   TEXT NOT NULL DEFAULT 'employee' CHECK (responsible_role IN (
        'employee', 'manager', 'buddy', 'tcm', 'admin'
    )),
    is_required        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_template_items_template
    ON onboarding_template_items(template_id, position);

COMMENT ON TABLE onboarding_template_items IS
    'Phase 22. Ordered checklist items within an onboarding template. course_slug links to /learning/{slug} (Akademia).';
COMMENT ON COLUMN onboarding_template_items.due_offset_days IS
    'Days after hired_at the task is due. Used to compute onboarding_tasks.due_date on auto-generation.';
COMMENT ON COLUMN onboarding_template_items.responsible_role IS
    'Who is expected to complete: employee (self), manager, buddy, tcm, admin. Drives sidebar badge counts and email reminders.';

-- ─── 3. onboarding_progress ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_progress (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    template_id             UUID NOT NULL REFERENCES onboarding_templates(id) ON DELETE RESTRICT,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ,
    -- Day 1 check-in (employee fills mini-survey)
    checkin_day1_at         TIMESTAMPTZ,
    checkin_day1_score      INTEGER CHECK (checkin_day1_score IS NULL OR (checkin_day1_score BETWEEN 1 AND 5)),
    checkin_day1_note       TEXT,
    -- Day 7 check-in
    checkin_day7_at         TIMESTAMPTZ,
    checkin_day7_score      INTEGER CHECK (checkin_day7_score IS NULL OR (checkin_day7_score BETWEEN 1 AND 5)),
    checkin_day7_note       TEXT,
    -- Day 30 check-in
    checkin_day30_at        TIMESTAMPTZ,
    checkin_day30_score     INTEGER CHECK (checkin_day30_score IS NULL OR (checkin_day30_score BETWEEN 1 AND 5)),
    checkin_day30_note      TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_progress_active
    ON onboarding_progress(user_id)
    WHERE completed_at IS NULL;

DROP TRIGGER IF EXISTS onboarding_progress_updated_at ON onboarding_progress;
CREATE TRIGGER onboarding_progress_updated_at BEFORE UPDATE ON onboarding_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE onboarding_progress IS
    'Phase 22. One onboarding run per employee (UNIQUE user_id). Check-in fields filled by employee at day 1/7/30 via mini-survey.';

-- ─── 4. onboarding_tasks ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_tasks (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    progress_id        UUID NOT NULL REFERENCES onboarding_progress(id) ON DELETE CASCADE,
    template_item_id   UUID REFERENCES onboarding_template_items(id) ON DELETE SET NULL,
    title              TEXT NOT NULL,
    description        TEXT,
    category           TEXT NOT NULL CHECK (category IN (
        'docs', 'access', 'training', 'meeting', 'equipment', 'other'
    )),
    course_slug        TEXT,
    responsible_role   TEXT NOT NULL DEFAULT 'employee' CHECK (responsible_role IN (
        'employee', 'manager', 'buddy', 'tcm', 'admin'
    )),
    is_required        BOOLEAN NOT NULL DEFAULT TRUE,
    requires_file      BOOLEAN NOT NULL DEFAULT FALSE,
    due_date           DATE,
    completed_at       TIMESTAMPTZ,
    completed_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
    file_path          TEXT,
    file_hash          TEXT,
    notes              TEXT,
    position           INTEGER NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_progress
    ON onboarding_tasks(progress_id, position);

CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_overdue
    ON onboarding_tasks(due_date)
    WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_responsible
    ON onboarding_tasks(responsible_role)
    WHERE completed_at IS NULL;

DROP TRIGGER IF EXISTS onboarding_tasks_updated_at ON onboarding_tasks;
CREATE TRIGGER onboarding_tasks_updated_at BEFORE UPDATE ON onboarding_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE onboarding_tasks IS
    'Phase 22. Concrete tasks for one onboarding run, copied from template_items at start. Can be ad-hoc (template_item_id IS NULL) added by TCM/manager.';
COMMENT ON COLUMN onboarding_tasks.file_path IS
    'Path in lifecycle-docs storage bucket: onboarding/{user_id}/{ts}_{filename}.';

-- ─── 5. Trigger: enforce_onboarding_task_completion ───────────────────────
-- Block marking a task complete if it requires a file but none provided.
CREATE OR REPLACE FUNCTION enforce_onboarding_task_completion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Only check on completion event (transition NULL → NOT NULL on completed_at)
    IF OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL THEN
        IF NEW.requires_file AND (NEW.file_path IS NULL OR NEW.file_path = '') THEN
            RAISE EXCEPTION 'Task wymaga pliku — wgraj dokument przed oznaczeniem jako wykonane.'
                USING ERRCODE = 'P0001';
        END IF;
        IF NEW.completed_by IS NULL THEN
            RAISE EXCEPTION 'completed_by jest wymagane przy oznaczaniu zadania jako wykonane.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_task_completion ON onboarding_tasks;
CREATE TRIGGER trg_onboarding_task_completion
    BEFORE UPDATE OF completed_at, file_path, completed_by
    ON onboarding_tasks
    FOR EACH ROW EXECUTE FUNCTION enforce_onboarding_task_completion();

COMMIT;
