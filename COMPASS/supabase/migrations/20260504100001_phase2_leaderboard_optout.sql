-- ============================================================
-- Phase 2 — B2Bnetwork League refresh: leaderboard opt-out + onboarding flag
-- Date: 2026-05-04
--
-- Adds two profile flags consumed by Phase 2 UI:
--   - leaderboard_opt_out: when TRUE, profile is anonymized (or hidden) in
--     the global ranking at /league/leaderboard. Default FALSE (opt-in).
--   - onboarding_tour_done: prepared for Phase 6 (react-joyride first-login
--     tour). Default FALSE; set to TRUE after user finishes/skips the tour.
--
-- Adds partial index for leaderboard top-N query performance.
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'leaderboard_opt_out'
    ) THEN
        ALTER TABLE profiles ADD COLUMN leaderboard_opt_out BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'onboarding_tour_done'
    ) THEN
        ALTER TABLE profiles ADD COLUMN onboarding_tour_done BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_leaderboard
    ON profiles(loyalty_points DESC) WHERE leaderboard_opt_out = FALSE;

COMMIT;
