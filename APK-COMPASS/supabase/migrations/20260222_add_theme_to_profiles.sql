ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS theme text DEFAULT 'inframinds'
CHECK (theme IN ('inframinds', 'qualrix', 'b2bnetwork'));
