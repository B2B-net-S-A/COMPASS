-- ============================================================
-- Phase 26a — Bonus assigned workflow
-- Date: 2026-05-19
--
-- Depends on:
--   - 20260517020001_phase23_bonuses.sql (bonuses table, trigger, RLS, helper)
--
-- Changes:
--   1. Add 'assigned' to status CHECK (status now: assigned|pending|paid|cancelled)
--   2. Add columns: period_year SMALLINT, period_month SMALLINT (nullable for legacy)
--   3. Partial UNIQUE: one assigned bonus per recipient per (year, month)
--   4. Trigger update:
--        - INSERT: only status='assigned' allowed; period_* NOT NULL; linked_invoice_id NULL
--        - UPDATE: assigned→cancelled, assigned→assigned (amount/reason/notes only),
--                  legacy pending→paid/cancelled/unlink branches preserved
--   5. RLS update: bonuses_update_cancel_by_proposer allows status IN ('pending','assigned')
--   6. Notifications: add types 'bonus_assigned', 'bonus_updated'
--
-- Workflow (new path):
--   assigned (manager creates, auto-approved, terminal)
--      └── proposer/admin cancel → cancelled
--
-- Legacy path (pending→paid via invoice link) preserved for backward compat
-- but new INSERT path locked to 'assigned' at trigger level.
-- ============================================================

BEGIN;

-- ─── 1. Status CHECK constraint: add 'assigned' ──────────────────────────
ALTER TABLE bonuses DROP CONSTRAINT IF EXISTS bonuses_status_check;
ALTER TABLE bonuses ADD CONSTRAINT bonuses_status_check
    CHECK (status IN ('assigned', 'pending', 'paid', 'cancelled'));

-- ─── 2. New columns: period_year, period_month ───────────────────────────
ALTER TABLE bonuses
    ADD COLUMN IF NOT EXISTS period_year SMALLINT,
    ADD COLUMN IF NOT EXISTS period_month SMALLINT
        CHECK (period_month IS NULL OR (period_month BETWEEN 1 AND 12));

COMMENT ON COLUMN bonuses.period_year IS
    'Phase 26. Year of bonus period (e.g. 2026). Required for assigned bonuses; NULL for legacy pending/paid records.';
COMMENT ON COLUMN bonuses.period_month IS
    'Phase 26. Month of bonus period (1-12). Required for assigned bonuses; NULL for legacy pending/paid records.';

-- ─── 3. Partial UNIQUE — one assigned bonus per recipient per month ─────
CREATE UNIQUE INDEX IF NOT EXISTS bonuses_one_per_recipient_period
    ON bonuses (recipient_user_id, period_year, period_month)
    WHERE status = 'assigned' AND period_year IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bonuses_assigned
    ON bonuses(status) WHERE status = 'assigned';

