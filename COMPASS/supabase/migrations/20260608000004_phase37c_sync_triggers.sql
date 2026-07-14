-- ============================================================
-- Phase 36c — Sync triggers: legacy source-of-truth → unified read-model mirror
-- Date: 2026-06-04
--
-- Architecture: the legacy tables (onboarding_progress, exit_interviews,
-- contractor_onboarding_interviews, contractor_exit_interviews, contractor_conversations,
-- contractor_tasks) remain the SOURCE OF TRUTH — all existing RPCs/triggers/RLS/server-actions
-- keep working UNCHANGED. These AFTER triggers keep the unified mirror (onboarding_cases /
-- exit_cases / support_tickets+support_contractor_meta) current, so the new unified "one module"
-- UI can read a single store. 36a/36b already backfilled existing rows; these triggers cover
-- ongoing writes.
--
-- Safety:
--   * AFTER INSERT/UPDATE/DELETE — the legacy write has already happened.
--   * SECURITY DEFINER + pinned search_path — mirror writes bypass RLS, never blocked.
--   * EXCEPTION WHEN OTHERS → RAISE WARNING + RETURN — a mirror failure NEVER blocks the
--     legacy write (the mirror is non-critical; it can be re-backfilled).
--   * Target mirror tables have no side-effect triggers (support_tickets has only updated_at;
--     unified tables have none) → no notification spam, no cascades.
-- ============================================================

BEGIN;

