-- Audyt 2026-08-25 · BAZA/5 — „Anyone can update their own avatar" nie sprawdzało,
--                              czyj to awatar.
--
-- Polityka z 20260208_profile_updates.sql:
--     FOR UPDATE TO authenticated
--     USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = 'profiles')
-- Warunek kończy się na nazwie folderu. Każdy zalogowany mógł więc podmienić zawartość
-- KAŻDEGO pliku w `avatars/profiles/` — a bucket jest publicznie czytelny („Avatar images
-- are publicly accessible”), więc podmieniony obrazek pokazuje się wszystkim jako awatar
-- ofiary. Nazwy plików są przewidywalne (`profiles/{user_id}-{timestamp}.{ext}`,
-- lib/actions/files.ts:31) i wyciekają wprost w `profiles.avatar_url`.
--
-- Zawężamy do właściciela po prefiksie nazwy, a NIE po `storage.objects.owner`:
-- w tym projekcie kolumna `owner` jest pusta we wszystkich 18 obiektach bucketu
-- (pliki wgrywane m.in. service-rolą), więc warunek `owner = auth.uid()` zablokowałby
-- wszystko, łącznie z właścicielem.
--
-- INSERT zostaje bez zmian — świadomie. Po pierwsze, wgranie NOWEGO pliku pod cudzym
-- prefiksem nikomu nic nie podmienia (klucz jest unikalny, a `profiles.avatar_url`
-- ofiara i tak ustawia sama, we własnym wierszu). Po drugie, ścieżkę
-- `profiles/{candidateId}-extracted-…` zapisuje ADMIN przy parsowaniu CV kandydata
-- (lib/actions/files.ts:332) — warunek oparty na `auth.uid()` wywróciłby tamten import.
--
-- Ryzyko regresji zerowe: aplikacja nigdy nie robi UPDATE na obiekcie w tym buckecie.
-- `uploadAvatar` wgrywa za każdym razem nowy, ostemplowany czasem plik (INSERT),
-- a jedyny zapis z `upsert: true` (synchronizacja zdjęć z M365, lib/m365/people-sync.ts:284)
-- idzie service-rolą pod prefiks `m365/`, czyli w ogóle poza RLS.

DROP POLICY IF EXISTS "Anyone can update their own avatar" ON storage.objects;

CREATE POLICY "avatars_update_own"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'avatars'
        AND name LIKE 'profiles/' || (auth.uid())::text || '-%'
    )
    WITH CHECK (
        bucket_id = 'avatars'
        AND name LIKE 'profiles/' || (auth.uid())::text || '-%'
    );

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'storage' AND c.relname = 'objects'
          AND p.polname = 'Anyone can update their own avatar'
    ) THEN
        RAISE EXCEPTION 'BAZA/5 nie zadziałał — stara polityka awatarów nadal istnieje';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'storage' AND c.relname = 'objects'
          AND p.polname = 'avatars_update_own'
          AND pg_get_expr(p.polqual, p.polrelid) ILIKE '%auth.uid()%'
    ) THEN
        RAISE EXCEPTION 'BAZA/5 nie zadziałał — brak polityki avatars_update_own sprawdzającej właściciela';
    END IF;
END $$;
