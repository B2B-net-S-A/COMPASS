-- ============================================================
-- Phase 19b — Invoices schema + helpers + triggers + RLS + Storage
-- Date: 2026-05-14
--
-- Depends on:
--   - 20260514000001_phase19a_finanse_enum.sql (enum has 'finanse')
--   - 20260507120001_phase11b_hr_internal_schema.sql (is_admin, is_internal_or_admin)
--
-- Creates:
--   helper:    is_finanse_or_admin()
--   table:     invoices (with file_hash, file_size, gating triggers)
--   triggers:  invoice gating (requires approved timesheet for period)
--              timesheet unlock guard (blocks unlock when active invoices exist)
--   RLS:       owner-or-reviewer pattern
--   storage:   bucket 'invoices' (private) + storage.objects policies
-- ============================================================

BEGIN;

-- ─── 1. Helper: is_finanse_or_admin() ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_finanse_or_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role::TEXT IN ('admin', 'finanse')
    );
$$;

COMMENT ON FUNCTION public.is_finanse_or_admin IS
    'Phase 19. Used by invoices RLS — gate for invoice review (admin OR finanse).';

REVOKE EXECUTE ON FUNCTION public.is_finanse_or_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_finanse_or_admin() TO authenticated, service_role;

-- ─── 2. invoices table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    invoice_number     TEXT NOT NULL,
    amount             NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency           TEXT NOT NULL DEFAULT 'PLN',
    issue_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date           DATE,
    period_year        INTEGER NOT NULL CHECK (period_year BETWEEN 2024 AND 2100),
    period_month       INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    file_path          TEXT NOT NULL,                       -- Supabase Storage path
    file_name          TEXT NOT NULL,                       -- original name
    file_size          INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 10485760), -- 10 MB
    file_hash          TEXT,                                -- SHA-256, populated on approve
    status             TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
    notes              TEXT,
    reviewed_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at        TIMESTAMPTZ,
    rejection_reason   TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_user            ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status          ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_period          ON invoices(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_invoices_user_period     ON invoices(user_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_invoices_pending         ON invoices(status) WHERE status = 'submitted';

DROP TRIGGER IF EXISTS invoices_updated_at ON invoices;
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE invoices IS
    'Phase 19. Internal employee invoices submitted for finance review. Gated by approved timesheet for the same period.';

-- ─── 3. Trigger: invoice requires approved timesheet (gating) ────────────
CREATE OR REPLACE FUNCTION enforce_invoice_requires_approved_timesheet()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timesheets
        WHERE user_id = NEW.user_id
          AND year = NEW.period_year
          AND month = NEW.period_month
          AND status = 'approved'
    ) THEN
        RAISE EXCEPTION 'Nie możesz wystawić faktury — timesheet za % nie jest zatwierdzony.',
            to_char(make_date(NEW.period_year, NEW.period_month, 1), 'YYYY-MM')
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_gating ON invoices;
CREATE TRIGGER trg_invoice_gating
    BEFORE INSERT OR UPDATE OF period_year, period_month
    ON invoices
    FOR EACH ROW EXECUTE FUNCTION enforce_invoice_requires_approved_timesheet();

-- ─── 4. Trigger: timesheet unlock guard (cross-table integrity) ──────────
-- Block unlocking an approved timesheet that has active (submitted/approved)
-- invoices for the same period. Admin must reject/cancel invoices first.
CREATE OR REPLACE FUNCTION enforce_no_active_invoice_on_unlock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
        IF EXISTS (
            SELECT 1 FROM invoices
            WHERE user_id = NEW.user_id
              AND period_year = NEW.year
              AND period_month = NEW.month
              AND status IN ('submitted', 'approved')
        ) THEN
            RAISE EXCEPTION 'Nie można odblokować timesheetu — istnieją aktywne faktury za %. Najpierw odrzuć/anuluj faktury.',
                to_char(make_date(NEW.year, NEW.month, 1), 'YYYY-MM')
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_timesheet_unlock_guard ON timesheets;
CREATE TRIGGER trg_timesheet_unlock_guard
    BEFORE UPDATE OF status
    ON timesheets
    FOR EACH ROW EXECUTE FUNCTION enforce_no_active_invoice_on_unlock();

-- ─── 5. RLS policies ─────────────────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- SELECT: owner sees own + reviewer (admin/finanse) sees all
DROP POLICY IF EXISTS "invoices_select_own_or_reviewer" ON invoices;
CREATE POLICY "invoices_select_own_or_reviewer" ON invoices
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR is_finanse_or_admin());

-- INSERT: only internal can submit, and only for own user_id
DROP POLICY IF EXISTS "invoices_insert_internal_own" ON invoices;
CREATE POLICY "invoices_insert_internal_own" ON invoices
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role::TEXT = 'internal'
        )
    );

-- UPDATE (owner): can update own only when status='rejected', transitioning to 'submitted'
DROP POLICY IF EXISTS "invoices_update_own_rejected" ON invoices;
CREATE POLICY "invoices_update_own_rejected" ON invoices
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id AND status = 'rejected')
    WITH CHECK (auth.uid() = user_id AND status = 'submitted');

-- UPDATE (reviewer): admin/finanse can update any status (approve/reject)
DROP POLICY IF EXISTS "invoices_update_reviewer_any" ON invoices;
CREATE POLICY "invoices_update_reviewer_any" ON invoices
    FOR UPDATE TO authenticated
    USING (is_finanse_or_admin())
    WITH CHECK (is_finanse_or_admin());

-- DELETE: admin only (audit safety)
DROP POLICY IF EXISTS "invoices_delete_admin_only" ON invoices;
CREATE POLICY "invoices_delete_admin_only" ON invoices
    FOR DELETE TO authenticated
    USING (is_admin());

-- ─── 6. Storage bucket: 'invoices' (private) ─────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — folder pattern: invoices/{user_id}/{ts}_{filename}.pdf
DROP POLICY IF EXISTS "invoices_storage_select_own_or_reviewer" ON storage.objects;
CREATE POLICY "invoices_storage_select_own_or_reviewer" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'invoices'
        AND (
            auth.uid()::text = (storage.foldername(name))[1]
            OR is_finanse_or_admin()
        )
    );

DROP POLICY IF EXISTS "invoices_storage_insert_own" ON storage.objects;
CREATE POLICY "invoices_storage_insert_own" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'invoices'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

DROP POLICY IF EXISTS "invoices_storage_update_own" ON storage.objects;
CREATE POLICY "invoices_storage_update_own" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'invoices'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

DROP POLICY IF EXISTS "invoices_storage_delete_own_or_admin" ON storage.objects;
CREATE POLICY "invoices_storage_delete_own_or_admin" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'invoices'
        AND (
            auth.uid()::text = (storage.foldername(name))[1]
            OR is_admin()
        )
    );

-- ─── 7. Audit log action types (comment only) ────────────────────────────
-- Server actions write: 'INVOICE_SUBMITTED', 'INVOICE_APPROVED', 'INVOICE_REJECTED',
-- 'INVOICE_RESUBMITTED'. audit_logs.action is TEXT, no schema change required.

COMMIT;
