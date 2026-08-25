-- Loyalty Transactions Table
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    source_id UUID,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user_id ON loyalty_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_created_at ON loyalty_transactions(created_at);
-- RLS Policies
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transactions" ON loyalty_transactions FOR
SELECT USING (auth.uid() = user_id);
-- Migration for profiles: Add loyalty columns (safe additions)
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'profiles'
        AND column_name = 'loyalty_points'
) THEN
ALTER TABLE profiles
ADD COLUMN loyalty_points INTEGER DEFAULT 0;
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'profiles'
        AND column_name = 'loyalty_tier'
) THEN
ALTER TABLE profiles
ADD COLUMN loyalty_tier TEXT DEFAULT 'bronze';
END IF;
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'profiles'
        AND column_name = 'loyalty_joined_at'
) THEN
ALTER TABLE profiles
ADD COLUMN loyalty_joined_at TIMESTAMPTZ DEFAULT NOW();
END IF;
END $$;
-- Trigger Function: Update Points and Tier
CREATE OR REPLACE FUNCTION update_loyalty_status() RETURNS TRIGGER AS $$
DECLARE new_total_points INTEGER;
new_tier TEXT;
old_tier TEXT;
BEGIN -- 1. Calculate new total points
SELECT COALESCE(SUM(points), 0) INTO new_total_points
FROM loyalty_transactions
WHERE user_id = NEW.user_id;
-- 2. Determine Tier
IF new_total_points >= 2000 THEN new_tier := 'gold';
ELSIF new_total_points >= 500 THEN new_tier := 'silver';
ELSE new_tier := 'bronze';
END IF;
-- 3. Get old tier to check for upgrade
SELECT loyalty_tier INTO old_tier
FROM profiles
WHERE id = NEW.user_id;
-- 4. Update profile
UPDATE profiles
SET loyalty_points = new_total_points,
    loyalty_tier = new_tier
WHERE id = NEW.user_id;
-- 5. Create notification on Tier Upgrade
IF new_tier != old_tier
AND (
    old_tier = 'bronze'
    AND new_tier = 'silver'
    OR old_tier = 'silver'
    AND new_tier = 'gold'
    OR old_tier = 'bronze'
    AND new_tier = 'gold'
) THEN
INSERT INTO notifications (
        user_id,
        type,
        title_pl,
        title_en,
        body_pl,
        body_en,
        priority
    )
VALUES (
        NEW.user_id,
        'loyalty_tier_up',
        'Awans w Programie Lojalnościowym!',
        'Loyalty Program Level Up!',
        'Gratulacje! Twój nowy poziom to ' || UPPER(new_tier) || '. Sprawdź nowe benefity.',
        'Congratulations! Your new level is ' || UPPER(new_tier) || '. Check out your new benefits.',
        'high'
    );
END IF;
RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Create Trigger
DROP TRIGGER IF EXISTS on_loyalty_transaction_created ON loyalty_transactions;
CREATE TRIGGER on_loyalty_transaction_created
AFTER
INSERT
    OR DELETE ON loyalty_transactions FOR EACH ROW EXECUTE FUNCTION update_loyalty_status();