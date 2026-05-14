-- ============================================================
-- Phase 1.1 — B2Bnetwork League: 7-tier loyalty rebrand
-- Date: 2026-05-04
--
-- Purpose: Replace 4-tier (bronze/silver/gold/platinum) with 7-tier branded ladder
-- (scout/explorer/pathfinder/navigator/captain/admiral/legend) and align thresholds
-- to: 0 / 250 / 750 / 2000 / 5000 / 10000 / 25000.
--
-- Backfill maps EXISTING `loyalty_points` to new tier (NOT old tier name) — the legacy
-- 4-tier mapping shifts boundaries (e.g. silver at 500 becomes pathfinder at 750).
--
-- Trigger `update_loyalty_status` is rebuilt with 7 thresholds AND filters
-- `WHERE status='confirmed'` (Phase 1 migration 4 adds the status column).
--
-- Idempotent: enum check + column rename safe to re-run.
-- ============================================================

BEGIN;

-- 1. Create enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loyalty_tier_t') THEN
        CREATE TYPE loyalty_tier_t AS ENUM (
            'scout',       -- 0
            'explorer',    -- 250
            'pathfinder',  -- 750
            'navigator',   -- 2000
            'captain',     -- 5000
            'admiral',     -- 10000
            'legend'       -- 25000
        );
    END IF;
END $$;

-- 2. Add new column (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'loyalty_tier_new'
    ) THEN
        ALTER TABLE profiles ADD COLUMN loyalty_tier_new loyalty_tier_t NOT NULL DEFAULT 'scout';
    END IF;
END $$;

-- 3. Backfill from current loyalty_points (ignore stale loyalty_tier text)
UPDATE profiles
SET loyalty_tier_new = CASE
    WHEN loyalty_points >= 25000 THEN 'legend'::loyalty_tier_t
    WHEN loyalty_points >= 10000 THEN 'admiral'::loyalty_tier_t
    WHEN loyalty_points >= 5000  THEN 'captain'::loyalty_tier_t
    WHEN loyalty_points >= 2000  THEN 'navigator'::loyalty_tier_t
    WHEN loyalty_points >= 750   THEN 'pathfinder'::loyalty_tier_t
    WHEN loyalty_points >= 250   THEN 'explorer'::loyalty_tier_t
    ELSE 'scout'::loyalty_tier_t
END;

-- 4. Swap column: drop old TEXT, rename new → loyalty_tier
DO $$
DECLARE
    col_type TEXT;
BEGIN
    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'loyalty_tier';

    IF col_type IS NOT NULL AND col_type != 'USER-DEFINED' THEN
        ALTER TABLE profiles DROP COLUMN loyalty_tier;
        ALTER TABLE profiles RENAME COLUMN loyalty_tier_new TO loyalty_tier;
    ELSIF col_type IS NULL THEN
        -- No old column at all (fresh DB) — just rename
        ALTER TABLE profiles RENAME COLUMN loyalty_tier_new TO loyalty_tier;
    END IF;
END $$;

-- 5. Rebuild update_loyalty_status trigger function with 7-tier branching.
-- (status filter for pending/confirmed comes in migration 4; this migration uses unconditional sum.)
CREATE OR REPLACE FUNCTION update_loyalty_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    new_total_points INTEGER;
    new_tier loyalty_tier_t;
    old_tier loyalty_tier_t;
BEGIN
    SELECT COALESCE(SUM(points), 0)
    INTO new_total_points
    FROM loyalty_transactions
    WHERE user_id = NEW.user_id;

    new_tier := CASE
        WHEN new_total_points >= 25000 THEN 'legend'::loyalty_tier_t
        WHEN new_total_points >= 10000 THEN 'admiral'::loyalty_tier_t
        WHEN new_total_points >= 5000  THEN 'captain'::loyalty_tier_t
        WHEN new_total_points >= 2000  THEN 'navigator'::loyalty_tier_t
        WHEN new_total_points >= 750   THEN 'pathfinder'::loyalty_tier_t
        WHEN new_total_points >= 250   THEN 'explorer'::loyalty_tier_t
        ELSE 'scout'::loyalty_tier_t
    END;

    SELECT loyalty_tier INTO old_tier FROM profiles WHERE id = NEW.user_id;

    UPDATE profiles
    SET loyalty_points = new_total_points,
        loyalty_tier = new_tier
    WHERE id = NEW.user_id;

    IF new_tier IS DISTINCT FROM old_tier THEN
        INSERT INTO notifications (user_id, type, title_pl, title_en, body_pl, body_en, priority, created_at)
        VALUES (
            NEW.user_id,
            'loyalty_tier_up',
            'Awans w B2Bnetwork League!',
            'Promoted in B2Bnetwork League!',
            format('Osiągnąłeś poziom %s!', new_tier::TEXT),
            format('You reached the %s tier!', new_tier::TEXT),
            'normal',
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Re-attach trigger (drop + create to ensure latest version is bound)
DROP TRIGGER IF EXISTS on_loyalty_transaction_created ON loyalty_transactions;
CREATE TRIGGER on_loyalty_transaction_created
    AFTER INSERT ON loyalty_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_loyalty_status();

COMMIT;
