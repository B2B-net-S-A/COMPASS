-- ============================================================
-- attendance_records.status — full statutory leave-type coverage
-- Date: 2026-05-29
--
-- Depends on:
--   - Phase 27k (20260527000001) — widened leave_requests.leave_type with 9
--     statutory types (on_demand, occasional, childcare, care_leave,
--     force_majeure, maternity, paternity, childrearing, blood_donation).
--   - 20260528000001_holiday_in_lieu — added holiday_in_lieu to both domains.
--
-- Fixes a latent data-integrity bug. Approving a leave runs
-- syncAttendanceFromLeave (lib/actions/internal-leave.ts), which upserts an
-- attendance_records row with status = leave_requests.leave_type. Phase 27k
-- added 9 new leave types to leave_type but NOT to attendance_records.status,
-- so approving a leave of any of those 9 types violated
-- attendance_records_status_check. The app logs but does NOT throw on the
-- upsert error, so the leave was approved while the attendance row was silently
-- dropped — leaving timesheet/attendance views inconsistent.
--
-- This recreates attendance_records_status_check with the full domain: the 9
-- pre-existing statuses plus the 9 statutory leave types (18 total). Pure
-- widening — backward-compatible. DROP + recreate makes the final state
-- deterministic regardless of any prior drift; ADD cannot fail validation
-- because the app only ever writes values within this set.
-- ============================================================

BEGIN;

ALTER TABLE public.attendance_records DROP CONSTRAINT IF EXISTS attendance_records_status_check;

ALTER TABLE public.attendance_records
    ADD CONSTRAINT attendance_records_status_check
    CHECK (status IN (
        -- ── Non-leave attendance statuses (set directly, not via leaves) ──
        'active',          -- Obecny w pracy
        'business_trip',   -- Delegacja
        -- ── Leave-derived statuses (= leave_requests.leave_type) ──
        'vacation',        -- Urlop wypoczynkowy
        'on_demand',       -- Urlop na żądanie
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
        'training',        -- Szkolenie / urlop szkoleniowy
        'holiday_in_lieu', -- Odbiór dnia za święto (UoP)
        'other'            -- Inne
    ));

COMMIT;
