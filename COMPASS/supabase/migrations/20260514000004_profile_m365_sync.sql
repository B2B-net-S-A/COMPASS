-- PR4 — Microsoft 365 People API sync.
--
-- Pola wypełniane przez lib/m365/people-sync.ts po SSO callback oraz cron
-- weekly resync. Wszystkie nullable — sync to nice-to-have, login dalej
-- działa nawet jeśli Graph nie odpowie.
--
-- `m365_synced_at` służy jako bookmark dla cron: re-sync tylko gdy
-- ostatni sync był > 7 dni temu (cap na 1 call per user/week).

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS manager_email TEXT,
    ADD COLUMN IF NOT EXISTS department TEXT,
    ADD COLUMN IF NOT EXISTS job_title TEXT,
    ADD COLUMN IF NOT EXISTS m365_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_manager_email
    ON profiles(manager_email) WHERE manager_email IS NOT NULL;

-- Partial WHERE z NOW() jest non-IMMUTABLE → Postgres odrzuca CREATE INDEX.
-- Indeks pomaga głównie dla query "nigdy nie sync'ed" (najczęstsza ścieżka
-- crona — nowi userzy). Stale (< NOW() - 7d) idzie przez seq scan, ale to
-- 128 wierszy więc bez kosztu.
CREATE INDEX IF NOT EXISTS idx_profiles_m365_sync_never
    ON profiles(m365_synced_at)
    WHERE m365_synced_at IS NULL;

COMMENT ON COLUMN profiles.manager_email IS 'Email przełożonego pobrany z Microsoft Graph /users/{id}/manager';
COMMENT ON COLUMN profiles.department IS 'Dział pobrany z Microsoft Graph /users/{id} (department)';
COMMENT ON COLUMN profiles.job_title IS 'Stanowisko pobrane z Microsoft Graph /users/{id} (jobTitle)';
COMMENT ON COLUMN profiles.m365_synced_at IS 'Timestamp ostatniej synchronizacji profilu z Microsoft Graph';
