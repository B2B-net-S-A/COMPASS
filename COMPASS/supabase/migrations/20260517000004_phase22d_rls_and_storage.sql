-- ============================================================
-- Phase 22d — RLS policies + storage bucket lifecycle-docs
-- Date: 2026-05-17
--
-- Depends on:
--   - 20260517000001_phase22a_profile_lifecycle_columns.sql (has_lifecycle_access, is_buddy_of)
--   - 20260517000002_phase22b_onboarding_tables.sql (4 onboarding tables)
--   - 20260517000003_phase22c_exit_interview_tables.sql (3 exit tables)
--
-- Storage layout for bucket 'lifecycle-docs' (private):
--   onboarding/{user_id}/{ts}_{filename}    — onboarding task attachments
--   exit/{user_id}/{ts}_{filename}          — exit interview attachments
-- ============================================================

BEGIN;

-- ─── 1. onboarding_templates / template_items RLS ─────────────────────────
ALTER TABLE onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_template_items ENABLE ROW LEVEL SECURITY;

-- SELECT: all HR-zone roles can view templates (employees see what their onboarding will look like)
DROP POLICY IF EXISTS "onboarding_templates_select_hr_zone" ON onboarding_templates;
CREATE POLICY "onboarding_templates_select_hr_zone" ON onboarding_templates
    FOR SELECT TO authenticated
    USING (has_hr_zone_access());

DROP POLICY IF EXISTS "onboarding_template_items_select_hr_zone" ON onboarding_template_items;
CREATE POLICY "onboarding_template_items_select_hr_zone" ON onboarding_template_items
    FOR SELECT TO authenticated
    USING (has_hr_zone_access());

-- INSERT/UPDATE/DELETE: only admin + TCM
DROP POLICY IF EXISTS "onboarding_templates_write_tcm_or_admin" ON onboarding_templates;
CREATE POLICY "onboarding_templates_write_tcm_or_admin" ON onboarding_templates
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

DROP POLICY IF EXISTS "onboarding_template_items_write_tcm_or_admin" ON onboarding_template_items;
CREATE POLICY "onboarding_template_items_write_tcm_or_admin" ON onboarding_template_items
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

-- ─── 2. onboarding_progress RLS ───────────────────────────────────────────
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;

-- SELECT: owner + manager_of + buddy + TCM/admin
DROP POLICY IF EXISTS "onboarding_progress_select" ON onboarding_progress;
CREATE POLICY "onboarding_progress_select" ON onboarding_progress
    FOR SELECT TO authenticated
    USING (
        auth.uid() = user_id
        OR is_manager_of(user_id)
        OR is_buddy_of(user_id)
        OR has_lifecycle_access()
    );

-- INSERT/DELETE: TCM/admin only (via server actions)
DROP POLICY IF EXISTS "onboarding_progress_insert_delete_tcm_or_admin" ON onboarding_progress;
CREATE POLICY "onboarding_progress_insert_delete_tcm_or_admin" ON onboarding_progress
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

-- UPDATE for check-ins: owner can update their own check-in fields
DROP POLICY IF EXISTS "onboarding_progress_update_owner_checkin" ON onboarding_progress;
CREATE POLICY "onboarding_progress_update_owner_checkin" ON onboarding_progress
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- UPDATE for managers: can update progress (e.g. completed_at) for their team
DROP POLICY IF EXISTS "onboarding_progress_update_manager_team" ON onboarding_progress;
CREATE POLICY "onboarding_progress_update_manager_team" ON onboarding_progress
    FOR UPDATE TO authenticated
    USING (is_manager_of(user_id))
    WITH CHECK (is_manager_of(user_id));

-- ─── 3. onboarding_tasks RLS ──────────────────────────────────────────────
ALTER TABLE onboarding_tasks ENABLE ROW LEVEL SECURITY;

-- SELECT: same as progress (owner + manager_of + buddy + TCM/admin)
DROP POLICY IF EXISTS "onboarding_tasks_select" ON onboarding_tasks;
CREATE POLICY "onboarding_tasks_select" ON onboarding_tasks
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM onboarding_progress p
            WHERE p.id = onboarding_tasks.progress_id
              AND (
                  auth.uid() = p.user_id
                  OR is_manager_of(p.user_id)
                  OR is_buddy_of(p.user_id)
                  OR has_lifecycle_access()
              )
        )
    );

-- INSERT/DELETE: TCM/admin (ad-hoc tasks added via action)
DROP POLICY IF EXISTS "onboarding_tasks_insert_delete_tcm_or_admin" ON onboarding_tasks;
CREATE POLICY "onboarding_tasks_insert_delete_tcm_or_admin" ON onboarding_tasks
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

