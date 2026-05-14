-- Migration: Add Profile 360 columns to candidates table
-- These columns already exist on profiles, now mirrored to candidates

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS tech_stack jsonb DEFAULT '[]';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS certifications jsonb DEFAULT '[]';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS work_preferences jsonb DEFAULT '{}';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS admin_notes jsonb DEFAULT '[]';

COMMENT ON COLUMN candidates.tech_stack IS 'Array of {name, level, category} objects';
COMMENT ON COLUMN candidates.certifications IS 'Array of {name, issuer, date_obtained, expiry_date, credential_url} objects';
COMMENT ON COLUMN candidates.work_preferences IS '{preferred_locations, work_mode, min_rate, max_rate, preferred_industries, notice_period}';
COMMENT ON COLUMN candidates.admin_notes IS 'Array of {author_id, author_name, content, created_at, category} objects';
