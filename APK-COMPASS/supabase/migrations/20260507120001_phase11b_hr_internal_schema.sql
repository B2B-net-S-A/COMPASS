-- ============================================================
-- Phase 11b — HR Internal: schema, RLS, holidays seed
-- Date: 2026-05-07
--
-- Adds the data layer for the new "Internal" zone (attendance, vacations,
-- timesheets) used by the new `internal` role + admins. Consultants and
-- trainers have NO access at any RLS layer.
--
-- Depends on:
--   - 20260504500002_phase15_role_enum_cast.sql (user_role enum exists)
--   - 20260507120000_phase11a_internal_role_value.sql (enum has 'internal')
--   - 20260212_project_referrals.sql (update_updated_at_column() helper)
--
-- New objects:
--   helpers:        is_internal_or_admin()
--   profiles cols:  default_location, annual_leave_days, employment_type, work_start_date
--   tables:         public_holidays, attendance_records, leave_requests,
--                   timesheets, timesheet_entries
--   triggers:       updated_at on each + sick_leave auto-approve
-- ============================================================

BEGIN;

-- ─── 1. Helper function: is_internal_or_admin() ──────────────────────────
CREATE OR REPLACE FUNCTION is_internal_or_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role::TEXT IN ('admin', 'internal')
    );
$$;

COMMENT ON FUNCTION is_internal_or_admin IS
    'Phase 11. Used by /internal RLS — gate for HR module (attendance, leave, timesheets).';

-- ─── 2. Profiles extension: HR fields ────────────────────────────────────
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS default_location TEXT
        CHECK (default_location IN ('onsite', 'remote'))
        DEFAULT 'onsite',
    ADD COLUMN IF NOT EXISTS annual_leave_days INTEGER DEFAULT 26,
    ADD COLUMN IF NOT EXISTS employment_type TEXT
        CHECK (employment_type IN ('uop', 'b2b'))
        DEFAULT 'uop',
    ADD COLUMN IF NOT EXISTS work_start_date DATE;

COMMENT ON COLUMN profiles.default_location IS
    'Phase 11. Default attendance location for internal employees (onsite|remote).';
COMMENT ON COLUMN profiles.annual_leave_days IS
    'Phase 11. Annual vacation pool. 26 = Polish UoP standard.';
COMMENT ON COLUMN profiles.employment_type IS
    'Phase 11. uop = umowa o pracę, b2b = kontrakt B2B.';

-- ─── 3. public_holidays ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public_holidays (
    date     DATE PRIMARY KEY,
    name_pl  TEXT NOT NULL,
    year     INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)::INTEGER) STORED
);

CREATE INDEX IF NOT EXISTS idx_public_holidays_year ON public_holidays(year);

ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_holidays_read_all_authenticated" ON public_holidays;
CREATE POLICY "public_holidays_read_all_authenticated" ON public_holidays
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "public_holidays_write_admin" ON public_holidays;
CREATE POLICY "public_holidays_write_admin" ON public_holidays
    FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Seed PL public holidays for 2026 and 2027
INSERT INTO public_holidays (date, name_pl) VALUES
    -- 2026
    ('2026-01-01', 'Nowy Rok'),
    ('2026-01-06', 'Trzech Króli'),
    ('2026-04-05', 'Niedziela Wielkanocna'),
    ('2026-04-06', 'Poniedziałek Wielkanocny'),
    ('2026-05-01', 'Święto Pracy'),
    ('2026-05-03', 'Święto Konstytucji 3 Maja'),
    ('2026-06-04', 'Boże Ciało'),
    ('2026-08-15', 'Wniebowzięcie NMP / Święto Wojska Polskiego'),
    ('2026-11-01', 'Wszystkich Świętych'),
    ('2026-11-11', 'Narodowe Święto Niepodległości'),
    ('2026-12-25', 'Boże Narodzenie (1. dzień)'),
    ('2026-12-26', 'Boże Narodzenie (2. dzień)'),
    -- 2027
    ('2027-01-01', 'Nowy Rok'),
    ('2027-01-06', 'Trzech Króli'),
    ('2027-03-28', 'Niedziela Wielkanocna'),
    ('2027-03-29', 'Poniedziałek Wielkanocny'),
    ('2027-05-01', 'Święto Pracy'),
    ('2027-05-03', 'Święto Konstytucji 3 Maja'),
    ('2027-05-27', 'Boże Ciało'),
    ('2027-08-15', 'Wniebowzięcie NMP / Święto Wojska Polskiego'),
    ('2027-11-01', 'Wszystkich Świętych'),
    ('2027-11-11', 'Narodowe Święto Niepodległości'),
    ('2027-12-25', 'Boże Narodzenie (1. dzień)'),
    ('2027-12-26', 'Boże Narodzenie (2. dzień)')
ON CONFLICT (date) DO NOTHING;