-- UPDATE owner: can mark complete only if responsible_role='employee'
DROP POLICY IF EXISTS "onboarding_tasks_update_owner_employee_tasks" ON onboarding_tasks;
CREATE POLICY "onboarding_tasks_update_owner_employee_tasks" ON onboarding_tasks
    FOR UPDATE TO authenticated
    USING (
        responsible_role = 'employee'
        AND EXISTS (
            SELECT 1 FROM onboarding_progress p
            WHERE p.id = onboarding_tasks.progress_id
              AND p.user_id = auth.uid()
        )
    )
    WITH CHECK (
        responsible_role = 'employee'
        AND EXISTS (
            SELECT 1 FROM onboarding_progress p
            WHERE p.id = onboarding_tasks.progress_id
              AND p.user_id = auth.uid()
        )
    );

-- UPDATE manager: can mark complete tasks for their team where responsible_role='manager'
DROP POLICY IF EXISTS "onboarding_tasks_update_manager_team" ON onboarding_tasks;
CREATE POLICY "onboarding_tasks_update_manager_team" ON onboarding_tasks
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM onboarding_progress p
            WHERE p.id = onboarding_tasks.progress_id
              AND is_manager_of(p.user_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM onboarding_progress p
            WHERE p.id = onboarding_tasks.progress_id
              AND is_manager_of(p.user_id)
        )
    );

-- UPDATE buddy: can mark complete tasks where responsible_role='buddy'
DROP POLICY IF EXISTS "onboarding_tasks_update_buddy" ON onboarding_tasks;
CREATE POLICY "onboarding_tasks_update_buddy" ON onboarding_tasks
    FOR UPDATE TO authenticated
    USING (
        responsible_role = 'buddy'
        AND EXISTS (
            SELECT 1 FROM onboarding_progress p
            WHERE p.id = onboarding_tasks.progress_id
              AND is_buddy_of(p.user_id)
        )
    )
    WITH CHECK (
        responsible_role = 'buddy'
        AND EXISTS (
            SELECT 1 FROM onboarding_progress p
            WHERE p.id = onboarding_tasks.progress_id
              AND is_buddy_of(p.user_id)
        )
    );

-- UPDATE TCM/admin: can update any task (override)
DROP POLICY IF EXISTS "onboarding_tasks_update_tcm_or_admin" ON onboarding_tasks;
CREATE POLICY "onboarding_tasks_update_tcm_or_admin" ON onboarding_tasks
    FOR UPDATE TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

-- ─── 4. exit_interviews RLS ───────────────────────────────────────────────
ALTER TABLE exit_interviews ENABLE ROW LEVEL SECURITY;

-- SELECT: TCM/admin always; owner only when not anonymized + matches; manager_of only when not anonymous
DROP POLICY IF EXISTS "exit_interviews_select" ON exit_interviews;
CREATE POLICY "exit_interviews_select" ON exit_interviews
    FOR SELECT TO authenticated
    USING (
        has_lifecycle_access()
        OR (user_id IS NOT NULL AND user_id = auth.uid())
        OR (is_anonymous = FALSE AND user_id IS NOT NULL AND is_manager_of(user_id))
    );

-- INSERT: TCM/admin schedules; owner can also self-trigger when in offboarding (defensive)
DROP POLICY IF EXISTS "exit_interviews_insert_tcm_or_admin" ON exit_interviews;
CREATE POLICY "exit_interviews_insert_tcm_or_admin" ON exit_interviews
    FOR INSERT TO authenticated
    WITH CHECK (
        has_lifecycle_access()
        OR (
            user_id IS NOT NULL
            AND user_id = auth.uid()
            AND EXISTS (
                SELECT 1 FROM profiles
                WHERE id = auth.uid()
                  AND employment_status = 'offboarding'
            )
        )
    );

-- UPDATE: owner can fill (scheduled→submitted); TCM/admin can review (submitted→reviewed→archived)
DROP POLICY IF EXISTS "exit_interviews_update_owner_submit" ON exit_interviews;
CREATE POLICY "exit_interviews_update_owner_submit" ON exit_interviews
    FOR UPDATE TO authenticated
    USING (
        user_id IS NOT NULL
        AND user_id = auth.uid()
        AND status = 'scheduled'
    )
    WITH CHECK (
        -- After anonymization user_id will be NULL but trigger handles before check
        status = 'submitted'
    );

DROP POLICY IF EXISTS "exit_interviews_update_tcm_or_admin" ON exit_interviews;
CREATE POLICY "exit_interviews_update_tcm_or_admin" ON exit_interviews
    FOR UPDATE TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

