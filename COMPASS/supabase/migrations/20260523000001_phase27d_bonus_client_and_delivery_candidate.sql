-- ============================================================
-- Phase 27d — Bonus client dropdown + delivery candidate
-- Date: 2026-05-23
--
-- Depends on:
--   - 20260521000001_phase27b_bonus_categories.sql (bonuses category columns)
--   - is_admin(), is_finanse_or_admin(), is_internal_or_admin()
--
-- Changes:
--   1. New table `clients` (predefined client dropdown) + seed + RLS
--   2. bonuses: ADD client_name (sales/delivery/recruiter), delivery_candidate_name
--   3. Rewrite CHECK bonuses_category_fields_required:
--        - sales: client_name + sales_service_description
--        - delivery_lead: client_name + delivery_candidate_name + delivery_margin_amount
--        - recruiter: client_name + recruiter_candidate_name + recruiter_margin_per_hour + tier
--        - custom: custom_email_memo OR attachment
--   4. Drop bonuses_no_self_delivery (delivery_consultant_id no longer used; candidate is free-text)
--
-- Legacy columns kept nullable (prod had 0 bonuses): sales_client_name, delivery_consultant_id.
-- ============================================================

BEGIN;

-- ─── 1. Table: clients ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE CHECK (length(trim(name)) >= 1),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE clients IS
    'Phase 27d. Predefined client list for bonus category dropdowns (sales/delivery/recruiter). Editable by admin/finanse.';

CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active) WHERE is_active = TRUE;

-- Seed initial client list (idempotent — ON CONFLICT skips dupes).
INSERT INTO clients (name) VALUES
    ('Alior'), ('ATOS'), ('Bank Pocztowy'), ('BIK'), ('BNP Cardif'),
    ('BNP CIB'), ('BNP Paribas'), ('BOSCH'), ('Cancer Center'), ('Carrefour'),
    ('Cyfrowy Polsat'), ('ERGO'), ('ERSTE / Santander'), ('EY'), ('e-zdrowie'),
    ('Grupa Dealer'), ('KIR'), ('Metlife'), ('Ministerstwo Sprawiedliwości'),
    ('mLeasing'), ('Mnisterstwo'), ('Nationale Nederlanden'), ('NBP'), ('Nordea'),
    ('NORI'), ('ORLEN'), ('PEFRON'), ('PEKAO'), ('PGE'), ('PKO BP'),
    ('Polkomtel'), ('RITS'), ('Samsung'), ('VeloBank'), ('Wedel'), ('XPERI')
ON CONFLICT (name) DO NOTHING;

-- ─── 2. RLS on clients ─────────────────────────────────────────────────────
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- SELECT: any HR-zone user (so managers can pick a client when assigning bonuses).
DROP POLICY IF EXISTS "clients_select_hr_zone" ON clients;
CREATE POLICY "clients_select_hr_zone" ON clients
    FOR SELECT TO authenticated
    USING (is_internal_or_admin());

-- INSERT/UPDATE/DELETE: admin + finanse only.
DROP POLICY IF EXISTS "clients_insert_admin_finanse" ON clients;
CREATE POLICY "clients_insert_admin_finanse" ON clients
    FOR INSERT TO authenticated
    WITH CHECK (is_finanse_or_admin());

DROP POLICY IF EXISTS "clients_update_admin_finanse" ON clients;
CREATE POLICY "clients_update_admin_finanse" ON clients
    FOR UPDATE TO authenticated
    USING (is_finanse_or_admin())
    WITH CHECK (is_finanse_or_admin());

DROP POLICY IF EXISTS "clients_delete_admin_finanse" ON clients;
CREATE POLICY "clients_delete_admin_finanse" ON clients
    FOR DELETE TO authenticated
    USING (is_finanse_or_admin());

-- ─── 3. bonuses: new columns ───────────────────────────────────────────────
ALTER TABLE bonuses
    ADD COLUMN IF NOT EXISTS client_name TEXT,
    ADD COLUMN IF NOT EXISTS delivery_candidate_name TEXT;

COMMENT ON COLUMN bonuses.client_name IS
    'Phase 27d. Client name (free text, usually from clients table dropdown). Used by sales/delivery/recruiter categories.';
COMMENT ON COLUMN bonuses.delivery_candidate_name IS
    'Phase 27d. Candidate name for delivery_lead bonus (free text, replaces consultant dropdown).';

-- ─── 4. Rewrite category-required CHECK ────────────────────────────────────
ALTER TABLE bonuses
    DROP CONSTRAINT IF EXISTS bonuses_category_fields_required;

ALTER TABLE bonuses
    ADD CONSTRAINT bonuses_category_fields_required
    CHECK (
        (category = 'sales'
            AND client_name IS NOT NULL
            AND length(client_name) >= 2
            AND sales_service_description IS NOT NULL
            AND length(sales_service_description) >= 3)
        OR
        (category = 'delivery_lead'
            AND client_name IS NOT NULL
            AND length(client_name) >= 2
            AND delivery_candidate_name IS NOT NULL
            AND length(delivery_candidate_name) >= 3
            AND delivery_margin_amount IS NOT NULL
            AND delivery_margin_amount > 0)
        OR
        (category = 'recruiter'
            AND client_name IS NOT NULL
            AND length(client_name) >= 2
            AND recruiter_margin_per_hour IS NOT NULL
            AND recruiter_margin_per_hour >= 0
            AND recruiter_candidate_name IS NOT NULL
            AND length(recruiter_candidate_name) >= 3
            AND recruiter_calculated_tier IS NOT NULL)
        OR
        (category = 'custom'
            AND (custom_email_memo IS NOT NULL OR attachment_path IS NOT NULL))
    ) NOT VALID;

-- ─── 5. Drop obsolete no_self_delivery (consultant_id no longer required) ───
ALTER TABLE bonuses
    DROP CONSTRAINT IF EXISTS bonuses_no_self_delivery;

-- Index for client_name reporting.
CREATE INDEX IF NOT EXISTS idx_bonuses_client_name
    ON bonuses(client_name) WHERE client_name IS NOT NULL;

COMMIT;