-- ─── 4. attendance_records ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_records (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    status      TEXT NOT NULL CHECK (status IN (
                    'active', 'vacation', 'sick_leave', 'parental_leave',
                    'unpaid_leave', 'business_trip', 'training', 'other'
                )),
    location    TEXT CHECK (location IN ('onsite', 'remote')),
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE(user_id, date),
    CONSTRAINT attendance_location_only_when_active CHECK (
        (status = 'active' AND location IS NOT NULL)
        OR (status <> 'active' AND location IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance_records(user_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date);

DROP TRIGGER IF EXISTS attendance_records_updated_at ON attendance_records;
CREATE TRIGGER attendance_records_updated_at BEFORE UPDATE ON attendance_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_select_own_or_admin" ON attendance_records;
CREATE POLICY "attendance_select_own_or_admin" ON attendance_records
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "attendance_insert_self_or_admin" ON attendance_records;
CREATE POLICY "attendance_insert_self_or_admin" ON attendance_records
    FOR INSERT TO authenticated
    WITH CHECK (
        is_internal_or_admin()
        AND (auth.uid() = user_id OR is_admin())
    );

DROP POLICY IF EXISTS "attendance_update_self_or_admin" ON attendance_records;
CREATE POLICY "attendance_update_self_or_admin" ON attendance_records
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id OR is_admin())
    WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "attendance_delete_self_or_admin" ON attendance_records;
CREATE POLICY "attendance_delete_self_or_admin" ON attendance_records
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id OR is_admin());

-- Allow internal+admin to read each other's attendance for vacation calendar (team view).
DROP POLICY IF EXISTS "attendance_select_team_for_internal_admin" ON attendance_records;
CREATE POLICY "attendance_select_team_for_internal_admin" ON attendance_records
    FOR SELECT TO authenticated
    USING (
        is_internal_or_admin()
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = attendance_records.user_id
              AND p.role::TEXT IN ('internal', 'admin')
        )
    );

-- ─── 5. leave_requests ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    start_date         DATE NOT NULL,
    end_date           DATE NOT NULL CHECK (end_date >= start_date),
    leave_type         TEXT NOT NULL CHECK (leave_type IN (
                          'vacation', 'sick_leave', 'parental_leave',
                          'unpaid_leave', 'training', 'other'
                       )),
    half_day           TEXT CHECK (half_day IN ('morning', 'afternoon')),
    note               TEXT,
    documentation_url  TEXT,
    status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                          'pending', 'approved', 'rejected', 'cancelled'
                       )),
    decided_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
    decided_at         TIMESTAMPTZ,
    decision_note      TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT half_day_requires_single_day CHECK (
        half_day IS NULL OR start_date = end_date
    )
);

CREATE INDEX IF NOT EXISTS idx_leave_user_status ON leave_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_leave_pending     ON leave_requests(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_leave_dates       ON leave_requests(start_date, end_date);

DROP TRIGGER IF EXISTS leave_requests_updated_at ON leave_requests;
CREATE TRIGGER leave_requests_updated_at BEFORE UPDATE ON leave_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-approve sick_leave on insert (no admin gate; documentation upload tracked separately)
CREATE OR REPLACE FUNCTION leave_requests_auto_approve_sick()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.leave_type = 'sick_leave' AND NEW.status = 'pending' THEN
        NEW.status := 'approved';
        NEW.decided_at := NOW();
        -- decided_by left NULL (system auto-approval)
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leave_requests_auto_approve ON leave_requests;
CREATE TRIGGER leave_requests_auto_approve BEFORE INSERT ON leave_requests
    FOR EACH ROW EXECUTE FUNCTION leave_requests_auto_approve_sick();

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leave_select_own_or_admin" ON leave_requests;
CREATE POLICY "leave_select_own_or_admin" ON leave_requests
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "leave_select_team_for_internal_admin" ON leave_requests;
CREATE POLICY "leave_select_team_for_internal_admin" ON leave_requests
    FOR SELECT TO authenticated
    USING (
        is_internal_or_admin()
        AND status = 'approved'
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = leave_requests.user_id
              AND p.role::TEXT IN ('internal', 'admin')
        )
    );

DROP POLICY IF EXISTS "leave_insert_self" ON leave_requests;
CREATE POLICY "leave_insert_self" ON leave_requests
    FOR INSERT TO authenticated
    WITH CHECK (
        is_internal_or_admin()
        AND auth.uid() = user_id
    );

DROP POLICY IF EXISTS "leave_update_owner_pending_or_admin" ON leave_requests;
CREATE POLICY "leave_update_owner_pending_or_admin" ON leave_requests
    FOR UPDATE TO authenticated
    USING (
        (auth.uid() = user_id AND status = 'pending')
        OR is_admin()
    )
    WITH CHECK (
        (auth.uid() = user_id AND status IN ('pending', 'cancelled'))
        OR is_admin()
    );

DROP POLICY IF EXISTS "leave_delete_admin_only" ON leave_requests;
CREATE POLICY "leave_delete_admin_only" ON leave_requests
    FOR DELETE TO authenticated
    USING (is_admin());

