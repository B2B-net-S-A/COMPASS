-- ============================================================
-- Phase 31 — Champions League (premia kwartalna, manualna)
-- Date: 2026-06-02
--
-- Depends on:
--   - 20260517020001_phase23_bonuses.sql (bonuses table)
--   - 20260519000001_phase26a_bonus_assigned_workflow.sql (assigned status, period_*)
--   - 20260521000001_phase27b_bonus_categories.sql (category + per-category cols)
--   - 20260524000001_phase27e_bonus_allow_multiple_per_month.sql (dropped per-period UNIQUE)
--   - 20260528000002_phase28b_placements_support.sql (latest notifications_type_check)
--
-- Changes:
--   1. Nowe kolumny: place_rank SMALLINT (1|2|3), period_quarter SMALLINT (1-4)
--   2. Rozszerzony CHECK bonuses_category_check o 'champions_league' (5. kategoria)
--   3. Rozszerzony CHECK bonuses_category_fields_required o piątą gałąź
--   4. Partial UNIQUE: 1 zwycięzca per (year, quarter, place) gdy status='assigned'
--   5. Trigger enforce_bonus_stage_transitions — branch dla champions_league
--      (wymaga period_quarter zamiast period_month, immutability place_rank/quarter)
--   6. Notifications type CHECK += 'champions_league_assigned'
--
-- Workflow (jak Phase 26 — assigned terminal, opcjonalny cancel):
--   manager/admin tworzy assigned → recipient widzi w /internal?tab=bonuses
--   proposer/admin cancel → cancelled (zwalnia partial UNIQUE dla miejsca)
--
-- Default amounts (hard-coded w lib/types/bonus.ts, override dozwolony):
--   1. miejsce: 5000 PLN  |  2. miejsce: 3000 PLN  |  3. miejsce: 2000 PLN
-- ============================================================

BEGIN;

-- ─── 1. Nowe kolumny ─────────────────────────────────────────────────────
ALTER TABLE bonuses
    ADD COLUMN IF NOT EXISTS place_rank SMALLINT
        CHECK (place_rank IS NULL OR place_rank IN (1, 2, 3)),
    ADD COLUMN IF NOT EXISTS period_quarter SMALLINT
        CHECK (period_quarter IS NULL OR (period_quarter BETWEEN 1 AND 4));

COMMENT ON COLUMN bonuses.place_rank IS
    'Phase 31. Miejsce w Champions League (1/2/3). NULL dla innych kategorii.';
COMMENT ON COLUMN bonuses.period_quarter IS
    'Phase 31. Kwartał (1-4) dla kategorii kwartalnych (champions_league). NULL dla miesięcznych.';

-- ─── 2. Rozszerz category CHECK o 'champions_league' ─────────────────────
-- Phase 27b dodało CHECK inline w ALTER ADD COLUMN — bez nazwy.
-- Trzeba znaleźć auto-nazwę z pg_constraint i ją DROP-ować, potem ADD nazwany.
DO $$
DECLARE
    cname TEXT;
BEGIN
    SELECT conname INTO cname
    FROM pg_constraint
    WHERE conrelid = 'bonuses'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
      AND pg_get_constraintdef(oid) ILIKE '%sales%'
      AND pg_get_constraintdef(oid) ILIKE '%recruiter%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%fields_required%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%no_self_delivery%'
    LIMIT 1;

    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE bonuses DROP CONSTRAINT %I', cname);
        RAISE NOTICE 'Phase 31: dropped existing category CHECK constraint: %', cname;
    END IF;
END $$;

ALTER TABLE bonuses ADD CONSTRAINT bonuses_category_check
    CHECK (category IN ('sales', 'delivery_lead', 'recruiter', 'custom', 'champions_league'));

COMMENT ON CONSTRAINT bonuses_category_check ON bonuses IS
    'Phase 31. 5 kategorii: sales | delivery_lead | recruiter | custom | champions_league.';

-- ─── 3. Rozszerz bonuses_category_fields_required o piątą gałąź ─────────
ALTER TABLE bonuses DROP CONSTRAINT IF EXISTS bonuses_category_fields_required;

