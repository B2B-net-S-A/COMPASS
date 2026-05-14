-- ============================================================
-- Phase 1.1 — Archive legacy ATS tables to compass_legacy schema
-- Date: 2026-05-04
--
-- Purpose: Compass pivots from ATS to consultant retention platform.
-- Tables for candidates, market rates, referrals, and bulk imports
-- are no longer queried by application code (Phase 1.0 deletes).
-- We MOVE them to a dedicated `compass_legacy` schema rather than DROP
-- so audit/legal data is preserved for at least 12 months.
--
-- Idempotent: IF EXISTS clauses + schema move only when source schema is `public`.
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS compass_legacy;
COMMENT ON SCHEMA compass_legacy IS
    'Archive of pre-2026-05 ATS tables (candidates, rates, referrals, imports). Read-only for audit. Phase 1.1 (2026-05-04).';

-- Move tables only if they exist in `public` schema
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'candidates') THEN
        EXECUTE 'ALTER TABLE public.candidates SET SCHEMA compass_legacy';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'market_rates') THEN
        EXECUTE 'ALTER TABLE public.market_rates SET SCHEMA compass_legacy';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rate_verifications') THEN
        EXECUTE 'ALTER TABLE public.rate_verifications SET SCHEMA compass_legacy';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'centrala_referrals') THEN
        EXECUTE 'ALTER TABLE public.centrala_referrals SET SCHEMA compass_legacy';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'import_batches') THEN
        EXECUTE 'ALTER TABLE public.import_batches SET SCHEMA compass_legacy';
    END IF;
    -- Defensive: also archive `project_referrals` if it exists in public (Phase 0 sidebar drops it).
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_referrals') THEN
        EXECUTE 'ALTER TABLE public.project_referrals SET SCHEMA compass_legacy';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rate_change_log') THEN
        EXECUTE 'ALTER TABLE public.rate_change_log SET SCHEMA compass_legacy';
    END IF;
END $$;

-- Disable RLS on archive (no app reads it; only DBA via service role for audit).
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'compass_legacy'
    LOOP
        EXECUTE format('ALTER TABLE compass_legacy.%I DISABLE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;

-- Drop legacy candidate-sync functions (no app caller after Phase 1.0).
DROP FUNCTION IF EXISTS sync_candidate_to_profile() CASCADE;
DROP FUNCTION IF EXISTS sync_candidate_to_profile(UUID) CASCADE;
DROP FUNCTION IF EXISTS match_candidates(UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS match_candidates(VECTOR, FLOAT, INT) CASCADE;
DROP FUNCTION IF EXISTS match_projects(VECTOR, FLOAT, INT) CASCADE;

COMMIT;
