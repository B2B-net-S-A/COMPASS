-- ============================================================
-- Phase 20c — Invoice 2-stage approval (Manager merit + Finanse final)
-- Date: 2026-05-16
--
-- Depends on:
--   - 20260514000002_phase19b_invoices_and_helpers.sql (invoices table)
--   - 20260516000002_phase20b_manager_id_and_helpers.sql (manager_id + is_manager_of)
--
-- Workflow:
--   draft → submitted
--     ├── ma managera?
--     │     ├── tak: manager_approved (Manager merit OK) → approved (Finanse final OK)
--     │     └── nie: approved (Finanse skip stage 1)
--     ├── manager_rejected → draft (wraca do pracownika z reason)
--     └── rejected (finanse) → draft (wraca do pracownika z reason)
--
-- Po Phase 20c stan invoice.status: 'submitted', 'manager_approved', 'approved', 'rejected'.
-- Pracownik ponownie submituje → status='submitted' (jak Phase 19).
--
-- Trigger: enforce_invoice_stage_transitions blokuje invalid state transitions.
-- Trigger: enforce_finanse_requires_manager_approval — finanse może 'approved'
--          tylko z 'manager_approved' (gdy user ma managera) lub bezpośrednio z
--          'submitted' (gdy user.manager_id IS NULL).
-- ============================================================

BEGIN;

-- ─── 1. Extend status enum (CHECK constraint) ─────────────────────────────
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices
    ADD CONSTRAINT invoices_status_check
    CHECK (status IN ('submitted', 'manager_approved', 'approved', 'rejected'));

-- ─── 2. New columns: manager_reviewed_by, manager_reviewed_at, manager_review_note ─
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS manager_reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS manager_reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS manager_review_note TEXT,
    ADD COLUMN IF NOT EXISTS rejected_by_stage TEXT
        CHECK (rejected_by_stage IS NULL OR rejected_by_stage IN ('manager', 'finanse'));

CREATE INDEX IF NOT EXISTS idx_invoices_manager_review_pending
    ON invoices(status)
    WHERE status = 'submitted';

CREATE INDEX IF NOT EXISTS idx_invoices_finance_review_pending
    ON invoices(status)
    WHERE status = 'manager_approved';

COMMENT ON COLUMN invoices.manager_reviewed_by IS
    'Phase 20c. Manager who performed merit review (stage 1). NULL if no manager or skipped.';
COMMENT ON COLUMN invoices.manager_review_note IS
    'Phase 20c. Optional comment from Manager during stage 1 review. Visible to Finanse.';
COMMENT ON COLUMN invoices.rejected_by_stage IS
    'Phase 20c. Which stage rejected (manager|finanse). Stored to distinguish manager vs finanse decision.';

-- ─── 3. Trigger: enforce stage transitions (state machine) ────────────────
CREATE OR REPLACE FUNCTION enforce_invoice_stage_transitions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_user_has_manager BOOLEAN;
BEGIN
    -- INSERT: only 'submitted' allowed (covered by existing logic).
    IF TG_OP = 'INSERT' THEN
        IF NEW.status NOT IN ('submitted') THEN
            RAISE EXCEPTION 'New invoices must start in status=submitted (got: %)', NEW.status
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE: validate transitions.
    IF OLD.status = NEW.status THEN
        RETURN NEW; -- no status change; other columns may have been updated
    END IF;

    -- Allowed transitions:
    --   submitted → manager_approved  (Manager merit OK)
    --   submitted → approved          (Finanse skip stage 1, only when user.manager_id IS NULL)
    --   submitted → rejected          (Finanse OR Manager reject)
    --   manager_approved → approved   (Finanse final OK)
    --   manager_approved → rejected   (Finanse reject after manager OK'd it)
    --   rejected → submitted          (worker re-submits)

    IF OLD.status = 'submitted' AND NEW.status = 'manager_approved' THEN
        -- Manager merit OK
        IF NEW.manager_reviewed_by IS NULL OR NEW.manager_reviewed_at IS NULL THEN
            RAISE EXCEPTION 'manager_approved status requires manager_reviewed_by + manager_reviewed_at'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'submitted' AND NEW.status = 'approved' THEN
        -- Finanse skip stage 1 — only allowed when user has NO manager
        SELECT EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = NEW.user_id AND p.manager_id IS NOT NULL
        ) INTO v_user_has_manager;
        IF v_user_has_manager THEN
            RAISE EXCEPTION 'Cannot final-approve invoice directly: user has a manager — manager review required first'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'manager_approved' AND NEW.status = 'approved' THEN
        -- Finanse final OK after manager approval
        RETURN NEW;
    END IF;

    IF NEW.status = 'rejected' AND OLD.status IN ('submitted', 'manager_approved') THEN
        -- Reject from either stage
        IF NEW.rejected_by_stage IS NULL THEN
            RAISE EXCEPTION 'rejected status requires rejected_by_stage (manager|finanse)'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'rejected' AND NEW.status = 'submitted' THEN
        -- Worker re-submits after reject (file may have been updated)
        RETURN NEW;
    END IF;

    -- Any other transition is invalid
    RAISE EXCEPTION 'Invalid invoice status transition: % → %', OLD.status, NEW.status
        USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_stage_transitions ON invoices;
CREATE TRIGGER trg_invoice_stage_transitions
    BEFORE INSERT OR UPDATE OF status
    ON invoices
    FOR EACH ROW EXECUTE FUNCTION enforce_invoice_stage_transitions();

-- ─── 4. Update timesheet unlock guard: 'manager_approved' is also active ──
-- Phase 19b had: status IN ('submitted', 'approved'). Now we have 4 statuses;
-- "active" = anything that's not 'rejected'.
CREATE OR REPLACE FUNCTION enforce_no_active_invoice_on_unlock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
        IF EXISTS (
            SELECT 1 FROM invoices
            WHERE user_id = NEW.user_id
              AND period_year = NEW.year
              AND period_month = NEW.month
              AND status IN ('submitted', 'manager_approved', 'approved')
        ) THEN
            RAISE EXCEPTION 'Nie można odblokować timesheetu — istnieją aktywne faktury za %. Najpierw odrzuć/anuluj faktury.',
                to_char(make_date(NEW.year, NEW.month, 1), 'YYYY-MM')
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ─── 5. RLS: manager can UPDATE invoices of team members (manager_approve/reject) ──
DROP POLICY IF EXISTS "invoices_update_manager_team" ON invoices;
CREATE POLICY "invoices_update_manager_team" ON invoices
    FOR UPDATE TO authenticated
    USING (is_manager_of(user_id))
    WITH CHECK (is_manager_of(user_id));

-- ─── 6. Update owner update policy — owner can re-submit from rejected ────
-- (no change needed; existing policy allows status: rejected → submitted)

-- ─── 7. INSERT policy: allow all HR-zone roles to submit their own invoice ─
-- Phase 19d had: internal + finanse. Phase 20 adds: manager + talent_community.
DROP POLICY IF EXISTS "invoices_insert_internal_or_finanse_own" ON invoices;
DROP POLICY IF EXISTS "invoices_insert_hr_zone_own" ON invoices;
CREATE POLICY "invoices_insert_hr_zone_own" ON invoices
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role::TEXT IN ('internal', 'finanse', 'manager', 'talent_community', 'admin')
        )
    );

-- ─── 8. Audit log action types (comment only) ─────────────────────────────
-- Server actions write: 'INVOICE_MANAGER_APPROVED', 'INVOICE_MANAGER_REJECTED'
-- (existing 'INVOICE_APPROVED' / 'INVOICE_REJECTED' = finanse stage 2).

COMMIT;
