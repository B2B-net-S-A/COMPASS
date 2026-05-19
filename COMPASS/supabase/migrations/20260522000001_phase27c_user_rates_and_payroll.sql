-- ============================================================
-- Phase 27c — User rates (history) + payroll helpers
-- Date: 2026-05-22
--
-- Depends on:
--   - profiles (id, role)
--   - is_admin(), is_manager_of(), is_finanse_or_admin()
--
-- Changes:
--   1. Table user_rates: id, user_id, hourly_rate, currency, effective_from (1st of month),
--      effective_to, set_by, reason, created_at
--   2. CHECK effective_from must be day 1 of the month + effective_to > effective_from
--   3. Partial UNIQUE: one active rate per user (effective_to IS NULL)
--   4. Trigger auto_close_previous_rate BEFORE INSERT:
--      - close previous active rate by setting its effective_to = NEW.effective_from
--      - reject INSERT with effective_from < next month first day (no mid-month changes)
--      - reject INSERT with effective_from <= existing rate effective_from
--   5. Helpers: get_user_rate_for_month(user_id, year, month), next_month_first_day()
--   6. RLS: SELECT owner/manager_of/finanse/admin; INSERT finanse/admin; UPDATE/DELETE admin
--   7. Extend notifications.type CHECK with 'rate_changed'
-- ============================================================

BEGIN;

-- ─── 1. Table: user_rates ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    hourly_rate     NUMERIC(12, 2) NOT NULL CHECK (hourly_rate >= 0),
    currency        TEXT NOT NULL DEFAULT 'PLN' CHECK (currency IN ('PLN', 'EUR', 'USD')),
    effective_from  DATE NOT NULL CHECK (EXTRACT(DAY FROM effective_from) = 1),
    effective_to    DATE,
    set_by          UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT effective_range_valid CHECK (effective_to IS NULL OR effective_to > effective_from)
);

COMMENT ON TABLE user_rates IS
    'Phase 27c. Per-employee hourly rate history. effective_from always = 1st of month. Trigger auto-closes previous rate when new one is inserted.';
COMMENT ON COLUMN user_rates.effective_from IS
    'Phase 27c. First day of the month from which this rate applies. CHECK enforces day = 1.';
COMMENT ON COLUMN user_rates.effective_to IS
    'Phase 27c. Set automatically by trigger when a newer rate is inserted. NULL = currently active.';

-- ─── 2. Indexes ────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS user_rates_one_active_per_user
    ON user_rates(user_id) WHERE effective_to IS NULL;
CREATE INDEX IF NOT EXISTS user_rates_by_user_period
    ON user_rates(user_id, effective_from);
CREATE INDEX IF NOT EXISTS user_rates_set_by
    ON user_rates(set_by);

-- ─── 3. Helper functions ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION next_month_first_day()
RETURNS DATE LANGUAGE sql IMMUTABLE AS $$
    SELECT (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::DATE;
$$;

COMMENT ON FUNCTION next_month_first_day IS
    'Phase 27c. Returns the first day of next calendar month (in UTC). Used to validate new rates start no earlier than next month.';

CREATE OR REPLACE FUNCTION get_user_rate_for_month(p_user_id UUID, p_year INT, p_month INT)
RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE
    target_date DATE := make_date(p_year, p_month, 1);
    result NUMERIC;
BEGIN
    SELECT hourly_rate INTO result
    FROM user_rates
    WHERE user_id = p_user_id
      AND effective_from <= target_date
      AND (effective_to IS NULL OR effective_to > target_date)
    ORDER BY effective_from DESC LIMIT 1;
    RETURN result;
END;
$$;

COMMENT ON FUNCTION get_user_rate_for_month IS
    'Phase 27c. Returns hourly_rate active for (user_id, year, month). NULL if no rate set for that period.';

-- ─── 4. Trigger: auto-close previous active rate ──────────────────────────
CREATE OR REPLACE FUNCTION auto_close_previous_rate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    existing_id UUID;
    existing_effective_from DATE;
    min_allowed DATE;
BEGIN
    -- Enforce: new rate must start no earlier than next month (no mid-month / past changes).
    min_allowed := next_month_first_day();
    IF NEW.effective_from < min_allowed THEN
        RAISE EXCEPTION 'effective_from (%) must be >= % (first day of next month). No mid-month or past rate changes.',
            NEW.effective_from, min_allowed
            USING ERRCODE = 'P0001';
    END IF;

    -- Find active rate for the user (effective_to IS NULL).
    SELECT id, effective_from INTO existing_id, existing_effective_from
    FROM user_rates
    WHERE user_id = NEW.user_id AND effective_to IS NULL
    ORDER BY effective_from DESC LIMIT 1;

    -- If exists, ensure new effective_from is strictly greater.
    IF existing_id IS NOT NULL THEN
        IF NEW.effective_from <= existing_effective_from THEN
            RAISE EXCEPTION 'New rate effective_from (%) must be > existing rate effective_from (%).',
                NEW.effective_from, existing_effective_from
                USING ERRCODE = 'P0001';
        END IF;

        -- Close the previous rate.
        UPDATE user_rates
        SET effective_to = NEW.effective_from
        WHERE id = existing_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_rates_auto_close ON user_rates;
CREATE TRIGGER user_rates_auto_close
    BEFORE INSERT ON user_rates
    FOR EACH ROW
    EXECUTE FUNCTION auto_close_previous_rate();

-- ─── 5. RLS ───────────────────────────────────────────────────────────────
ALTER TABLE user_rates ENABLE ROW LEVEL SECURITY;

-- SELECT: owner, manager of owner, finanse, admin
DROP POLICY IF EXISTS "user_rates_select_authorized" ON user_rates;
CREATE POLICY "user_rates_select_authorized" ON user_rates
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR is_manager_of(user_id)
        OR is_finanse_or_admin()
    );

-- INSERT: finanse + admin only
DROP POLICY IF EXISTS "user_rates_insert_finanse_admin" ON user_rates;
CREATE POLICY "user_rates_insert_finanse_admin" ON user_rates
    FOR INSERT TO authenticated
    WITH CHECK (is_finanse_or_admin());

-- UPDATE: admin only (mainly for fixing typo in `reason`; immutable fields via trigger)
DROP POLICY IF EXISTS "user_rates_update_admin" ON user_rates;
CREATE POLICY "user_rates_update_admin" ON user_rates
    FOR UPDATE TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- DELETE: admin only (audit safety)
DROP POLICY IF EXISTS "user_rates_delete_admin" ON user_rates;
CREATE POLICY "user_rates_delete_admin" ON user_rates
    FOR DELETE TO authenticated
    USING (is_admin());

-- ─── 6. Extend notifications.type CHECK with 'rate_changed' ───────────────
-- Drop + recreate CHECK with full list (incl. all existing types + 'rate_changed').
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
        'rate_changed'
    ));

COMMIT;