-- ─── 4. Trigger update: enforce_bonus_stage_transitions ──────────────────
CREATE OR REPLACE FUNCTION enforce_bonus_stage_transitions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- INSERT: new path only allows status='assigned' with period_year + period_month set.
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'assigned' THEN
            RAISE EXCEPTION 'New bonuses must start in status=assigned (got: %). Legacy pending path closed in Phase 26.', NEW.status
                USING ERRCODE = 'P0001';
        END IF;
        IF NEW.period_year IS NULL OR NEW.period_month IS NULL THEN
            RAISE EXCEPTION 'Assigned bonuses require period_year and period_month'
                USING ERRCODE = 'P0001';
        END IF;
        IF NEW.linked_invoice_id IS NOT NULL THEN
            RAISE EXCEPTION 'Assigned bonuses cannot have linked_invoice_id (invoice workflow disabled in Phase 26)'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE: if status unchanged, allow column updates but guard immutable fields.
    IF OLD.status = NEW.status THEN
        -- Block changing recipient/period on any bonus (immutable after insert).
        IF OLD.status = 'assigned' THEN
            IF OLD.recipient_user_id IS DISTINCT FROM NEW.recipient_user_id THEN
                RAISE EXCEPTION 'Cannot change recipient_user_id on an assigned bonus'
                    USING ERRCODE = 'P0001';
            END IF;
            IF OLD.period_year IS DISTINCT FROM NEW.period_year
                OR OLD.period_month IS DISTINCT FROM NEW.period_month THEN
                RAISE EXCEPTION 'Cannot change period on an assigned bonus (create a new one for a different month)'
                    USING ERRCODE = 'P0001';
            END IF;
            IF NEW.linked_invoice_id IS NOT NULL THEN
                RAISE EXCEPTION 'Assigned bonuses cannot have linked_invoice_id (invoice workflow disabled in Phase 26)'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
        -- Block changing linked_invoice_id once paid (legacy safety).
        IF OLD.status = 'paid' AND OLD.linked_invoice_id IS DISTINCT FROM NEW.linked_invoice_id THEN
            RAISE EXCEPTION 'Cannot change linked_invoice_id on a paid bonus'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    -- assigned → cancelled
    IF OLD.status = 'assigned' AND NEW.status = 'cancelled' THEN
        NEW.cancelled_at := COALESCE(NEW.cancelled_at, NOW());
        RETURN NEW;
    END IF;

    -- Legacy: pending → paid (requires linked_invoice_id, invoice owned by recipient).
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

    -- Legacy: pending → cancelled
    IF OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
        NEW.cancelled_at := COALESCE(NEW.cancelled_at, NOW());
        RETURN NEW;
    END IF;

    -- Legacy: paid → pending (unlink path)
    IF OLD.status = 'paid' AND NEW.status = 'pending' THEN
        IF NEW.linked_invoice_id IS NOT NULL THEN
            RAISE EXCEPTION 'Unlinking a paid bonus requires clearing linked_invoice_id'
                USING ERRCODE = 'P0001';
        END IF;
        NEW.paid_at := NULL;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid bonus status transition: % → %', OLD.status, NEW.status
        USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_bonus_stage_transitions ON bonuses;
CREATE TRIGGER trg_bonus_stage_transitions
    BEFORE INSERT OR UPDATE OF status, linked_invoice_id, recipient_user_id, period_year, period_month
    ON bonuses
    FOR EACH ROW EXECUTE FUNCTION enforce_bonus_stage_transitions();

-- ─── 5. RLS update: cancel/update policy for proposer ───────────────────
DROP POLICY IF EXISTS "bonuses_update_cancel_by_proposer" ON bonuses;
CREATE POLICY "bonuses_update_cancel_by_proposer" ON bonuses
    FOR UPDATE TO authenticated
    USING (
        status IN ('pending', 'assigned')
        AND (auth.uid() = proposed_by OR is_admin())
    )
    WITH CHECK (
        status IN ('pending', 'assigned', 'cancelled')
        AND (auth.uid() = proposed_by OR is_admin())
    );

-- ─── 6. Notifications type CHECK: add 'bonus_assigned', 'bonus_updated' ──
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
        'bonus_proposed', 'bonus_cancelled', 'bonus_linked',
        -- Phase 26
        'bonus_assigned', 'bonus_updated'
    ));

-- ─── 7. Inline smoke test: assert trigger accepts 'assigned' insert ─────
DO $$
DECLARE
    test_proposer UUID;
    test_recipient UUID;
    test_bonus_id UUID;
BEGIN
    -- Pick any two distinct profiles for the smoke test (rollback after).
    SELECT id INTO test_proposer FROM profiles ORDER BY id LIMIT 1;
    SELECT id INTO test_recipient FROM profiles WHERE id <> test_proposer ORDER BY id LIMIT 1;

    IF test_proposer IS NULL OR test_recipient IS NULL THEN
        RAISE NOTICE 'Skipping inline smoke test — need at least 2 profile rows.';
        RETURN;
    END IF;

    -- Savepoint so we don't pollute prod data.
    BEGIN
        INSERT INTO bonuses (
            recipient_user_id, proposed_by, amount, currency, reason,
            status, period_year, period_month
        ) VALUES (
            test_recipient, test_proposer, 1.00, 'PLN', 'phase26a smoke test',
            'assigned', 2026, 5
        ) RETURNING id INTO test_bonus_id;

        ASSERT test_bonus_id IS NOT NULL, 'Smoke test INSERT returned NULL';

        -- Rollback the test row.
        DELETE FROM bonuses WHERE id = test_bonus_id;
        RAISE NOTICE 'Phase 26a smoke test passed (insert+delete OK)';
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Phase 26a smoke test FAILED: %', SQLERRM;
    END;
END $$;

COMMIT;