-- ─── 5. exit_interview_attachments RLS ────────────────────────────────────
ALTER TABLE exit_interview_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exit_interview_attachments_select" ON exit_interview_attachments;
CREATE POLICY "exit_interview_attachments_select" ON exit_interview_attachments
    FOR SELECT TO authenticated
    USING (
        has_lifecycle_access()
        OR EXISTS (
            SELECT 1 FROM exit_interviews ei
            WHERE ei.id = exit_interview_attachments.interview_id
              AND ei.user_id IS NOT NULL
              AND ei.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "exit_interview_attachments_insert" ON exit_interview_attachments;
CREATE POLICY "exit_interview_attachments_insert" ON exit_interview_attachments
    FOR INSERT TO authenticated
    WITH CHECK (
        has_lifecycle_access()
        OR EXISTS (
            SELECT 1 FROM exit_interviews ei
            WHERE ei.id = exit_interview_attachments.interview_id
              AND ei.user_id IS NOT NULL
              AND ei.user_id = auth.uid()
              AND ei.status = 'scheduled'
        )
    );

DROP POLICY IF EXISTS "exit_interview_attachments_delete_tcm_or_admin" ON exit_interview_attachments;
CREATE POLICY "exit_interview_attachments_delete_tcm_or_admin" ON exit_interview_attachments
    FOR DELETE TO authenticated
    USING (has_lifecycle_access());

-- ─── 6. offboarding_tasks RLS ─────────────────────────────────────────────
ALTER TABLE offboarding_tasks ENABLE ROW LEVEL SECURITY;

-- SELECT: owner + manager_of + TCM/admin + finanse (for final_settlement category)
DROP POLICY IF EXISTS "offboarding_tasks_select" ON offboarding_tasks;
CREATE POLICY "offboarding_tasks_select" ON offboarding_tasks
    FOR SELECT TO authenticated
    USING (
        auth.uid() = user_id
        OR is_manager_of(user_id)
        OR has_lifecycle_access()
        OR is_finanse_or_admin()
    );

-- INSERT/DELETE: TCM/admin only
DROP POLICY IF EXISTS "offboarding_tasks_insert_delete_tcm_or_admin" ON offboarding_tasks;
CREATE POLICY "offboarding_tasks_insert_delete_tcm_or_admin" ON offboarding_tasks
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

-- UPDATE: per responsible_role like onboarding
DROP POLICY IF EXISTS "offboarding_tasks_update_owner_employee" ON offboarding_tasks;
CREATE POLICY "offboarding_tasks_update_owner_employee" ON offboarding_tasks
    FOR UPDATE TO authenticated
    USING (responsible_role = 'employee' AND auth.uid() = user_id)
    WITH CHECK (responsible_role = 'employee' AND auth.uid() = user_id);

DROP POLICY IF EXISTS "offboarding_tasks_update_manager_team" ON offboarding_tasks;
CREATE POLICY "offboarding_tasks_update_manager_team" ON offboarding_tasks
    FOR UPDATE TO authenticated
    USING (is_manager_of(user_id))
    WITH CHECK (is_manager_of(user_id));

DROP POLICY IF EXISTS "offboarding_tasks_update_finanse_settlement" ON offboarding_tasks;
CREATE POLICY "offboarding_tasks_update_finanse_settlement" ON offboarding_tasks
    FOR UPDATE TO authenticated
    USING (category = 'final_settlement' AND is_finanse_or_admin())
    WITH CHECK (category = 'final_settlement' AND is_finanse_or_admin());

DROP POLICY IF EXISTS "offboarding_tasks_update_tcm_or_admin" ON offboarding_tasks;
CREATE POLICY "offboarding_tasks_update_tcm_or_admin" ON offboarding_tasks
    FOR UPDATE TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

-- ─── 7. Storage bucket: lifecycle-docs (private) ──────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('lifecycle-docs', 'lifecycle-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Folder pattern:
--   onboarding/{user_id}/{ts}_{filename}
--   exit/{user_id}/{ts}_{filename}
-- storage.foldername(name) returns array → [1]='onboarding'|'exit', [2]=user_id.

DROP POLICY IF EXISTS "lifecycle_docs_select_owner_or_lifecycle" ON storage.objects;
CREATE POLICY "lifecycle_docs_select_owner_or_lifecycle" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'lifecycle-docs'
        AND (
            auth.uid()::text = (storage.foldername(name))[2]
            OR has_lifecycle_access()
            OR (
                -- Manager of the user can access their team's onboarding docs
                (storage.foldername(name))[1] = 'onboarding'
                AND EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id::text = (storage.foldername(name))[2]
                      AND is_manager_of(p.id)
                )
            )
        )
    );

DROP POLICY IF EXISTS "lifecycle_docs_insert_own" ON storage.objects;
CREATE POLICY "lifecycle_docs_insert_own" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'lifecycle-docs'
        AND (
            auth.uid()::text = (storage.foldername(name))[2]
            OR has_lifecycle_access()
        )
    );

DROP POLICY IF EXISTS "lifecycle_docs_update_own" ON storage.objects;
CREATE POLICY "lifecycle_docs_update_own" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'lifecycle-docs'
        AND (
            auth.uid()::text = (storage.foldername(name))[2]
            OR has_lifecycle_access()
        )
    );

DROP POLICY IF EXISTS "lifecycle_docs_delete_tcm_or_admin" ON storage.objects;
CREATE POLICY "lifecycle_docs_delete_tcm_or_admin" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'lifecycle-docs'
        AND has_lifecycle_access()
    );

COMMIT;
