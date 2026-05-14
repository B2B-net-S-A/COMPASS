-- ============================================================
-- Phase A1.4 — Learning Streaks (passa nauki)
-- Date: 2026-05-08
--
-- Dodaje do profiles:
--   - learning_streak_current: INT (aktualna passa w dniach)
--   - learning_streak_longest: INT (najdłuższa passa)
--   - learning_streak_last_date: DATE (ostatni dzień z aktywnością)
--
-- Plus loyalty_rule 'learning_streak_milestone' (25 pkt co 7 dni).
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPSERT na rule.
-- ============================================================

BEGIN;

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS learning_streak_current INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS learning_streak_longest INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS learning_streak_last_date DATE;

COMMENT ON COLUMN profiles.learning_streak_current IS
    'A1.4: Aktualna passa nauki w dniach (resetuje gdy user przerwie ≥1 dzień).';
COMMENT ON COLUMN profiles.learning_streak_longest IS
    'A1.4: Najdłuższa passa nauki kiedykolwiek osiągnięta przez tego usera.';
COMMENT ON COLUMN profiles.learning_streak_last_date IS
    'A1.4: Data ostatniej aktywności (lekcja ukończona). NULL = nigdy nic nie zrobił.';

-- Loyalty rule dla milestones co 7 dni
INSERT INTO loyalty_rules (code, name, description, points, category, is_active, created_at, updated_at)
VALUES (
    'learning_streak_milestone',
    'Passa nauki - 7 dni',
    'Bonus za 7 kolejnych dni z ukończoną lekcją (i kolejne wielokrotności)',
    25,
    'Development',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (code) DO UPDATE SET
    points = EXCLUDED.points,
    description = EXCLUDED.description,
    name = EXCLUDED.name,
    updated_at = NOW();

COMMIT;
