-- ============================================================
-- Phase 23 — Premie (Bonuses)
-- Date: 2026-05-16
--
-- Depends on:
--   - 20260504000002_phase1_role_enum.sql (is_admin)
--   - 20260514000002_phase19b_invoices_and_helpers.sql (is_finanse_or_admin, invoices table)
--   - 20260516000002_phase20b_manager_id_and_helpers.sql (is_manager_of, profiles.manager_id)
--
-- Creates:
--   table:     bonuses (manager → recipient propose; recipient links to invoice → paid)
--   trigger:   enforce_bonus_stage_transitions (state machine pending → paid|cancelled)
--   helper:    can_propose_bonus_for(target_user_id) — admin OR is_manager_of(target)
--   RLS:       owner sees own; manager sees team; finanse/admin see all (read-only finanse)
--
-- Workflow:
--   pending (manager creates)
--     ├── recipient links own invoice → paid (status auto-set, paid_at = NOW())
--     └── proposer/admin cancel → cancelled (cancelled_at = NOW())
--
--   After 'paid' — bonus is final (no clawback per project decision).
-- ============================================================

BEGIN;

-- ─── 1. Table: bonuses ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bonuses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    proposed_by         UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    amount              NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency            TEXT NOT NULL DEFAULT 'PLN',
    reason              TEXT NOT NULL CHECK (length(reason) BETWEEN 3 AND 1000),
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid', 'cancelled')),
    linked_invoice_id   UUID REFERENCES invoices(id) ON DELETE SET NULL,
    paid_at             TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    cancelled_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
    cancellation_reason TEXT,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bonuses_no_self CHECK (recipient_user_id <> proposed_by)
);

