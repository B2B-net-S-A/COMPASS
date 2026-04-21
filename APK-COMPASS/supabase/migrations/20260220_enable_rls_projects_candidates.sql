-- Enable RLS on projects and candidates tables
-- These tables have RLS policies defined but RLS was not enabled
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;