-- ─── 1. onboarding_progress → onboarding_cases (employee) ─────────────────────
CREATE OR REPLACE FUNCTION sync_onboarding_case_employee()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM onboarding_cases WHERE id = OLD.id AND person_type = 'employee';
        RETURN OLD;
    END IF;
    INSERT INTO onboarding_cases (
        id, person_type, person_id, status, template_id,
        checkin_day1_at, checkin_day1_score, checkin_day1_note,
        checkin_day7_at, checkin_day7_score, checkin_day7_note,
        checkin_day30_at, checkin_day30_score, checkin_day30_note,
        started_at, completed_at, cancelled_at, cancelled_by, cancelled_reason,
        created_at, updated_at
    ) VALUES (
        NEW.id, 'employee', NEW.user_id,
        CASE WHEN NEW.cancelled_at IS NOT NULL THEN 'cancelled'
             WHEN NEW.completed_at IS NOT NULL THEN 'completed' ELSE 'active' END,
        NEW.template_id,
        NEW.checkin_day1_at, NEW.checkin_day1_score, NEW.checkin_day1_note,
        NEW.checkin_day7_at, NEW.checkin_day7_score, NEW.checkin_day7_note,
        NEW.checkin_day30_at, NEW.checkin_day30_score, NEW.checkin_day30_note,
        NEW.started_at, NEW.completed_at, NEW.cancelled_at, NEW.cancelled_by, NEW.cancellation_reason,
        NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        person_id = EXCLUDED.person_id, status = EXCLUDED.status, template_id = EXCLUDED.template_id,
        checkin_day1_at = EXCLUDED.checkin_day1_at, checkin_day1_score = EXCLUDED.checkin_day1_score, checkin_day1_note = EXCLUDED.checkin_day1_note,
        checkin_day7_at = EXCLUDED.checkin_day7_at, checkin_day7_score = EXCLUDED.checkin_day7_score, checkin_day7_note = EXCLUDED.checkin_day7_note,
        checkin_day30_at = EXCLUDED.checkin_day30_at, checkin_day30_score = EXCLUDED.checkin_day30_score, checkin_day30_note = EXCLUDED.checkin_day30_note,
        started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at,
        cancelled_at = EXCLUDED.cancelled_at, cancelled_by = EXCLUDED.cancelled_by, cancelled_reason = EXCLUDED.cancelled_reason,
        updated_at = EXCLUDED.updated_at;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_onboarding_case_employee failed for %: %', COALESCE(NEW.id, OLD.id), SQLERRM;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_onboarding_case_employee ON onboarding_progress;
CREATE TRIGGER trg_sync_onboarding_case_employee
    AFTER INSERT OR UPDATE OR DELETE ON onboarding_progress
    FOR EACH ROW EXECUTE FUNCTION sync_onboarding_case_employee();

-- ─── 2. contractor_onboarding_interviews → onboarding_cases (contractor) ──────
CREATE OR REPLACE FUNCTION sync_onboarding_case_contractor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM onboarding_cases WHERE id = OLD.id AND person_type = 'contractor';
        RETURN OLD;
    END IF;
    INSERT INTO onboarding_cases (
        id, person_type, person_id, status, placement_id, position_snapshot, client_snapshot, start_date,
        scheduled_for, submitted_at, reviewed_by, reviewed_at, reviewer_note, interview, attachments,
        created_by, created_at, updated_at
    ) VALUES (
        NEW.id, 'contractor', NEW.contractor_id,
        CASE WHEN NEW.status IN ('scheduled','submitted','reviewed','archived','cancelled') THEN NEW.status ELSE 'scheduled' END,
        NEW.placement_id, NEW.position_snapshot, NEW.client_snapshot, NEW.start_date,
        NEW.scheduled_for, NEW.submitted_at, NEW.reviewed_by, NEW.reviewed_at, NEW.reviewer_note,
        jsonb_strip_nulls(jsonb_build_object(
            'tcm_role_note', NEW.tcm_role_note, 'first_day_note', NEW.first_day_note,
            'client_manager_name', NEW.client_manager_name, 'equipment_note', NEW.equipment_note,
            'system_access_note', NEW.system_access_note, 'duties_note', NEW.duties_note,
            'work_note', NEW.work_note, 'manager_relation_note', NEW.manager_relation_note,
            'missing_resolved_note', NEW.missing_resolved_note, 'positive_surprise', NEW.positive_surprise,
            'negative_surprise', NEW.negative_surprise, 'doubts_note', NEW.doubts_note,
            'side_projects_interest', NEW.side_projects_interest,
            'cs_challenge', NEW.cs_challenge, 'cs_solution', NEW.cs_solution,
            'cs_technologies', NEW.cs_technologies, 'cs_client', NEW.cs_client, 'cs_sector', NEW.cs_sector
        )),
        COALESCE(NEW.attachments, '[]'::jsonb), NEW.created_by, NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status, placement_id = EXCLUDED.placement_id,
        position_snapshot = EXCLUDED.position_snapshot, client_snapshot = EXCLUDED.client_snapshot, start_date = EXCLUDED.start_date,
        scheduled_for = EXCLUDED.scheduled_for, submitted_at = EXCLUDED.submitted_at,
        reviewed_by = EXCLUDED.reviewed_by, reviewed_at = EXCLUDED.reviewed_at, reviewer_note = EXCLUDED.reviewer_note,
        interview = EXCLUDED.interview, attachments = EXCLUDED.attachments, updated_at = EXCLUDED.updated_at;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_onboarding_case_contractor failed for %: %', COALESCE(NEW.id, OLD.id), SQLERRM;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_onboarding_case_contractor ON contractor_onboarding_interviews;
CREATE TRIGGER trg_sync_onboarding_case_contractor
    AFTER INSERT OR UPDATE OR DELETE ON contractor_onboarding_interviews
    FOR EACH ROW EXECUTE FUNCTION sync_onboarding_case_contractor();

-- ─── 3. exit_interviews → exit_cases (employee) ───────────────────────────────
CREATE OR REPLACE FUNCTION sync_exit_case_employee()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM exit_cases WHERE id = OLD.id AND person_type = 'employee';
        RETURN OLD;
    END IF;
    INSERT INTO exit_cases (
        id, person_type, person_id, is_anonymous, role_snapshot, manager_snapshot, department_snapshot, tenure_months,
        exit_reason, exit_reason_detail, nps_score, satisfaction_team, satisfaction_manager, satisfaction_projects,
        would_recommend, what_worked, what_to_improve, knowledge_transfer_notes,
        status, scheduled_for, submitted_at, reviewed_by, reviewed_at, reviewer_note, created_at, updated_at
    ) VALUES (
        NEW.id, 'employee', NEW.user_id, NEW.is_anonymous, NEW.role_snapshot, NEW.manager_snapshot, NEW.department_snapshot, NEW.tenure_months,
        NEW.exit_reason, NEW.exit_reason_detail, NEW.nps_score, NEW.satisfaction_team, NEW.satisfaction_manager, NEW.satisfaction_projects,
        NEW.would_recommend, NEW.what_worked, NEW.what_to_improve, NEW.knowledge_transfer_notes,
        NEW.status, NEW.scheduled_for, NEW.submitted_at, NEW.reviewed_by, NEW.reviewed_at, NEW.reviewer_note, NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        person_id = EXCLUDED.person_id, is_anonymous = EXCLUDED.is_anonymous,
        role_snapshot = EXCLUDED.role_snapshot, manager_snapshot = EXCLUDED.manager_snapshot,
        department_snapshot = EXCLUDED.department_snapshot, tenure_months = EXCLUDED.tenure_months,
        exit_reason = EXCLUDED.exit_reason, exit_reason_detail = EXCLUDED.exit_reason_detail, nps_score = EXCLUDED.nps_score,
        satisfaction_team = EXCLUDED.satisfaction_team, satisfaction_manager = EXCLUDED.satisfaction_manager, satisfaction_projects = EXCLUDED.satisfaction_projects,
        would_recommend = EXCLUDED.would_recommend, what_worked = EXCLUDED.what_worked, what_to_improve = EXCLUDED.what_to_improve,
        knowledge_transfer_notes = EXCLUDED.knowledge_transfer_notes, status = EXCLUDED.status,
        scheduled_for = EXCLUDED.scheduled_for, submitted_at = EXCLUDED.submitted_at,
        reviewed_by = EXCLUDED.reviewed_by, reviewed_at = EXCLUDED.reviewed_at, reviewer_note = EXCLUDED.reviewer_note, updated_at = EXCLUDED.updated_at;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_exit_case_employee failed for %: %', COALESCE(NEW.id, OLD.id), SQLERRM;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_exit_case_employee ON exit_interviews;
CREATE TRIGGER trg_sync_exit_case_employee
    AFTER INSERT OR UPDATE OR DELETE ON exit_interviews
    FOR EACH ROW EXECUTE FUNCTION sync_exit_case_employee();

-- ─── 4. contractor_exit_interviews → exit_cases (contractor) ──────────────────
CREATE OR REPLACE FUNCTION sync_exit_case_contractor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM exit_cases WHERE id = OLD.id AND person_type = 'contractor';
        RETURN OLD;
    END IF;
    INSERT INTO exit_cases (
        id, person_type, person_id, placement_id, position_snapshot, client_snapshot, start_date, end_date,
        contractor_form, attachments, status, scheduled_for, submitted_at, reviewed_by, reviewed_at, reviewer_note,
        created_by, created_at, updated_at
    ) VALUES (
        NEW.id, 'contractor', NEW.contractor_id, NEW.placement_id, NEW.position_snapshot, NEW.client_snapshot, NEW.start_date, NEW.end_date,
        jsonb_strip_nulls(jsonb_build_object(
            'formal_reason', NEW.formal_reason, 'causes', NEW.causes, 'repair_potential', NEW.repair_potential,
            'is_final', NEW.is_final, 'can_retain_transfer', NEW.can_retain_transfer, 'retain_transfer_note', NEW.retain_transfer_note,
            'can_extend_departure', NEW.can_extend_departure, 'extend_departure_note', NEW.extend_departure_note, 'feedback_lessons', NEW.feedback_lessons
        )),
        COALESCE(NEW.attachments, '[]'::jsonb),
        CASE WHEN NEW.status IN ('scheduled','submitted','reviewed','archived','cancelled') THEN NEW.status ELSE 'scheduled' END,
        NEW.scheduled_for, NEW.submitted_at, NEW.reviewed_by, NEW.reviewed_at, NEW.reviewer_note,
        NEW.created_by, NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        placement_id = EXCLUDED.placement_id, position_snapshot = EXCLUDED.position_snapshot,
        client_snapshot = EXCLUDED.client_snapshot, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
        contractor_form = EXCLUDED.contractor_form, attachments = EXCLUDED.attachments, status = EXCLUDED.status,
        scheduled_for = EXCLUDED.scheduled_for, submitted_at = EXCLUDED.submitted_at,
        reviewed_by = EXCLUDED.reviewed_by, reviewed_at = EXCLUDED.reviewed_at, reviewer_note = EXCLUDED.reviewer_note, updated_at = EXCLUDED.updated_at;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_exit_case_contractor failed for %: %', COALESCE(NEW.id, OLD.id), SQLERRM;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_exit_case_contractor ON contractor_exit_interviews;
CREATE TRIGGER trg_sync_exit_case_contractor
    AFTER INSERT OR UPDATE OR DELETE ON contractor_exit_interviews
    FOR EACH ROW EXECUTE FUNCTION sync_exit_case_contractor();

-- ─── 5. contractor_conversations → support_tickets + support_contractor_meta ──
CREATE OR REPLACE FUNCTION sync_conversation_ticket()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_cat UUID; v_admin UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM support_tickets WHERE id = OLD.id;  -- cascades support_contractor_meta
        RETURN OLD;
    END IF;
    SELECT id INTO v_cat FROM support_categories WHERE slug = 'contractor_conversation';
    SELECT id INTO v_admin FROM profiles WHERE role::text = 'admin' ORDER BY created_at LIMIT 1;
    INSERT INTO support_tickets (id, user_id, assignee_id, category_id, subject, body_md, status, priority, resolved_at, created_at, updated_at)
    VALUES (
        NEW.id, COALESCE(NEW.created_by, NEW.tcm_id, v_admin), NEW.tcm_id, v_cat,
        left('Rozmowa (' || NEW.category || ') ' || COALESCE(NEW.client_snapshot, '') || ' · ' || NEW.conversation_date::text, 200),
        COALESCE(NEW.note, ''),
        CASE NEW.status WHEN 'rozwiazane' THEN 'resolved' WHEN 'w_toku' THEN 'in_progress' ELSE 'open' END,
        CASE NEW.status WHEN 'pilne' THEN 'urgent' WHEN 'potrzebny_kontakt' THEN 'high' ELSE 'normal' END,
        NEW.resolved_at, NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        assignee_id = EXCLUDED.assignee_id, subject = EXCLUDED.subject, body_md = EXCLUDED.body_md,
        status = EXCLUDED.status, priority = EXCLUDED.priority, resolved_at = EXCLUDED.resolved_at;
    INSERT INTO support_contractor_meta (ticket_id, kind, contractor_id, conversation_category, follow_up_date, client_snapshot, tcm_id, placement_id, source_conversation_id)
    VALUES (NEW.id, 'conversation', NEW.contractor_id, NEW.category, NEW.follow_up_date, NEW.client_snapshot, NEW.tcm_id, NEW.placement_id, NEW.id)
    ON CONFLICT (ticket_id) DO UPDATE SET
        conversation_category = EXCLUDED.conversation_category, follow_up_date = EXCLUDED.follow_up_date,
        client_snapshot = EXCLUDED.client_snapshot, tcm_id = EXCLUDED.tcm_id, placement_id = EXCLUDED.placement_id;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_conversation_ticket failed for %: %', COALESCE(NEW.id, OLD.id), SQLERRM;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_conversation_ticket ON contractor_conversations;
CREATE TRIGGER trg_sync_conversation_ticket
    AFTER INSERT OR UPDATE OR DELETE ON contractor_conversations
    FOR EACH ROW EXECUTE FUNCTION sync_conversation_ticket();

-- ─── 6. contractor_tasks → support_tickets + support_contractor_meta ──────────
CREATE OR REPLACE FUNCTION sync_task_ticket()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_cat UUID; v_admin UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM support_tickets WHERE id = OLD.id;
        RETURN OLD;
    END IF;
    SELECT id INTO v_cat FROM support_categories WHERE slug = 'contractor_task';
    SELECT id INTO v_admin FROM profiles WHERE role::text = 'admin' ORDER BY created_at LIMIT 1;
    INSERT INTO support_tickets (id, user_id, assignee_id, category_id, subject, body_md, status, priority, resolved_at, created_at, updated_at)
    VALUES (
        NEW.id, COALESCE(NEW.created_by, NEW.assigned_tcm_id, v_admin), NEW.assigned_tcm_id, v_cat,
        left(NEW.title, 200), COALESCE(NEW.description, ''),
        CASE NEW.status WHEN 'done' THEN 'resolved' WHEN 'in_progress' THEN 'in_progress' ELSE 'open' END,
        'normal',
        CASE WHEN NEW.status = 'done' THEN NEW.updated_at ELSE NULL END,
        NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        assignee_id = EXCLUDED.assignee_id, subject = EXCLUDED.subject, body_md = EXCLUDED.body_md,
        status = EXCLUDED.status, resolved_at = EXCLUDED.resolved_at;
    INSERT INTO support_contractor_meta (ticket_id, kind, contractor_id, due_date, tcm_id, linked_ticket_id, source_task_id)
    VALUES (NEW.id, 'task', NEW.contractor_id, NEW.due_date, NEW.assigned_tcm_id, NEW.source_ticket_id, NEW.id)
    ON CONFLICT (ticket_id) DO UPDATE SET
        contractor_id = EXCLUDED.contractor_id, due_date = EXCLUDED.due_date,
        tcm_id = EXCLUDED.tcm_id, linked_ticket_id = EXCLUDED.linked_ticket_id;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_task_ticket failed for %: %', COALESCE(NEW.id, OLD.id), SQLERRM;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_task_ticket ON contractor_tasks;
CREATE TRIGGER trg_sync_task_ticket
    AFTER INSERT OR UPDATE OR DELETE ON contractor_tasks
    FOR EACH ROW EXECUTE FUNCTION sync_task_ticket();

COMMIT;