CREATE INDEX IF NOT EXISTS idx_bonuses_recipient
    ON bonuses(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_bonuses_proposed_by
    ON bonuses(proposed_by);
CREATE INDEX IF NOT EXISTS idx_bonuses_status
    ON bonuses(status);
CREATE INDEX IF NOT EXISTS idx_bonuses_pending
    ON bonuses(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_bonuses_invoice
    ON bonuses(linked_invoice_id) WHERE linked_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bonuses_recipient_status
    ON bonuses(recipient_user_id, status);

DROP TRIGGER IF EXISTS bonuses_updated_at ON bonuses;
CREATE TRIGGER bonuses_updated_at BEFORE UPDATE ON bonuses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE bonuses IS
    'Phase 23. Manager-proposed bonuses for HR-zone employees. State machine: pending → paid (after recipient links own invoice) or cancelled (by proposer/admin).';

COMMENT ON COLUMN bonuses.recipient_user_id IS
    'Phase 23. Employee receiving the bonus. Must differ from proposed_by.';
COMMENT ON COLUMN bonuses.proposed_by IS
    'Phase 23. Manager (or admin) who proposed this bonus. Manager must be is_manager_of(recipient_user_id).';
COMMENT ON COLUMN bonuses.linked_invoice_id IS
    'Phase 23. Invoice to which this bonus is attached when paid. NULL while pending. Required on pending → paid transition.';
COMMENT ON COLUMN bonuses.reason IS
    'Phase 23. Free-text reason chosen by manager. Compass does not validate semantics — manager knows the rules (regulamin premii rekrutacyjnych/handlowych).';

-- ─── 2. Trigger: stage transitions (state machine) ────────────────────────
CREATE OR REPLACE FUNCTION enforce_bonus_stage_transitions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- INSERT: must start in 'pending'.
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'pending' THEN
            RAISE EXCEPTION 'New bonuses must start in status=pending (got: %)', NEW.status
                USING ERRCODE = 'P0001';
        END IF;
        IF NEW.linked_invoice_id IS NOT NULL THEN
            RAISE EXCEPTION 'New bonuses cannot have linked_invoice_id (only set on pending → paid)'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE: if status unchanged, allow other column updates.
    IF OLD.status = NEW.status THEN
        -- Block changing linked_invoice_id once paid (would orphan the link).
        IF OLD.status = 'paid' AND OLD.linked_invoice_id IS DISTINCT FROM NEW.linked_invoice_id THEN
            RAISE EXCEPTION 'Cannot change linked_invoice_id on a paid bonus'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    -- pending → paid: requires linked_invoice_id, invoice must belong to recipient.
    IF OLD.status = 'pending' AND NEW.status = 'paid' THEN
        IF NEW.linked_invoice_id IS NULL THEN
            RAISE EXCEPTION 'Cannot mark bonus paid without linked_invoice_id'
                USING ERRCODE = 'P0001';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM invoices i
            WHERE i.id = NEW.linked_invoice_id
              AND i.user_id = NEW.recipient_user_id
        ) THEN
            RAISE EXCEPTION 'linked_invoice_id must reference an invoice owned by recipient_user_id'
                USING ERRCODE = 'P0001';
        END IF;
        NEW.paid_at := COALESCE(NEW.paid_at, NOW());
        RETURN NEW;
    END IF;

    -- pending → cancelled
    IF OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
        NEW.cancelled_at := COALESCE(NEW.cancelled_at, NOW());
        RETURN NEW;
    END IF;

    -- paid → pending (unlink path — recipient or admin if invoice rejected, etc.)
    IF OLD.status = 'paid' AND NEW.status = 'pending' THEN
        IF NEW.linked_invoice_id IS NOT NULL THEN
            RAISE EXCEPTION 'Unlinking a paid bonus requires clearing linked_invoice_id'
                USING ERRCODE = 'P0001';
        END IF;
        NEW.paid_at := NULL;
        RETURN NEW;
    END IF;

    -- Any other transition is invalid.
    RAISE EXCEPTION 'Invalid bonus status transition: % → %', OLD.status, NEW.status
        USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_bonus_stage_transitions ON bonuses;
CREATE TRIGGER trg_bonus_stage_transitions
    BEFORE INSERT OR UPDATE OF status, linked_invoice_id
    ON bonuses
    FOR EACH ROW EXECUTE FUNCTION enforce_bonus_stage_transitions();

-- ─── 3. Helper: can_propose_bonus_for(target_user_id) ─────────────────────
CREATE OR REPLACE FUNCTION public.can_propose_bonus_for(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT public.is_admin() OR public.is_manager_of(target_user_id);
$$;

COMMENT ON FUNCTION public.can_propose_bonus_for IS
    'Phase 23. True iff current user can propose a bonus for target_user_id. Admin can propose for anyone; manager only for direct reports.';

REVOKE EXECUTE ON FUNCTION public.can_propose_bonus_for(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_propose_bonus_for(UUID) TO authenticated, service_role;

-- ─── 4. RLS policies ──────────────────────────────────────────────────────
ALTER TABLE bonuses ENABLE ROW LEVEL SECURITY;

-- SELECT: recipient + manager_of(recipient) + finanse/admin (read-only for finanse via UI gating)
DROP POLICY IF EXISTS "bonuses_select_recipient_manager_or_reviewer" ON bonuses;
CREATE POLICY "bonuses_select_recipient_manager_or_reviewer" ON bonuses
    FOR SELECT TO authenticated
    USING (
        auth.uid() = recipient_user_id
        OR is_manager_of(recipient_user_id)
        OR is_finanse_or_admin()
    );

-- INSERT: manager (only for direct reports) or admin (anyone). proposed_by must = auth.uid().
DROP POLICY IF EXISTS "bonuses_insert_manager_or_admin" ON bonuses;
CREATE POLICY "bonuses_insert_manager_or_admin" ON bonuses
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = proposed_by
        AND can_propose_bonus_for(recipient_user_id)
    );

-- UPDATE (cancel by proposer/admin): only pending → cancelled by proposer or admin.
DROP POLICY IF EXISTS "bonuses_update_cancel_by_proposer" ON bonuses;
CREATE POLICY "bonuses_update_cancel_by_proposer" ON bonuses
    FOR UPDATE TO authenticated
    USING (
        status = 'pending'
        AND (auth.uid() = proposed_by OR is_admin())
    )
    WITH CHECK (
        status IN ('pending', 'cancelled')
        AND (auth.uid() = proposed_by OR is_admin())
    );

-- UPDATE (link/unlink by recipient): pending ↔ paid by recipient (own bonuses only).
DROP POLICY IF EXISTS "bonuses_update_link_by_recipient" ON bonuses;
CREATE POLICY "bonuses_update_link_by_recipient" ON bonuses
    FOR UPDATE TO authenticated
    USING (
        auth.uid() = recipient_user_id
        AND status IN ('pending', 'paid')
    )
    WITH CHECK (
        auth.uid() = recipient_user_id
        AND status IN ('pending', 'paid')
    );

-- UPDATE (admin): admin can update any bonus (full control).
DROP POLICY IF EXISTS "bonuses_update_admin" ON bonuses;
CREATE POLICY "bonuses_update_admin" ON bonuses
    FOR UPDATE TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- DELETE: admin only (audit safety).
DROP POLICY IF EXISTS "bonuses_delete_admin" ON bonuses;
CREATE POLICY "bonuses_delete_admin" ON bonuses
    FOR DELETE TO authenticated
    USING (is_admin());

-- ─── 5. Extend notifications.type CHECK constraint with bonus_* types ────
-- Previous baseline (Phase 10): 18 types. Adding: bonus_proposed, bonus_cancelled, bonus_linked.
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
        'bonus_proposed', 'bonus_cancelled', 'bonus_linked'
    ));

-- ─── 6. Audit log action types (comment only) ─────────────────────────────
-- Server actions write: 'BONUS_PROPOSED', 'BONUS_CANCELLED', 'BONUS_LINKED_TO_INVOICE',
-- 'BONUS_UNLINKED'. audit_logs.action is TEXT, no schema change required.

COMMIT;
