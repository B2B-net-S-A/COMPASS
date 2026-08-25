-- Audyt 2026-08-25 · BAZA/3 — ankieta wyjściowa: właściciel i niezmiennik anonimowości.
--
-- Tabela `exit_interviews` opiera się na jednym niezmienniku, opisanym w schemacie
-- i w kodzie (lib/actions/lifecycle.ts:301): „user_id NULL = ankieta zanonimizowana".
-- Dwie rzeczy go dziś łamią.
--
-- ── (1) WITH CHECK przy wysyłce nie powtarza warunku właściciela
--
-- Polityka `exit_interviews_update_owner_submit`:
--     USING      (user_id IS NOT NULL AND user_id = auth.uid() AND status = 'scheduled')
--     WITH CHECK (status = 'submitted')
-- USING wybiera wiersz PRZED zmianą, WITH CHECK ogląda wiersz PO zmianie. Skoro po
-- stronie WITH CHECK nie ma nic o właścicielu, pracownik w trakcie offboardingu mógł
-- jednym PATCH-em przez PostgREST wysłać własną ankietę i PRZY OKAZJI przepiąć ją na
-- kolegę (`user_id` = cudze id). Trigger `enforce_exit_interview_transitions` tego nie
-- łapie — pilnuje wyłącznie przejść statusu i kompletu pól. Odpowiedzi z ankiety
-- wyjściowej (powód odejścia, NPS, ocena managera) trafiłyby wtedy do teczki innej osoby.
--
-- Nowy WITH CHECK musi mieć DWIE gałęzie, bo WITH CHECK jest liczony PO triggerach
-- BEFORE, a `enforce_exit_interview_transitions` przy `is_anonymous = TRUE` sam ustawia
-- `NEW.user_id := NULL`. Sam warunek `user_id = auth.uid()` zablokowałby więc wysyłkę
-- anonimową — czyli dokładnie tę ścieżkę, którą moduł ma chronić.
--
-- ── (2) FK ON DELETE SET NULL po cichu „anonimizuje" cudzą ankietę
--
-- `exit_interviews_user_id_fkey ... ON DELETE SET NULL` sprawia, że usunięcie profilu
-- zamienia imienną ankietę w wiersz nie do odróżnienia od anonimowej. To nie jest
-- teoria: na produkcji siedzi wiersz 5202c80e-0b54-4cf9-b81b-57e26cc1d194
-- (utworzony 2026-05-22, status `scheduled`, `is_anonymous = false`, `user_id` NULL) —
-- ślad po skasowanym koncie sprzed wdrożenia zabezpieczeń.
--
-- Ścieżka aplikacyjna jest już zamknięta: `admin_hard_delete_user` (migracja
-- 20260529000001) odmawia usunięcia konta, gdy istnieje jakikolwiek wiersz
-- `exit_interviews` wskazujący na tę osobę. RESTRICT dokłada tę samą regułę na poziomie
-- bazy, więc omija ją także skasowanie profilu w konsoli SQL czy kaskada z auth.users.
-- Kolumny „kto co zrobił" (reviewed_by, cancelled_by, invitation_sent_by,
-- manager_checklist_sent_by, manager_snapshot) zostają przy SET NULL — ich wyzerowanie
-- gubi metadane, ale żadnego niezmiennika nie łamie.
--
-- Zakres: obie zmiany są czystym zaostrzeniem. Aplikacja NIE ma dziś ekranu, który
-- wykonywałby ten UPDATE (ekran /internal/lifecycle/exit/wypelnij informuje, że
-- ankietę prowadzi TCM), a jedyna ścieżka usuwania konta i tak wcześniej odmawia.

ALTER POLICY "exit_interviews_update_owner_submit"
    ON public.exit_interviews
    WITH CHECK (
        status = 'submitted'
        AND (
            user_id = auth.uid()
            OR (is_anonymous = TRUE AND user_id IS NULL)
        )
    );

ALTER TABLE public.exit_interviews
    DROP CONSTRAINT exit_interviews_user_id_fkey;

ALTER TABLE public.exit_interviews
    ADD CONSTRAINT exit_interviews_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.exit_interviews.user_id IS
    'Autor ankiety. NULL = ankieta zanonimizowana na życzenie pracownika (trigger zeruje kolumnę przy is_anonymous=TRUE). FK celowo RESTRICT, a nie SET NULL: usunięcie profilu nie może zamienić ankiety imiennej w „anonimową" (audyt 2026-08). Konto z ankietą archiwizuje się, nie kasuje.';

DO $$
DECLARE
    v_check text;
    v_fk    text;
BEGIN
    SELECT pg_get_expr(p.polwithcheck, p.polrelid) INTO v_check
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'exit_interviews'
      AND p.polname = 'exit_interviews_update_owner_submit';

    IF v_check IS NULL OR v_check NOT ILIKE '%auth.uid()%' THEN
        RAISE EXCEPTION 'BAZA/3 nie zadziałał — WITH CHECK nadal nie sprawdza właściciela: %', coalesce(v_check, '(brak polityki)');
    END IF;

    SELECT pg_get_constraintdef(oid) INTO v_fk
    FROM pg_constraint
    WHERE conrelid = 'public.exit_interviews'::regclass
      AND conname = 'exit_interviews_user_id_fkey';

    IF v_fk IS NULL OR v_fk NOT ILIKE '%ON DELETE RESTRICT%' THEN
        RAISE EXCEPTION 'BAZA/3 nie zadziałał — FK user_id nadal: %', coalesce(v_fk, '(brak)');
    END IF;
END $$;
