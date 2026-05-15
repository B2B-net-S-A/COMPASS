-- PR4 v2 — Avatar source tracking.
--
-- Po dorobieniu photo sync (compass#96 / commit follow-up) `syncProfileFromGraph`
-- zapisuje publiczny URL avatara z Azure AD do profiles.avatar_url.
-- Bez guard'a nadpisałby manualnie wgrane avatary z lib/actions/files.ts
-- (uploadAvatar / uploadCV image extraction).
--
-- Kolumna `avatar_source` rozróżnia pochodzenie:
--   - 'm365'   → ustawione przez syncPhotoFromGraph (Azure AD)
--   - 'manual' → ustawione przez uploadAvatar / CV image extraction
--   - NULL     → legacy (przed migracją, brak avatar_url)
--
-- Guard w syncProfileFromGraph: jeśli avatar_source = 'manual', nie ruszamy
-- avatar_url. User wgrał ręcznie — szanujemy decyzję.
--
-- Backfill: existing rows z avatar_url NOT NULL dostają source='manual'
-- (defensive default — chronimy obecne avatary HR przed pierwszym sync'em).

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS avatar_source TEXT;

ALTER TABLE profiles
    DROP CONSTRAINT IF EXISTS profiles_avatar_source_chk;
ALTER TABLE profiles
    ADD CONSTRAINT profiles_avatar_source_chk
    CHECK (avatar_source IS NULL OR avatar_source IN ('manual', 'm365'));

UPDATE profiles
SET avatar_source = 'manual'
WHERE avatar_url IS NOT NULL
  AND avatar_source IS NULL;

COMMENT ON COLUMN profiles.avatar_source IS
    'Pochodzenie avatar_url: manual (user upload via uploadAvatar/CV) | m365 (Microsoft Graph photo sync). NULL = brak avatara.';
