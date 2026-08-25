-- Audyt 2026-08-25 · KROK A4.1 — pracownik może wreszcie załączyć zwolnienie L4.
--
-- lib/actions/internal-leave.ts:531 wgrywa plik pod ścieżkę
--     leave-proofs/{user_id}/{timestamp}_{nazwa}
-- w buckecie `documents`, używając KLIENTA UŻYTKOWNIKA (createClient()), więc RLS
-- obowiązuje. Bucket `documents` miał polityki INSERT dokładnie dla czterech prefiksów:
-- cvs, app-docs, candidates, specs. Prefiksu `leave-proofs` nie obejmowała żadna.
--
-- Dowód, że to nigdy nie zadziałało: bucket `documents` miał 0 obiektów.
-- Upload kończył się `throw new Error('Upload nieudany: …')`, a ponieważ to server
-- action, użytkownik widział zamaskowane „An error occurred in the Server Components
-- render" zamiast przyczyny.
--
-- DROP ... IF EXISTS przed każdym CREATE, bo migracje aplikujemy przez MCP i sekwencja
-- bywa powtarzana — bez tego drugie przejście wywala się na 42710 w połowie.
--
-- Wzorzec polityk jest ten sam co dla `cvs` i `app-docs`: właściciel pisze i czyta
-- wyłącznie swój folder, kadry (finanse/admin) czytają wszystko — bo to one weryfikują
-- dokument przy akceptacji wniosku.

DROP POLICY IF EXISTS "leave_proofs_insert_own" ON storage.objects;
CREATE POLICY "leave_proofs_insert_own"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = 'leave-proofs'
        AND (auth.uid())::text = (storage.foldername(name))[2]
    );

DROP POLICY IF EXISTS "leave_proofs_select_own_or_hr" ON storage.objects;
CREATE POLICY "leave_proofs_select_own_or_hr"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = 'leave-proofs'
        AND (
            (auth.uid())::text = (storage.foldername(name))[2]
            OR public.is_finanse_or_admin()
        )
    );

-- Pracownik może podmienić błędnie wgrany skan, dopóki jest właścicielem folderu.
DROP POLICY IF EXISTS "leave_proofs_delete_own" ON storage.objects;
CREATE POLICY "leave_proofs_delete_own"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = 'leave-proofs'
        AND (auth.uid())::text = (storage.foldername(name))[2]
    );
