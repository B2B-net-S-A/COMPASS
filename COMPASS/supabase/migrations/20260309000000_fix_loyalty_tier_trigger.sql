-- Fix: Align DB trigger tier thresholds with TIER_CONFIG and add Platinum tier
-- TIER_CONFIG (single source of truth): Bronze 0, Silver 500, Gold 2000, Platinum 5000

CREATE OR REPLACE FUNCTION update_loyalty_status() RETURNS TRIGGER AS $$
DECLARE
    new_total_points INTEGER;
    new_tier TEXT;
    old_tier TEXT;
BEGIN
    -- 1. Calculate new total points
    SELECT COALESCE(SUM(points), 0) INTO new_total_points
    FROM loyalty_transactions
    WHERE user_id = NEW.user_id;

    -- 2. Determine Tier (aligned with TIER_CONFIG in lib/actions/loyalty.ts)
    IF new_total_points >= 5000 THEN
        new_tier := 'platinum';
    ELSIF new_total_points >= 2000 THEN
        new_tier := 'gold';
    ELSIF new_total_points >= 500 THEN
        new_tier := 'silver';
    ELSE
        new_tier := 'bronze';
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
    IF new_tier != COALESCE(old_tier, 'bronze') AND (
        (old_tier = 'bronze' AND new_tier IN ('silver', 'gold', 'platinum')) OR
        (old_tier = 'silver' AND new_tier IN ('gold', 'platinum')) OR
        (old_tier = 'gold' AND new_tier = 'platinum')
    ) THEN
        BEGIN
            INSERT INTO notifications (user_id, type, title, message)
            VALUES (
                NEW.user_id,
                'loyalty_upgrade',
                'Awans w Programie Lojalnościowym!',
                'Gratulacje! Twój nowy poziom to ' || UPPER(new_tier) || ' (' || new_total_points || ' pkt).'
            );
        EXCEPTION WHEN OTHERS THEN
            -- notifications table might not exist — non-blocking
            NULL;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
