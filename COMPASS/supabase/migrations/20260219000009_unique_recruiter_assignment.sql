-- ============================================================
-- Migration: Unique Recruiter Assignment Constraint
-- Date: 2026-02-19
-- Description: Ensures each consultant can have at most ONE recruiter.
--   Delivery Lead assignments remain unrestricted.
--   Uses a partial unique index (not a full table constraint).
-- ============================================================

-- A consultant can only be assigned to ONE recruiter.
-- Delivery leads are NOT limited — a consultant may be assigned
-- to both a recruiter AND a delivery lead simultaneously.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_consultant_recruiter
    ON consultant_assignments(consultant_id)
    WHERE assignment_type = 'recruiter';

-- Allow consultants to read their own assignments
-- (so they can see their assigned recruiter / DL)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'consultant_assignments'
        AND policyname = 'Consultants read own assignments'
    ) THEN
        CREATE POLICY "Consultants read own assignments" ON consultant_assignments
            FOR SELECT
            USING (consultant_id = auth.uid());
    END IF;
END $$;
