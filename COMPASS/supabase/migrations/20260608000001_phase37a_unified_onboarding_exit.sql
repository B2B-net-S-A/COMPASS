-- ============================================================
-- Phase 36a — Unified onboarding/exit "cases" (employees + contractors)
-- Date: 2026-06-04
--
-- Goal: one module for onboarding/exit of BOTH internal employees and external
-- contractors, differing only by the documents/forms. This is the EXPAND step of
-- an expand-contract migration:
--   * Create unified onboarding_cases + exit_cases (person_type discriminator).
--   * Backfill from the 4 legacy tables, PRESERVING ids (so onboarding_tasks.progress_id
--     and exit_interview_attachments.interview_id keep matching — no FK repoint needed).
--   * Legacy tables are LEFT UNTOUCHED (no DROP/rename) → existing code keeps working,
--     full rollback. The CONTRACT step (rename *_legacy, drop dead code) is a LATER migration
--     after the app cutover is verified.
--
-- Person ref is polymorphic (no SQL FK): person_type='employee' → profiles.id,
-- 'contractor' → contractors.id. Validity guaranteed by backfill + server actions.
--
-- Transition/anonymization triggers enforce on UPDATE only (NOT on INSERT) so the
-- backfill can insert historical rows in any status. Anonymization (GDPR) applies to
-- employee exits only (is_anonymous).
-- ============================================================

BEGIN;

-- ─── 1. onboarding_cases ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_cases (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_type             TEXT NOT NULL CHECK (person_type IN ('employee', 'contractor')),
    person_id               UUID NOT NULL,              -- employee→profiles.id | contractor→contractors.id
    status                  TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
        'scheduled', 'active', 'submitted', 'reviewed', 'completed', 'archived', 'cancelled'
    )),
    owner_id                UUID REFERENCES profiles(id) ON DELETE SET NULL,
    -- Employee onboarding (template-driven checklist; tasks live in onboarding_tasks keyed by id)
    template_id             UUID REFERENCES onboarding_templates(id) ON DELETE RESTRICT,
    checkin_day1_at         TIMESTAMPTZ,
    checkin_day1_score      INTEGER CHECK (checkin_day1_score IS NULL OR checkin_day1_score BETWEEN 1 AND 5),
    checkin_day1_note       TEXT,
    checkin_day7_at         TIMESTAMPTZ,
    checkin_day7_score      INTEGER CHECK (checkin_day7_score IS NULL OR checkin_day7_score BETWEEN 1 AND 5),
    checkin_day7_note       TEXT,
    checkin_day30_at        TIMESTAMPTZ,
    checkin_day30_score     INTEGER CHECK (checkin_day30_score IS NULL OR checkin_day30_score BETWEEN 1 AND 5),
    checkin_day30_note      TEXT,
    -- Contractor onboarding (single-form interview; freeform fields kept as JSONB "document")
    placement_id            UUID,
    position_snapshot       TEXT,
    client_snapshot         TEXT,
    start_date              DATE,
    interview               JSONB NOT NULL DEFAULT '{}'::jsonb,
    attachments             JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Shared workflow
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    scheduled_for           DATE,
    submitted_at            TIMESTAMPTZ,
    reviewed_by             UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at             TIMESTAMPTZ,
    reviewer_note           TEXT,
    cancelled_at            TIMESTAMPTZ,
    cancelled_by            UUID REFERENCES profiles(id) ON DELETE SET NULL,
    cancelled_reason        TEXT,
    created_by              UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active onboarding per employee (mirrors onboarding_progress UNIQUE user_id, scoped to active runs).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_onboarding_cases_employee_active
    ON onboarding_cases(person_id)
    WHERE person_type = 'employee' AND status NOT IN ('completed', 'archived', 'cancelled');
