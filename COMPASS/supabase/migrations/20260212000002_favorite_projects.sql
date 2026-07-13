-- Create favorite_projects table
CREATE TABLE IF NOT EXISTS favorite_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Ensure a user can only favorite a project once
    UNIQUE(user_id, project_id)
);
-- Enable RLS
ALTER TABLE favorite_projects ENABLE ROW LEVEL SECURITY;
-- Select policy: users can see their own favorites
CREATE POLICY "Users can view own favorite projects" ON favorite_projects FOR
SELECT USING (auth.uid() = user_id);
-- Insert policy: users can favorite projects for themselves
CREATE POLICY "Users can insert own favorite projects" ON favorite_projects FOR
INSERT WITH CHECK (auth.uid() = user_id);
-- Delete policy: users can remove their own favorites
CREATE POLICY "Users can delete own favorite projects" ON favorite_projects FOR DELETE USING (auth.uid() = user_id);
-- Update policy: users can update notes on their own favorites
CREATE POLICY "Users can update own favorite project notes" ON favorite_projects FOR
UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);