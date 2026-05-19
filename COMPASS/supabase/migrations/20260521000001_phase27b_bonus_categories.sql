-- ============================================================
-- Phase 27b — Bonus categories + attachments
-- Date: 2026-05-21
--
-- Depends on:
--   - 20260517020001_phase23_bonuses.sql (bonuses table, RLS, helper)
--   - 20260519000001_phase26a_bonus_assigned_workflow.sql (assigned status, period columns)
--   - 20260514000002_phase19b_invoices_and_helpers.sql (is_finanse_or_admin)
--   - 20260516000002_phase20b_manager_id_and_helpers.sql (is_manager_of)
--
-- Changes:
--   1. Add `category` enum (sales, delivery_lead, recruiter, custom) — default 'custom'
--   2. Add typed columns per category (sales_*, delivery_*, recruiter_*, custom_*)
--   3. Add attachment columns (path/filename/size/mime) — optional, ≤10MB
--   4. CHECK constraints: required fields per category + no_self_delivery
--   5. Helper SQL: recruiter_bonus_for_margin, recruiter_tier_for_margin
--   6. Storage bucket 'bonus-attachments' (private, folder = {bonus_id}/)
--   7. Storage RLS: SELECT for proposer/recipient/manager_of/finanse/admin;
--      INSERT for proposer/admin only; DELETE admin only
-- ============================================================

BEGIN;

-- ─── 1. Add category dyskryminator ────────────────────────────────────────
ALTER TABLE bonuses
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'custom'
        CHECK (category IN ('sales', 'delivery_lead', 'recruiter', 'custom'));

COMMENT ON COLUMN bonuses.category IS
    'Phase 27b. Bonus category: sales | delivery_lead | recruiter | custom. Default custom for legacy records.';

-- ─── 2. Sales category columns ───────────────────────────────────────────
ALTER TABLE bonuses
    ADD COLUMN IF NOT EXISTS sales_client_name TEXT,
    ADD COLUMN IF NOT EXISTS sales_service_description TEXT;

-- ─── 3. Delivery Lead category columns ───────────────────────────────────
ALTER TABLE bonuses
    ADD COLUMN IF NOT EXISTS delivery_consultant_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS delivery_margin_amount NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS delivery_margin_percent NUMERIC(5, 2) DEFAULT 10.00
        CHECK (delivery_margin_percent IS NULL OR (delivery_margin_percent >= 0 AND delivery_margin_percent <= 100));

-- ─── 4. Recruiter category columns ───────────────────────────────────────
ALTER TABLE bonuses
    ADD COLUMN IF NOT EXISTS recruiter_margin_per_hour NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS recruiter_candidate_name TEXT,
    ADD COLUMN IF NOT EXISTS recruiter_calculated_tier SMALLINT
        CHECK (recruiter_calculated_tier IS NULL OR recruiter_calculated_tier IN (1, 2, 3));

-- ─── 5. Custom category column ───────────────────────────────────────────
ALTER TABLE bonuses
    ADD COLUMN IF NOT EXISTS custom_email_memo TEXT
        CHECK (custom_email_memo IS NULL OR length(custom_email_memo) <= 5000);

-- ─── 6. Attachment columns (all categories) ──────────────────────────────
ALTER TABLE bonuses
    ADD COLUMN IF NOT EXISTS attachment_path TEXT,
    ADD COLUMN IF NOT EXISTS attachment_filename TEXT,
    ADD COLUMN IF NOT EXISTS attachment_size_bytes INTEGER
        CHECK (attachment_size_bytes IS NULL OR (attachment_size_bytes > 0 AND attachment_size_bytes <= 10485760)),
    ADD COLUMN IF NOT EXISTS attachment_mime TEXT;

-- ─── 7. CHECK: required fields per category ──────────────────────────────
ALTER TABLE bonuses
    DROP CONSTRAINT IF EXISTS bonuses_category_fields_required;

ALTER TABLE bonuses
    ADD CONSTRAINT bonuses_category_fields_required
    CHECK (
        (category = 'sales'
            AND sales_client_name IS NOT NULL
            AND length(sales_client_name) >= 2
            AND sales_service_description IS NOT NULL
            AND length(sales_service_description) >= 3)
        OR
        (category = 'delivery_lead'
            AND delivery_consultant_id IS NOT NULL
            AND delivery_margin_amount IS NOT NULL
            AND delivery_margin_amount > 0)
        OR
        (category = 'recruiter'
            AND recruiter_margin_per_hour IS NOT NULL
            AND recruiter_margin_per_hour >= 0
            AND recruiter_candidate_name IS NOT NULL
            AND length(recruiter_candidate_name) >= 3
            AND recruiter_calculated_tier IS NOT NULL)
        OR
        (category = 'custom'
            AND (custom_email_memo IS NOT NULL OR attachment_path IS NOT NULL))
    ) NOT VALID;

