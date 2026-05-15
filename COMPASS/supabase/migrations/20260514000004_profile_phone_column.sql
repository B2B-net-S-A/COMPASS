-- Fix-forward dla PR4 (compass#94) i PR4 v2 (compass#96).
--
-- `phone` jest referowane w `lib/m365/people-sync.ts` (UPDATE profiles SET phone=...)
-- oraz typowane w `database.types.ts` (linia 1775), ale prod DB go nie miała.
-- Pierwsze cron uruchomienie 2026-05-15 zwróciło `failed: 9` z błędem PostgREST:
--   "Could not find the 'phone' column of 'profiles' in the schema cache"
--
-- Audyt 137 plików repo vs 56 prod migracji (commit 56178ee) potwierdza drift.
-- Ten plik zamyka go dla `phone` — pozostałe pola PR4 (manager_email, department,
-- job_title, m365_synced_at) były w 20260514000002 i tam zaaplikowane prawidłowo.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN profiles.phone IS
    'Numer telefonu z Microsoft Graph (mobilePhone fallback do businessPhones[0])';
