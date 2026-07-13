-- Profile 360° — Tech Stack, Certyfikaty, Preferencje pracy, Notatki admina
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tech_stack jsonb DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS certifications jsonb DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS work_preferences jsonb DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_notes jsonb DEFAULT '[]';

COMMENT ON COLUMN profiles.tech_stack IS 'Array of {name, level, category} objects';
COMMENT ON COLUMN profiles.certifications IS 'Array of {name, issuer, date_obtained, expiry_date, credential_url} objects';
COMMENT ON COLUMN profiles.work_preferences IS '{preferred_locations, work_mode, min_rate, max_rate, preferred_industries, notice_period}';
COMMENT ON COLUMN profiles.admin_notes IS 'Array of {author_id, author_name, content, created_at, category} objects';

-- ROLLBACK:
-- ALTER TABLE profiles DROP COLUMN IF EXISTS tech_stack;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS certifications;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS work_preferences;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS admin_notes;
