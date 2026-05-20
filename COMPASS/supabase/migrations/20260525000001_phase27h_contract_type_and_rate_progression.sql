-- ============================================================
-- Phase 27h — Contract type 'zlecenie' + rate progression (batch future change-points)
-- Date: 2026-05-25
--
-- Depends on:
--   - profiles.employment_type (Phase 11b, CHECK uop|b2b)
--   - user_rates + trigger auto_close_previous_rate + next_month_first_day() (Phase 27c)
--
-- Changes:
--   1. Extend profiles.employment_type CHECK to allow 'zlecenie' (umowa zlecenie).
--      Zlecenie is treated like UoP for payroll (it is NOT b2b → payroll/export/reminders
--      already include it via their `employment_type <> 'b2b'` filters).
--   2. RPC set_user_rate_progression(p_user_id, p_currency, p_entries, p_set_by, p_reason):
--      atomically INSERTs a list of ascending future change-points into user_rates.
--      The existing per-row trigger auto_close_previous_rate enforces:
--        - effective_from >= first day of next month (no mid-month/past changes)
--        - effective_from strictly greater than the user's open rate
--        - auto-closes the previous open rate
--      Because the function body is a single transaction, any rejected row rolls back
--      the whole progression (all-or-nothing). Append-only by construction.
--
-- No change to notifications.type — rate changes reuse the existing 'rate_changed' type
-- (added in Phase 27c).
-- ============================================================

BEGIN;

-- ─── 1. employment_type: allow 'zlecenie' ─────────────────────────────────
-- The Phase 11b CHECK was added inline → auto-named profiles_employment_type_check.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_employment_type_check;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_employment_type_check
    CHECK (employment_type IN ('uop', 'b2b', 'zlecenie'));

COMMENT ON COLUMN public.profiles.employment_type IS
    'Phase 27h. Contract type: uop (umowa o pracę), b2b (faktura), zlecenie (umowa zlecenie). '
    'uop + zlecenie are paid via payroll (hours × rate); b2b settles via invoices.';

-- ─── 2. RPC: atomic batch progression insert ──────────────────────────────
-- SECURITY INVOKER (default). Called by finanse/admin server action via the
-- service-role client, which bypasses RLS; the per-row trigger still runs and
-- enforces append-only / next-month / auto-close. search_path pinned + tables
-- fully-qualified per Phase 18 hardening.
CREATE OR REPLACE FUNCTION public.set_user_rate_progression(
    p_user_id  UUID,
    p_currency TEXT,
    p_entries  JSONB,
    p_set_by   UUID,
    p_reason   TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    e             JSONB;
    inserted_cnt  INTEGER := 0;
BEGIN
    IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' OR jsonb_array_length(p_entries) = 0 THEN
        RAISE EXCEPTION 'set_user_rate_progression: p_entries must be a non-empty JSON array.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Entries must already be ascending by effective_from (caller guarantees + dedupes).
    -- The per-row trigger rejects any out-of-order / past / mid-month row, rolling back the batch.
    FOR e IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
        INSERT INTO public.user_rates (user_id, hourly_rate, currency, effective_from, set_by, reason)
        VALUES (
            p_user_id,
            (e->>'hourly_rate')::NUMERIC,
            p_currency,
            (e->>'effective_from')::DATE,
            p_set_by,
            p_reason
        );
        inserted_cnt := inserted_cnt + 1;
    END LOOP;

    RETURN inserted_cnt;
END;
$$;

COMMENT ON FUNCTION public.set_user_rate_progression IS
    'Phase 27h. Atomically inserts ascending future rate change-points for a user. '
    'Relies on the user_rates BEFORE INSERT trigger for append-only / next-month / auto-close enforcement. '
    'All-or-nothing: any rejected row rolls back the whole progression.';

COMMIT;