ALTER TABLE bonuses ADD CONSTRAINT bonuses_category_fields_required CHECK (
    (category = 'sales'
        AND sales_client_name IS NOT NULL
        AND length(sales_client_name) >= 2
        AND sales_service_description IS NOT NULL
        AND length(sales_service_description) >= 3)
    OR (category = 'delivery_lead'
        AND delivery_consultant_id IS NOT NULL
        AND delivery_margin_amount IS NOT NULL
        AND delivery_margin_amount > 0)
    OR (category = 'recruiter'
        AND recruiter_margin_per_hour IS NOT NULL
        AND recruiter_margin_per_hour >= 0
        AND recruiter_candidate_name IS NOT NULL
        AND length(recruiter_candidate_name) >= 3
        AND recruiter_calculated_tier IS NOT NULL)
    OR (category = 'custom'
        AND (custom_email_memo IS NOT NULL OR attachment_path IS NOT NULL))
    OR (category = 'champions_league'
        AND place_rank IS NOT NULL
        AND period_quarter IS NOT NULL
        AND period_month IS NULL)
) NOT VALID;

-- ─── 4. Partial UNIQUE — 1 zwycięzca per (year, quarter, place) ─────────
CREATE UNIQUE INDEX IF NOT EXISTS bonuses_champions_league_unique
    ON bonuses (period_year, period_quarter, place_rank)
    WHERE category = 'champions_league' AND status = 'assigned';

COMMENT ON INDEX bonuses_champions_league_unique IS
    'Phase 31. Jedno miejsce 1/2/3 w danym kwartale może mieć tylko 1 zwycięzcę. Po cancel zwalnia się dla nowego.';

CREATE INDEX IF NOT EXISTS idx_bonuses_champions_league
    ON bonuses(category, period_year, period_quarter)
    WHERE category = 'champions_league';

-- ─── 5. Trigger update: branch dla champions_league ─────────────────────
CREATE OR REPLACE FUNCTION enforce_bonus_stage_transitions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- INSERT: new path only allows status='assigned' with required period fields.
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'assigned' THEN
            RAISE EXCEPTION 'New bonuses must start in status=assigned (got: %). Legacy pending path closed in Phase 26.', NEW.status
                USING ERRCODE = 'P0001';
        END IF;
        -- Phase 31: champions_league wymaga period_year + period_quarter (NIE period_month).
        IF NEW.category = 'champions_league' THEN
            IF NEW.period_year IS NULL OR NEW.period_quarter IS NULL THEN
                RAISE EXCEPTION 'champions_league bonuses require period_year and period_quarter'
                    USING ERRCODE = 'P0001';
            END IF;
            IF NEW.place_rank IS NULL THEN
                RAISE EXCEPTION 'champions_league bonuses require place_rank (1/2/3)'
                    USING ERRCODE = 'P0001';
            END IF;
            IF NEW.period_month IS NOT NULL THEN
                RAISE EXCEPTION 'champions_league bonuses must have period_month NULL (use period_quarter instead)'
                    USING ERRCODE = 'P0001';
            END IF;
        ELSE
            IF NEW.period_year IS NULL OR NEW.period_month IS NULL THEN
                RAISE EXCEPTION 'Assigned bonuses require period_year and period_month'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
        IF NEW.linked_invoice_id IS NOT NULL THEN
            RAISE EXCEPTION 'Assigned bonuses cannot have linked_invoice_id (invoice workflow disabled in Phase 26)'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE: if status unchanged, allow column updates but guard immutable fields.
    IF OLD.status = NEW.status THEN
        IF OLD.status = 'assigned' THEN
            IF OLD.recipient_user_id IS DISTINCT FROM NEW.recipient_user_id THEN
                RAISE EXCEPTION 'Cannot change recipient_user_id on an assigned bonus'
                    USING ERRCODE = 'P0001';
            END IF;
            IF OLD.period_year IS DISTINCT FROM NEW.period_year
                OR OLD.period_month IS DISTINCT FROM NEW.period_month THEN
                RAISE EXCEPTION 'Cannot change period on an assigned bonus (create a new one for a different period)'
                    USING ERRCODE = 'P0001';
            END IF;
            -- Phase 31: block period_quarter / place_rank / category on champions_league
            IF OLD.period_quarter IS DISTINCT FROM NEW.period_quarter
                OR OLD.place_rank IS DISTINCT FROM NEW.place_rank THEN
                RAISE EXCEPTION 'Cannot change period_quarter or place_rank on an assigned bonus (create a new one)'
                    USING ERRCODE = 'P0001';
            END IF;
            IF OLD.category IS DISTINCT FROM NEW.category THEN
                RAISE EXCEPTION 'Cannot change category on an assigned bonus'
                    USING ERRCODE = 'P0001';
            END IF;
            IF NEW.linked_invoice_id IS NOT NULL THEN
                RAISE EXCEPTION 'Assigned bonuses cannot have linked_invoice_id (invoice workflow disabled in Phase 26)'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
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

