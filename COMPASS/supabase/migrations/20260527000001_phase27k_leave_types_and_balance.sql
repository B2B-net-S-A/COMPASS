-- ============================================================
-- Phase 27k — Statutory leave types (full UoP / Kodeks pracy coverage)
--             + per-employee vacation entitlement (balance for UoP)
-- Date: 2026-05-27
--
-- Depends on: leave_requests (Phase 11b), profiles.
--
-- Changes:
--   1. Extend leave_requests.leave_type CHECK with statutory categories:
--      on_demand, occasional, childcare, care_leave, force_majeure,
--      maternity, paternity, childrearing, blood_donation
--      (keeps existing: vacation, sick_leave, parental_leave, unpaid_leave, training, other).
--   2. profiles: add leave_entitlement_days (annual vacation pool, NULL = no limit / B2B)
--      and leave_carried_over_days (zaległy z poprzedniego roku).
--      Vacation balance for UoP = entitlement + carried − used. Only the vacation pool
--      (leave_type IN ('vacation','on_demand')) deducts from it.
-- ============================================================

BEGIN;

-- ─── 1. leave_type CHECK — add statutory types ────────────────────────────
-- Phase 11b added the CHECK inline → auto-named leave_requests_leave_type_check.
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;

ALTER TABLE public.leave_requests
    ADD CONSTRAINT leave_requests_leave_type_check
    CHECK (leave_type IN (
        'vacation',        -- Urlop wypoczynkowy
        'on_demand',       -- Urlop na żądanie (część puli wypoczynkowej)
        'occasional',      -- Urlop okolicznościowy
        'childcare',       -- Opieka nad dzieckiem (art. 188 KP)
        'care_leave',      -- Urlop opiekuńczy
        'force_majeure',   -- Zwolnienie z powodu siły wyższej
        'sick_leave',      -- L4 / chorobowe
        'maternity',       -- Urlop macierzyński
        'paternity',       -- Urlop ojcowski
        'parental_leave',  -- Urlop rodzicielski
        'childrearing',    -- Urlop wychowawczy
        'unpaid_leave',    -- Urlop bezpłatny
        'blood_donation',  -- Krwiodawstwo
        'training',        -- Urlop szkoleniowy
        'other'            -- Inne
    ));

-- ─── 2. profiles: vacation entitlement (UoP balance) ──────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS leave_entitlement_days INTEGER
        CHECK (leave_entitlement_days IS NULL OR (leave_entitlement_days >= 0 AND leave_entitlement_days <= 366)),
    ADD COLUMN IF NOT EXISTS leave_carried_over_days NUMERIC(4,1) NOT NULL DEFAULT 0
        CHECK (leave_carried_over_days >= 0 AND leave_carried_over_days <= 366);

COMMENT ON COLUMN public.profiles.leave_entitlement_days IS
    'Phase 27k. Annual paid-vacation entitlement in working days (UoP: 20/26). NULL = no limit (B2B/zlecenie — unlimited, only request required).';
COMMENT ON COLUMN public.profiles.leave_carried_over_days IS
    'Phase 27k. Carried-over (zaległy) vacation days from the previous year. Added to entitlement when computing remaining balance.';

COMMIT;
