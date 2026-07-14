-- ============================================================
-- Migration: Centrala Management System (Phase 1 MVP)
-- Date: 2026-02-19
-- Description: Adds consultant assignment system for B2B.net
--   - Extends centrala_access_list with centrala_role and access_mode
--   - Creates consultant_assignments table (many-to-many)
--   - Adds RLS policies for secure access
-- ============================================================

-- ============================================================
-- 1. Extend centrala_access_list
-- ============================================================

-- Add centrala_role column (recruiter, delivery_lead, finance)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'centrala_access_list' AND column_name = 'centrala_role'
    ) THEN
        ALTER TABLE centrala_access_list ADD COLUMN centrala_role TEXT DEFAULT 'recruiter';
        ALTER TABLE centrala_access_list ADD CONSTRAINT centrala_access_list_role_check
            CHECK (centrala_role IN ('recruiter', 'delivery_lead', 'finance'));
    END IF;
END $$;

-- Add access_mode column (portfolio = only assigned, full = see all)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'centrala_access_list' AND column_name = 'access_mode'
    ) THEN
        ALTER TABLE centrala_access_list ADD COLUMN access_mode TEXT DEFAULT 'portfolio';
        ALTER TABLE centrala_access_list ADD CONSTRAINT centrala_access_list_mode_check
            CHECK (access_mode IN ('portfolio', 'full'));
    END IF;
END $$;

-- Add full_name column for display purposes
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'centrala_access_list' AND column_name = 'full_name'
    ) THEN
        ALTER TABLE centrala_access_list ADD COLUMN full_name TEXT;
    END IF;
END $$;

-- Set finance users to full access by default
-- (Will be applied to existing rows if any have centrala_role = 'finance')
UPDATE centrala_access_list SET access_mode = 'full' WHERE centrala_role = 'finance';

-- ============================================================
-- 2. Create consultant_assignments table
-- ============================================================

CREATE TABLE IF NOT EXISTS consultant_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The consultant being assigned
    consultant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- The centrala member this consultant is assigned to
    assigned_to UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Type of assignment
    assignment_type TEXT NOT NULL DEFAULT 'recruiter'
        CHECK (assignment_type IN ('recruiter', 'delivery_lead')),

    -- Who made this assignment (admin)
    assigned_by UUID REFERENCES profiles(id),

    -- Optional notes
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate assignments of the same type
    UNIQUE(consultant_id, assigned_to, assignment_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_consultant_assignments_consultant
    ON consultant_assignments(consultant_id);
CREATE INDEX IF NOT EXISTS idx_consultant_assignments_assigned_to
    ON consultant_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_consultant_assignments_type
    ON consultant_assignments(assignment_type);

-- ============================================================
-- 3. RLS Policies for consultant_assignments
-- ============================================================

ALTER TABLE consultant_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'consultant_assignments'
        AND policyname = 'Admins manage all assignments'
    ) THEN
        CREATE POLICY "Admins manage all assignments" ON consultant_assignments
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('administrator', 'admin')
                )
            );
    END IF;
END $$;

-- Centrala users can read their own assignments
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'consultant_assignments'
        AND policyname = 'Centrala users read own assignments'
    ) THEN
        CREATE POLICY "Centrala users read own assignments" ON consultant_assignments
            FOR SELECT
            USING (assigned_to = auth.uid());
    END IF;
END $$;

-- ============================================================
-- 4. Add index on centrala_access_list for lookups
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_centrala_access_list_email
    ON centrala_access_list(email);

-- ============================================================
-- Done
-- ============================================================
