-- ============================================================
-- Phase 27a — Timesheet 8h hard block + admin override
-- Date: 2026-05-20
--
-- Depends on:
--   - 20260507120001_phase11b_hr_internal_schema.sql (timesheet_entries, is_admin())
--
-- Changes:
--   1. Add columns to timesheet_entries:
--        - is_overtime_override BOOLEAN NOT NULL DEFAULT FALSE
--        - override_reason TEXT
--        - override_by UUID REFERENCES profiles(id)
--        - override_at TIMESTAMPTZ
--   2. Replace CHECK hours <= 24 with CHECK:
--        hours > 0 AND hours <= 16 AND (hours <= 8 OR is_overtime_override = TRUE)
--      Uses NOT VALID so legacy >8h rows (if any) are not blocked on migration.
--   3. Add consistency CHECK: override_* fields all-set or all-null together
--   4. Trigger enforce_overtime_override_admin_only BEFORE INSERT/UPDATE:
--        - if is_overtime_override=TRUE → override_by must be admin, reason ≥5 chars
--        - if is_overtime_override=FALSE → override_* must be NULL
--   5. Partial index on overtime override rows (audit-friendly queries)
--
-- Workflow:
--   - Standard entry: hours ≤ 8, is_overtime_override = FALSE (default)
--   - Admin override: server action sets is_overtime_override=TRUE, override_reason,
--     override_by=admin.id, override_at=NOW(); hours can be up to 16
--   - Cofnięcie: server action sets hours=8, is_overtime_override=FALSE,
--     override_* = NULL
-- ============================================================

BEGIN;

-- ─── 1. New columns ──────────────────────────────────────────────────────
ALTER TABLE timesheet_entries
    ADD COLUMN IF NOT EXISTS is_overtime_override BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS override_reason TEXT,
    ADD COLUMN IF NOT EXISTS override_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS override_at TIMESTAMPTZ;

COMMENT ON COLUMN timesheet_entries.is_overtime_override IS
    'Phase 27a. TRUE iff admin used override flow to enter >8h for this day. Allows hours up to 16h ceiling.';
COMMENT ON COLUMN timesheet_entries.override_reason IS
    'Phase 27a. Admin-provided reason for entering overtime (≥5 chars). Required iff is_overtime_override=TRUE.';
COMMENT ON COLUMN timesheet_entries.override_by IS
    'Phase 27a. UUID of admin who applied override (audit trail). Required iff is_overtime_override=TRUE.';
COMMENT ON COLUMN timesheet_entries.override_at IS
    'Phase 27a. Timestamp when override was applied. Required iff is_overtime_override=TRUE.';

-- ─── 2. Replace hours CHECK constraint ────────────────────────────────────
-- Drop the legacy 0<hours<=24 constraint
ALTER TABLE timesheet_entries
    DROP CONSTRAINT IF EXISTS timesheet_entries_hours_check;

-- Add the new constraint as NOT VALID so any legacy >8h rows are preserved.
-- New inserts/updates must comply.
ALTER TABLE timesheet_entries
    ADD CONSTRAINT timesheet_entries_hours_check
    CHECK (
        hours > 0
        AND hours <= 16
        AND (hours <= 8 OR is_overtime_override = TRUE)
    ) NOT VALID;

-- ─── 3. Consistency CHECK: override fields all-set or all-null ───────────
ALTER TABLE timesheet_entries
    DROP CONSTRAINT IF EXISTS timesheet_entries_override_consistency;

ALTER TABLE timesheet_entries
    ADD CONSTRAINT timesheet_entries_override_consistency
    CHECK (
        (is_overtime_override = FALSE
            AND override_reason IS NULL
            AND override_by IS NULL
            AND override_at IS NULL)
        OR
        (is_overtime_override = TRUE
            AND override_reason IS NOT NULL
            AND length(override_reason) >= 5
            AND length(override_reason) <= 1000
            AND override_by IS NOT NULL
            AND override_at IS NOT NULL)
    );

-- ─── 4. Trigger: enforce_overtime_override_admin_only ────────────────────
CREATE OR REPLACE FUNCTION enforce_overtime_override_admin_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    override_role TEXT;
BEGIN
    IF NEW.is_overtime_override = TRUE THEN
        -- override_by MUST exist and have role='admin'
        SELECT role::text INTO override_role
        FROM profiles
        WHERE id = NEW.override_by;

        IF override_role IS NULL THEN
            RAISE EXCEPTION 'override_by must reference an existing profile'
                USING ERRCODE = 'P0001';
        END IF;

        IF override_role <> 'admin' THEN
            RAISE EXCEPTION 'Only admin can apply overtime override (got role: %)', override_role
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS timesheet_entries_enforce_override ON timesheet_entries;
CREATE TRIGGER timesheet_entries_enforce_override
    BEFORE INSERT OR UPDATE ON timesheet_entries
    FOR EACH ROW
    EXECUTE FUNCTION enforce_overtime_override_admin_only();

-- ─── 5. Partial index for audit queries ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_entries_overtime_override
    ON timesheet_entries (override_by, override_at)
    WHERE is_overtime_override = TRUE;

COMMIT;
