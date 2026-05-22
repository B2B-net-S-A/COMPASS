-- ============================================================
-- "Odbiór dnia za święto" (holiday_in_lieu) — nowy typ urlopu (tylko UoP)
-- Date: 2026-05-22
--
-- Depends on: Phase 27k (20260527000001) which set the 15-type leave_type CHECK.
--
-- Adds 'holiday_in_lieu' to two CHECK domains:
--   1. leave_requests.leave_type — selectable leave type.
--   2. attendance_records.status — approved leave syncs into attendance with
--      status = leave_type (syncAttendanceFromLeave), so the value must be allowed here too.
--
-- UoP-only eligibility (Kodeks pracy art. 130 §2 — odbiór za święto w dzień wolny)
-- is enforced in the application layer: createLeaveRequest / createLeaveOnBehalf
-- reject holiday_in_lieu unless profiles.employment_type = 'uop'. The CHECK only
-- widens the domain — it does not gate by employment type.
--
-- NOTE (pre-existing, out of scope): attendance_records.status still lacks the 9
-- statutory types added in Phase 27k (on_demand, occasional, childcare, …); their
-- attendance sync silently no-ops. Only holiday_in_lieu is added here.
-- ============================================================

BEGIN;

-- ─── 1. leave_requests.leave_type — add holiday_in_lieu ───────────────────
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;

ALTER TABLE public.leave_requests
    ADD CONSTRAINT leave_requests_leave_type_check
    CHECK (leave_type IN (
        'vacation',        -- Urlop wypoczynkowy
        'on_demand',       -- Urlop na żądanie
        'occasional',      -- Urlop okolicznościowy
        'childcare',       -- Opieka nad dzieckiem (art. 188 KP)
        'care_leave',      -- Urlop opiekuńczy
        'force_majeure',   -- Siła wyższa
        'sick_leave',      -- L4 / chorobowe
        'maternity',       -- Urlop macierzyński
        'paternity',       -- Urlop ojcowski
        'parental_leave',  -- Urlop rodzicielski
        'childrearing',    -- Urlop wychowawczy
        'unpaid_leave',    -- Urlop bezpłatny
        'blood_donation',  -- Krwiodawstwo
        'training',        -- Urlop szkoleniowy
        'holiday_in_lieu', -- Odbiór dnia za święto (tylko UoP — gate w aplikacji)
        'other'            -- Inne
    ));

-- ─── 2. attendance_records.status — add holiday_in_lieu ───────────────────
ALTER TABLE public.attendance_records DROP CONSTRAINT IF EXISTS attendance_records_status_check;

ALTER TABLE public.attendance_records
    ADD CONSTRAINT attendance_records_status_check
    CHECK (status IN (
        'active',          -- Obecny w pracy
        'vacation',        -- Urlop wypoczynkowy
        'sick_leave',      -- L4 / chorobowe
        'parental_leave',  -- Urlop rodzicielski
        'unpaid_leave',    -- Urlop bezpłatny
        'business_trip',   -- Delegacja
        'training',        -- Szkolenie
        'holiday_in_lieu', -- Odbiór dnia za święto (z zatwierdzonego wniosku UoP)
        'other'            -- Inne
    ));

COMMIT;