CREATE INDEX IF NOT EXISTS idx_onboarding_cases_person ON onboarding_cases(person_type, person_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_cases_status ON onboarding_cases(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_cases_active ON onboarding_cases(person_id) WHERE completed_at IS NULL;

-- NOTE (read-model): no transition/updated_at triggers on the mirror — the legacy
-- source-of-truth tables enforce transitions/anonymization; sync triggers (36c) copy the
-- result verbatim, including updated_at, so a mirror trigger would clobber it.

COMMENT ON TABLE onboarding_cases IS
    'Phase 36. Unified onboarding (employee + contractor). person_type discriminator; person_id polymorphic (profiles|contractors). Employee uses template_id + onboarding_tasks + check-ins; contractor uses interview JSONB. Backfilled id-preserving from onboarding_progress + contractor_onboarding_interviews.';

-- ─── 2. exit_cases ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exit_cases (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_type                 TEXT NOT NULL CHECK (person_type IN ('employee', 'contractor')),
    person_id                   UUID,                   -- nullable: employee anonymized exits set NULL
    is_anonymous                BOOLEAN NOT NULL DEFAULT FALSE,
    -- Employee structured survey (analytics + anonymization need these as columns)
    role_snapshot               TEXT,
    manager_snapshot            UUID REFERENCES profiles(id) ON DELETE SET NULL,
    department_snapshot         TEXT,
    tenure_months               INTEGER CHECK (tenure_months IS NULL OR tenure_months >= 0),
    exit_reason                 TEXT CHECK (exit_reason IS NULL OR exit_reason IN (
        'new_opportunity', 'compensation', 'role_misfit', 'management',
        'work_life_balance', 'career_growth', 'personal', 'other'
    )),
    exit_reason_detail          TEXT,
    nps_score                   INTEGER CHECK (nps_score IS NULL OR nps_score BETWEEN 0 AND 10),
    satisfaction_team           INTEGER CHECK (satisfaction_team IS NULL OR satisfaction_team BETWEEN 1 AND 5),
    satisfaction_manager        INTEGER CHECK (satisfaction_manager IS NULL OR satisfaction_manager BETWEEN 1 AND 5),
    satisfaction_projects       INTEGER CHECK (satisfaction_projects IS NULL OR satisfaction_projects BETWEEN 1 AND 5),
    would_recommend             BOOLEAN,
    what_worked                 TEXT,
    what_to_improve             TEXT,
    knowledge_transfer_notes    TEXT,
    -- Contractor exit (freeform "document")
    placement_id                UUID,
    position_snapshot           TEXT,
    client_snapshot             TEXT,
    start_date                  DATE,
    end_date                    DATE,
    contractor_form             JSONB NOT NULL DEFAULT '{}'::jsonb,   -- formal_reason, causes, repair_potential, is_final, retain/extend, feedback_lessons…
    attachments                 JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Shared workflow
    status                      TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
        'scheduled', 'submitted', 'reviewed', 'archived', 'cancelled'
    )),
    scheduled_for               DATE,
    submitted_at                TIMESTAMPTZ,
    reviewed_by                 UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at                 TIMESTAMPTZ,
    reviewer_note               TEXT,
    cancelled_at                TIMESTAMPTZ,
    cancelled_by                UUID REFERENCES profiles(id) ON DELETE SET NULL,
    cancelled_reason            TEXT,
    created_by                  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exit_cases_person ON exit_cases(person_type, person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exit_cases_status ON exit_cases(status);
CREATE INDEX IF NOT EXISTS idx_exit_cases_pending_review ON exit_cases(status) WHERE status = 'submitted';
CREATE INDEX IF NOT EXISTS idx_exit_cases_analytics
    ON exit_cases(submitted_at, exit_reason, nps_score)
    WHERE status IN ('submitted', 'reviewed', 'archived');

-- (read-model) no mirror triggers — see note above.

COMMENT ON TABLE exit_cases IS
    'Phase 36. Unified exit (employee + contractor). Employee structured survey columns (+ GDPR anonymization → person_id NULL). Contractor freeform in contractor_form JSONB. Backfilled id-preserving from exit_interviews + contractor_exit_interviews.';

-- ─── 3. Backfill (BEFORE strict transition triggers; id-preserving) ───────────
-- Employees: onboarding_progress → onboarding_cases.
INSERT INTO onboarding_cases (
    id, person_type, person_id, status, template_id,
    checkin_day1_at, checkin_day1_score, checkin_day1_note,
    checkin_day7_at, checkin_day7_score, checkin_day7_note,
    checkin_day30_at, checkin_day30_score, checkin_day30_note,
    started_at, completed_at, cancelled_at, cancelled_by, cancelled_reason,
    created_at, updated_at
)
SELECT
    p.id, 'employee', p.user_id,
    CASE
        WHEN p.cancelled_at IS NOT NULL THEN 'cancelled'
        WHEN p.completed_at IS NOT NULL THEN 'completed'
        ELSE 'active'
    END,
    p.template_id,
    p.checkin_day1_at, p.checkin_day1_score, p.checkin_day1_note,
    p.checkin_day7_at, p.checkin_day7_score, p.checkin_day7_note,
    p.checkin_day30_at, p.checkin_day30_score, p.checkin_day30_note,
    p.started_at, p.completed_at, p.cancelled_at, p.cancelled_by, p.cancelled_reason,
    p.created_at, p.updated_at
FROM onboarding_progress p
ON CONFLICT (id) DO NOTHING;

-- Contractors: contractor_onboarding_interviews → onboarding_cases (freeform → interview JSONB).
INSERT INTO onboarding_cases (
    id, person_type, person_id, status, placement_id,
    position_snapshot, client_snapshot, start_date,
    scheduled_for, submitted_at, reviewed_by, reviewed_at, reviewer_note,
    interview, attachments, created_by, created_at, updated_at
)
SELECT
    i.id, 'contractor', i.contractor_id,
    CASE WHEN i.status IN ('scheduled','submitted','reviewed','archived','cancelled') THEN i.status ELSE 'scheduled' END,
    i.placement_id, i.position_snapshot, i.client_snapshot, i.start_date,
    i.scheduled_for, i.submitted_at, i.reviewed_by, i.reviewed_at, i.reviewer_note,
    jsonb_strip_nulls(jsonb_build_object(
        'tcm_role_note', i.tcm_role_note, 'first_day_note', i.first_day_note,
        'client_manager_name', i.client_manager_name, 'equipment_note', i.equipment_note,
        'system_access_note', i.system_access_note, 'duties_note', i.duties_note,
        'work_note', i.work_note, 'manager_relation_note', i.manager_relation_note,
        'missing_resolved_note', i.missing_resolved_note, 'positive_surprise', i.positive_surprise,
        'negative_surprise', i.negative_surprise, 'doubts_note', i.doubts_note,
        'side_projects_interest', i.side_projects_interest,
        'cs_challenge', i.cs_challenge, 'cs_solution', i.cs_solution,
        'cs_technologies', i.cs_technologies, 'cs_client', i.cs_client, 'cs_sector', i.cs_sector
    )),
    COALESCE(i.attachments, '[]'::jsonb), i.created_by, i.created_at, i.updated_at
FROM contractor_onboarding_interviews i
ON CONFLICT (id) DO NOTHING;

-- Employees: exit_interviews → exit_cases.
INSERT INTO exit_cases (
    id, person_type, person_id, is_anonymous,
    role_snapshot, manager_snapshot, department_snapshot, tenure_months,
    exit_reason, exit_reason_detail, nps_score,
    satisfaction_team, satisfaction_manager, satisfaction_projects, would_recommend,
    what_worked, what_to_improve, knowledge_transfer_notes,
    status, scheduled_for, submitted_at, reviewed_by, reviewed_at, reviewer_note,
    created_at, updated_at
)
SELECT
    e.id, 'employee', e.user_id, e.is_anonymous,
    e.role_snapshot, e.manager_snapshot, e.department_snapshot, e.tenure_months,
    e.exit_reason, e.exit_reason_detail, e.nps_score,
    e.satisfaction_team, e.satisfaction_manager, e.satisfaction_projects, e.would_recommend,
    e.what_worked, e.what_to_improve, e.knowledge_transfer_notes,
    e.status, e.scheduled_for, e.submitted_at, e.reviewed_by, e.reviewed_at, e.reviewer_note,
    e.created_at, e.updated_at
FROM exit_interviews e
ON CONFLICT (id) DO NOTHING;

-- Contractors: contractor_exit_interviews → exit_cases (freeform → contractor_form JSONB).
INSERT INTO exit_cases (
    id, person_type, person_id, placement_id,
    position_snapshot, client_snapshot, start_date, end_date,
    contractor_form, attachments,
    status, scheduled_for, submitted_at, reviewed_by, reviewed_at, reviewer_note,
    created_by, created_at, updated_at
)
SELECT
    x.id, 'contractor', x.contractor_id, x.placement_id,
    x.position_snapshot, x.client_snapshot, x.start_date, x.end_date,
    jsonb_strip_nulls(jsonb_build_object(
        'formal_reason', x.formal_reason, 'causes', x.causes,
        'repair_potential', x.repair_potential, 'is_final', x.is_final,
        'can_retain_transfer', x.can_retain_transfer, 'retain_transfer_note', x.retain_transfer_note,
        'can_extend_departure', x.can_extend_departure, 'extend_departure_note', x.extend_departure_note,
        'feedback_lessons', x.feedback_lessons
    )),
    COALESCE(x.attachments, '[]'::jsonb),
    CASE WHEN x.status IN ('scheduled','submitted','reviewed','archived','cancelled') THEN x.status ELSE 'scheduled' END,
    x.scheduled_for, x.submitted_at, x.reviewed_by, x.reviewed_at, x.reviewer_note,
    x.created_by, x.created_at, x.updated_at
FROM contractor_exit_interviews x
ON CONFLICT (id) DO NOTHING;

-- (read-model) Transition + anonymization enforcement lives on the legacy source tables
-- (onboarding_progress / exit_interviews + their phase22 triggers). The unified tables are a
-- synced mirror, so they carry NO transition triggers — sync (36c) copies the validated result.

-- ─── 4. RLS (mirrors phase22d, branched on person_type) ───────────────────────
ALTER TABLE onboarding_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_cases_select" ON onboarding_cases;
CREATE POLICY "onboarding_cases_select" ON onboarding_cases
    FOR SELECT TO authenticated
    USING (
        has_lifecycle_access()
        OR (person_type = 'employee' AND (
            auth.uid() = person_id OR is_manager_of(person_id) OR is_buddy_of(person_id)
        ))
    );

DROP POLICY IF EXISTS "onboarding_cases_write_tcm_or_admin" ON onboarding_cases;
CREATE POLICY "onboarding_cases_write_tcm_or_admin" ON onboarding_cases
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

DROP POLICY IF EXISTS "onboarding_cases_update_owner_checkin" ON onboarding_cases;
CREATE POLICY "onboarding_cases_update_owner_checkin" ON onboarding_cases
    FOR UPDATE TO authenticated
    USING (person_type = 'employee' AND auth.uid() = person_id)
    WITH CHECK (person_type = 'employee' AND auth.uid() = person_id);

DROP POLICY IF EXISTS "onboarding_cases_update_manager_team" ON onboarding_cases;
CREATE POLICY "onboarding_cases_update_manager_team" ON onboarding_cases
    FOR UPDATE TO authenticated
    USING (person_type = 'employee' AND is_manager_of(person_id))
    WITH CHECK (person_type = 'employee' AND is_manager_of(person_id));

ALTER TABLE exit_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exit_cases_select" ON exit_cases;
CREATE POLICY "exit_cases_select" ON exit_cases
    FOR SELECT TO authenticated
    USING (
        has_lifecycle_access()
        OR (person_type = 'employee' AND person_id IS NOT NULL AND person_id = auth.uid())
        OR (person_type = 'employee' AND is_anonymous = FALSE AND person_id IS NOT NULL AND is_manager_of(person_id))
    );

DROP POLICY IF EXISTS "exit_cases_insert" ON exit_cases;
CREATE POLICY "exit_cases_insert" ON exit_cases
    FOR INSERT TO authenticated
    WITH CHECK (
        has_lifecycle_access()
        OR (
            person_type = 'employee' AND person_id IS NOT NULL AND person_id = auth.uid()
            AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND employment_status = 'offboarding')
        )
    );

DROP POLICY IF EXISTS "exit_cases_update_owner_submit" ON exit_cases;
CREATE POLICY "exit_cases_update_owner_submit" ON exit_cases
    FOR UPDATE TO authenticated
    USING (person_type = 'employee' AND person_id IS NOT NULL AND person_id = auth.uid() AND status = 'scheduled')
    WITH CHECK (status = 'submitted');

DROP POLICY IF EXISTS "exit_cases_update_tcm_or_admin" ON exit_cases;
CREATE POLICY "exit_cases_update_tcm_or_admin" ON exit_cases
    FOR UPDATE TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

-- (read-model) block_employment_reversal_after_exit() stays UNCHANGED — legacy exit_interviews
-- remains source-of-truth, so the existing guard keeps firing. No change needed here.

COMMIT;
