-- UPDATE ROLE CONSTRAINT
-- The database seems to have an old constraint that rejects 'administrator'.
-- We strictly enforce the allowed roles here.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
ADD CONSTRAINT profiles_role_check CHECK (
        role IN (
            'consultant',
            'team_lead',
            'centrala',
            'administrator',
            'admin' -- Kept for backward compatibility
        )
    );