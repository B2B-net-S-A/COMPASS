-- ============================================================
-- Phase 30 — Pula płatnych urlopów dla B2B/zlecenie
--            (paid vacation pool for B2B/zlecenie contractors)
-- Date: 2026-06-01
--
-- Depends on:
--   - Phase 27k (leave_entitlement_days / leave_carried_over_days)
--   - Phase 27h (employment_type ∈ {uop, b2b, zlecenie})
--   - Phase 29 (B2B/zlecenie tylko vacation — trigger blocks others)
--
-- Context: niektórzy B2B/zlecenie pracownicy mają wynegocjowany w kontrakcie
-- benefit "płatnych urlopów" (np. 20 dni rocznie). Phase 27k zbudował już
-- infrastrukturę pool tracking (leave_entitlement_days + helpery + UI) — ale
-- TYLKO dla UoP. Phase 30 odgate'owuje to dla B2B/zlecenie + dodaje:
--   1) leave_used_initial_days — hybrydowy backfill (admin wpisuje ile już zużyto)
--   2) leave_requests.paid_days / unpaid_days — split per wniosek (auto-split
--      dla B2B/zlecenie gdy wniosek przekracza pulę)
--
-- Świadomie NIE robimy:
--   - Triggera walidującego paid_days + unpaid_days = working_days (computation
--     świąt PL w PG SQL jest pain; walidacja w app layer via computePaidUnpaidSplit)
--   - Backfilla historycznych leave_requests (zostają z 0/0; admin użyje
--     leave_used_initial_days per pracownik jeśli chce uwzględnić historię)
-- ============================================================

BEGIN;

-- ─── 1. Update comment — pula dotyczy każdego employment_type ──────────────
COMMENT ON COLUMN public.profiles.leave_entitlement_days IS
    'Phase 30. Annual paid-vacation entitlement in working days. Set per user by admin. '
    'NULL = no pool (default for B2B/zlecenie when no benefit negotiated; UoP NULL = unlimited per Phase 27k). '
    'For UoP: hard limit (request blocked on overshoot via Phase 27k validation; pracownik musi użyć leave_type=unpaid_leave). '
    'For B2B/zlecenie: auto-split (paid_days from pool, unpaid_days remainder, w jednym leave_request — bo PR #179 blokuje inne leave_types dla nich).';

-- ─── 2. Hybrydowy backfill — admin-set "already used" days ─────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS leave_used_initial_days NUMERIC(4,1) NOT NULL DEFAULT 0
        CHECK (leave_used_initial_days >= 0 AND leave_used_initial_days <= 366);

COMMENT ON COLUMN public.profiles.leave_used_initial_days IS
    'Phase 30. Hybrid backfill: days already consumed before feature was enabled for this user. '
    'Subtracted from pool balance: remaining = entitlement + carried - used_initial - tracked_used. '
    'Admin wpisuje przy włączeniu puli w trakcie roku (np. "pula 20, wpisz 5 zużyte → balance 15").';

-- ─── 3. Split tracking on leave_requests ───────────────────────────────────
ALTER TABLE public.leave_requests
    ADD COLUMN IF NOT EXISTS paid_days NUMERIC(4,1) NOT NULL DEFAULT 0
        CHECK (paid_days >= 0 AND paid_days <= 366),
    ADD COLUMN IF NOT EXISTS unpaid_days NUMERIC(4,1) NOT NULL DEFAULT 0
        CHECK (unpaid_days >= 0 AND unpaid_days <= 366);

COMMENT ON COLUMN public.leave_requests.paid_days IS
    'Phase 30. Working days drawn from paid vacation pool (leave_entitlement_days + carried - used_initial). '
    'Computed at INSERT/approve time by app layer (computePaidUnpaidSplit). '
    'For UoP vacation/on_demand: paid_days = requested_working_days (pool hard-limit, validation blocks overflow). '
    'For B2B/zlecenie vacation with pool: paid_days = min(requested, remaining_pool). '
    'For employees without pool (entitlement IS NULL): paid_days = 0.';

COMMENT ON COLUMN public.leave_requests.unpaid_days IS
    'Phase 30. Working days NOT covered by pool. paid_days + unpaid_days = total working days '
    '(weekendy/święta wyłączone). For B2B/zlecenie with overshoot: unpaid_days = requested - paid_days. '
    'For B2B/zlecenie without pool: unpaid_days = requested. '
    'For non-vacation leave types: 0/0 (out of scope of paid vacation pool).';

-- ─── 4. Partial index dla queries SUM(paid_days) per user/year ─────────────
-- Przyspieszy getMyLeaveBalance + listPendingLeaveRequests w sekcji puli.
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_year_pool
    ON public.leave_requests (user_id, start_date)
    WHERE leave_type IN ('vacation', 'on_demand') AND status IN ('approved', 'pending');

COMMIT;