-- Recreate trigger z nowymi kolumnami w UPDATE OF
DROP TRIGGER IF EXISTS trg_bonus_stage_transitions ON bonuses;
CREATE TRIGGER trg_bonus_stage_transitions
    BEFORE INSERT OR UPDATE OF status, linked_invoice_id, recipient_user_id,
        period_year, period_month, period_quarter, place_rank, category
    ON bonuses
    FOR EACH ROW EXECUTE FUNCTION enforce_bonus_stage_transitions();

-- ─── 6. Notifications type CHECK — add 'champions_league_assigned' ──────
-- Pełna lista po Phase 28b (latest) + Phase 31.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'contract_ending', 'health_score_low', 'new_project_match',
        'loyalty_tier_up', 'referral_update', 'document_uploaded',
        'system_announcement', 'payment_received',
        'course_completed', 'course_approved', 'course_rejected',
        'support_ticket_assigned', 'support_ticket_replied', 'support_ticket_resolved',
        'news_published',
        'incubator_pitch_status_changed', 'incubator_application_received',
        'incubator_application_status_changed',
        'inbox_ticket_assigned', 'inbox_sla_breach',
        -- Phase 23/26 bonuses
        'bonus_proposed', 'bonus_cancelled', 'bonus_linked',
        'bonus_assigned', 'bonus_updated',
        -- Phase 25e/26b inbox email ingest
        'inbox_email_arrived', 'inbox_email_reopened',
        -- Phase 27c rates
        'rate_changed',
        -- Phase 28 placements
        'placement_reminder',
        -- Phase 31 champions league
        'champions_league_assigned'
    ));

-- ─── 7. Inline smoke test: insert + delete champions_league bonus ───────
DO $$
DECLARE
    test_proposer UUID;
    test_recipient UUID;
    test_bonus_id UUID;
BEGIN
    SELECT id INTO test_proposer FROM profiles ORDER BY id LIMIT 1;
    SELECT id INTO test_recipient FROM profiles WHERE id <> test_proposer ORDER BY id LIMIT 1;

    IF test_proposer IS NULL OR test_recipient IS NULL THEN
        RAISE NOTICE 'Phase 31: Skipping inline smoke test — need at least 2 profile rows.';
        RETURN;
    END IF;

    BEGIN
        -- Test 1: champions_league INSERT z period_quarter+place_rank (period_month=NULL)
        INSERT INTO bonuses (
            recipient_user_id, proposed_by, amount, currency, reason,
            status, category, period_year, period_quarter, place_rank
        ) VALUES (
            test_recipient, test_proposer, 5000.00, 'PLN', 'phase31 smoke test',
            'assigned', 'champions_league', 2026, 1, 1
        ) RETURNING id INTO test_bonus_id;

        ASSERT test_bonus_id IS NOT NULL, 'Phase 31 INSERT champions_league returned NULL';

        -- Test 2: UPDATE amount allowed
        UPDATE bonuses SET amount = 7000.00 WHERE id = test_bonus_id;

        -- Test 3: próba zmiany place_rank — expect failure
        BEGIN
            UPDATE bonuses SET place_rank = 2 WHERE id = test_bonus_id;
            RAISE EXCEPTION 'Phase 31 smoke test FAILED: UPDATE place_rank should have been blocked';
        EXCEPTION WHEN raise_exception THEN
            -- Expected — trigger blocked the change
            NULL;
        END;

        -- Cleanup
        DELETE FROM bonuses WHERE id = test_bonus_id;
        RAISE NOTICE 'Phase 31 smoke test passed (insert+update+immutability OK)';
    EXCEPTION WHEN OTHERS THEN
        -- Rollback nawet jeśli DELETE nie zdążyło
        IF test_bonus_id IS NOT NULL THEN
            DELETE FROM bonuses WHERE id = test_bonus_id;
        END IF;
        RAISE EXCEPTION 'Phase 31 smoke test FAILED: %', SQLERRM;
    END;
END $$;

COMMIT;