-- ─── 8. CHECK: manager nie może wpisać delivery_lead na własną osobę ──────
ALTER TABLE bonuses
    DROP CONSTRAINT IF EXISTS bonuses_no_self_delivery;

ALTER TABLE bonuses
    ADD CONSTRAINT bonuses_no_self_delivery
    CHECK (
        category <> 'delivery_lead'
        OR delivery_consultant_id <> recipient_user_id
    );

-- ─── 9. Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bonuses_category ON bonuses(category);
CREATE INDEX IF NOT EXISTS idx_bonuses_delivery_consultant
    ON bonuses(delivery_consultant_id) WHERE delivery_consultant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bonuses_attachment
    ON bonuses(id) WHERE attachment_path IS NOT NULL;

-- ─── 10. Helper SQL: recruiter tier/bonus from margin ────────────────────
CREATE OR REPLACE FUNCTION recruiter_bonus_for_margin(margin NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF margin IS NULL OR margin < 0 THEN RETURN NULL; END IF;
    IF margin <= 40 THEN RETURN 1000;
    ELSIF margin < 50 THEN RETURN 1500;
    ELSE RETURN 2000;
    END IF;
END;
$$;

COMMENT ON FUNCTION recruiter_bonus_for_margin IS
    'Phase 27b. Recruiter bonus tiers based on PLN/h margin: <=40→1000, 40<x<50→1500, >=50→2000.';

CREATE OR REPLACE FUNCTION recruiter_tier_for_margin(margin NUMERIC)
RETURNS SMALLINT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF margin IS NULL OR margin < 0 THEN RETURN NULL; END IF;
    IF margin <= 40 THEN RETURN 1;
    ELSIF margin < 50 THEN RETURN 2;
    ELSE RETURN 3;
    END IF;
END;
$$;

COMMENT ON FUNCTION recruiter_tier_for_margin IS
    'Phase 27b. Recruiter tier (1/2/3) for audit, derived from PLN/h margin.';

-- ─── 11. Storage bucket: 'bonus-attachments' (private) ───────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('bonus-attachments', 'bonus-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- ─── 12. Storage RLS — folder pattern: bonus-attachments/{bonus_id}/{ts}_{filename} ──
-- SELECT: recipient, proposer, manager_of(recipient), finanse, admin
DROP POLICY IF EXISTS "bonus_attachments_select_authorized" ON storage.objects;
CREATE POLICY "bonus_attachments_select_authorized" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'bonus-attachments'
        AND EXISTS (
            SELECT 1 FROM bonuses b
            WHERE b.id::text = (storage.foldername(name))[1]
              AND (
                  b.recipient_user_id = auth.uid()
                  OR b.proposed_by = auth.uid()
                  OR is_manager_of(b.recipient_user_id)
                  OR is_finanse_or_admin()
              )
        )
    );

-- INSERT: only proposer (manager/admin via can_propose_bonus_for) — owns the upload
DROP POLICY IF EXISTS "bonus_attachments_insert_proposer" ON storage.objects;
CREATE POLICY "bonus_attachments_insert_proposer" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'bonus-attachments'
        AND EXISTS (
            SELECT 1 FROM bonuses b
            WHERE b.id::text = (storage.foldername(name))[1]
              AND (b.proposed_by = auth.uid() OR is_admin())
        )
    );

-- UPDATE: same as INSERT
DROP POLICY IF EXISTS "bonus_attachments_update_proposer" ON storage.objects;
CREATE POLICY "bonus_attachments_update_proposer" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'bonus-attachments'
        AND EXISTS (
            SELECT 1 FROM bonuses b
            WHERE b.id::text = (storage.foldername(name))[1]
              AND (b.proposed_by = auth.uid() OR is_admin())
        )
    );

-- DELETE: admin only (audit safety)
DROP POLICY IF EXISTS "bonus_attachments_delete_admin" ON storage.objects;
CREATE POLICY "bonus_attachments_delete_admin" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'bonus-attachments'
        AND is_admin()
    );

COMMIT;
