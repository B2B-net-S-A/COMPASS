-- ============================================================
-- Phase 1.1 — Pending loyalty transactions (status column)
-- Date: 2026-05-04
--
-- Purpose: Allow points to be awarded as `pending` (e.g. quiz submitted, awaiting
-- moderation) and only counted toward profile total once `confirmed`. Reversal
-- (e.g. moderation rejected after award) is `reversed`.
--
-- Trigger `update_loyalty_status` is rebuilt to filter `WHERE status='confirmed'`
-- so pending transactions do NOT inflate `profiles.loyalty_points` or trigger tier-up.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
-- ============================================================

BEGIN;

-- 1. Add status column with default 'confirmed' (existing rows are confirmed)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'loyalty_transactions' AND column_name = 'status'
    ) THEN
        ALTER TABLE loyalty_transactions
            ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed'
                CHECK (status IN ('pending', 'confirmed', 'reversed'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'loyalty_transactions' AND column_name = 'confirmed_at'
    ) THEN
        ALTER TABLE loyalty_transactions ADD COLUMN confirmed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'loyalty_transactions' AND column_name = 'reverses_id'
    ) THEN
        ALTER TABLE loyalty_transactions
            ADD COLUMN reverses_id UUID REFERENCES loyalty_transactions(id);
    END IF;
END $$;

-- 2. Backfill confirmed_at = created_at for existing confirmed rows
UPDATE loyalty_transactions
SET confirmed_at = created_at
WHERE status = 'confirmed' AND confirmed_at IS NULL;

-- 3. Index for fast pending/confirmed lookups per user
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_status_user
    ON loyalty_transactions(user_id, status);

-- 4. Rebuild trigger so SUM(points) only counts status='confirmed'
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
    WHERE user_id = NEW.user_id AND status = 'confirmed';

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
            'Awans w Dynaminds League!',
            'Promoted in Dynaminds League!',
            format('Osiągnąłeś poziom %s!', new_tier::TEXT),
            format('You reached the %s tier!', new_tier::TEXT),
            'normal',
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger needs to fire on INSERT and on UPDATE-of-status (pending→confirmed flips total)
DROP TRIGGER IF EXISTS on_loyalty_transaction_created ON loyalty_transactions;
DROP TRIGGER IF EXISTS on_loyalty_transaction_status_changed ON loyalty_transactions;

CREATE TRIGGER on_loyalty_transaction_created
    AFTER INSERT ON loyalty_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_loyalty_status();

CREATE TRIGGER on_loyalty_transaction_status_changed
    AFTER UPDATE OF status ON loyalty_transactions
    FOR EACH ROW
    WHEN (NEW.status IS DISTINCT FROM OLD.status)
    EXECUTE FUNCTION update_loyalty_status();

COMMIT;
