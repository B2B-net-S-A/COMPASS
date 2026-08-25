-- Kolumna phone w profiles (dla zapisu z Mój Profil / AdminProfileSection)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN public.profiles.phone IS 'Numer telefonu z profilu użytkownika';