-- ─── 6. timesheets ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timesheets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    year            INTEGER NOT NULL,
    month           INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                       'draft', 'submitted', 'approved', 'rejected'
                    )),
    submitted_at    TIMESTAMPTZ,
    approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at     TIMESTAMPTZ,
    rejection_note  TEXT,
    pdf_hash        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_timesheets_user_period ON timesheets(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_timesheets_status     ON timesheets(status);

DROP TRIGGER IF EXISTS timesheets_updated_at ON timesheets;
CREATE TRIGGER timesheets_updated_at BEFORE UPDATE ON timesheets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "timesheets_select_own_or_admin" ON timesheets;
CREATE POLICY "timesheets_select_own_or_admin" ON timesheets
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "timesheets_insert_self" ON timesheets;
CREATE POLICY "timesheets_insert_self" ON timesheets
    FOR INSERT TO authenticated
    WITH CHECK (
        is_internal_or_admin()
        AND auth.uid() = user_id
    );

DROP POLICY IF EXISTS "timesheets_update_draft_or_admin" ON timesheets;
CREATE POLICY "timesheets_update_draft_or_admin" ON timesheets
    FOR UPDATE TO authenticated
    USING (
        (auth.uid() = user_id AND status = 'draft')
        OR is_admin()
    )
    WITH CHECK (
        (auth.uid() = user_id AND status IN ('draft', 'submitted'))
        OR is_admin()
    );

DROP POLICY IF EXISTS "timesheets_delete_admin_only" ON timesheets;
CREATE POLICY "timesheets_delete_admin_only" ON timesheets
    FOR DELETE TO authenticated
    USING (is_admin());

-- ─── 7. timesheet_entries ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timesheet_entries (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timesheet_id  UUID NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
    work_date     DATE NOT NULL,
    hours         NUMERIC(4, 2) NOT NULL CHECK (hours > 0 AND hours <= 24),
    project       TEXT,
    description   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entries_timesheet_date ON timesheet_entries(timesheet_id, work_date);

ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;

-- Entries inherit access from parent timesheet via subselect.
DROP POLICY IF EXISTS "entries_select_via_timesheet" ON timesheet_entries;
CREATE POLICY "entries_select_via_timesheet" ON timesheet_entries
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM timesheets t
            WHERE t.id = timesheet_entries.timesheet_id
              AND (t.user_id = auth.uid() OR is_admin())
        )
    );

DROP POLICY IF EXISTS "entries_insert_via_draft_timesheet" ON timesheet_entries;
CREATE POLICY "entries_insert_via_draft_timesheet" ON timesheet_entries
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM timesheets t
            WHERE t.id = timesheet_entries.timesheet_id
              AND (
                  (t.user_id = auth.uid() AND t.status = 'draft')
                  OR is_admin()
              )
        )
    );

DROP POLICY IF EXISTS "entries_update_via_draft_timesheet" ON timesheet_entries;
CREATE POLICY "entries_update_via_draft_timesheet" ON timesheet_entries
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM timesheets t
            WHERE t.id = timesheet_entries.timesheet_id
              AND (
                  (t.user_id = auth.uid() AND t.status = 'draft')
                  OR is_admin()
              )
        )
    );

DROP POLICY IF EXISTS "entries_delete_via_draft_timesheet" ON timesheet_entries;
CREATE POLICY "entries_delete_via_draft_timesheet" ON timesheet_entries
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM timesheets t
            WHERE t.id = timesheet_entries.timesheet_id
              AND (
                  (t.user_id = auth.uid() AND t.status = 'draft')
                  OR is_admin()
              )
        )
    );

-- ─── 8. Extend audit_logs.action enum-equivalent CHECK (if present) ──────
-- audit_logs.action is TEXT (no CHECK by default). Server actions will write:
--   'ROLE_CHANGE', 'ATTENDANCE_UPDATE',
--   'LEAVE_APPROVED', 'LEAVE_REJECTED', 'LEAVE_CANCELLED',
--   'TIMESHEET_SUBMITTED', 'TIMESHEET_APPROVED', 'TIMESHEET_REJECTED', 'TIMESHEET_UNLOCKED'
-- No DDL needed; comment for reference.
COMMENT ON TABLE audit_logs IS
    'audit_logs.action TEXT extended for Phase 11 to include LEAVE_*/TIMESHEET_*/ATTENDANCE_UPDATE/ROLE_CHANGE actions.';

-- ─── 9. Cross-table read policy: profiles team roster for internal+admin ─
-- Allow internal+admin to enumerate other internal+admin profiles for
-- vacation calendar's employee list. Existing profiles policies stay intact.
DROP POLICY IF EXISTS "profiles_select_team_for_internal_admin" ON profiles;
CREATE POLICY "profiles_select_team_for_internal_admin" ON profiles
    FOR SELECT TO authenticated
    USING (
        is_internal_or_admin()
        AND role::TEXT IN ('internal', 'admin')
    );

COMMIT;
