-- Audyt 2026-08-25 · BAZA/4 — usunięcie uśpionej polityki, która pozwalała obdarowanemu
--                              edytować własną premię (w tym KWOTĘ).
--
-- Polityka `bonuses_update_link_by_recipient` (Faza 20c, workflow „premia ↔ faktura"):
--     USING      (auth.uid() = recipient_user_id AND status IN ('pending','paid'))
--     WITH CHECK (auth.uid() = recipient_user_id AND status IN ('pending','paid'))
-- Powstała po to, żeby pracownik mógł podpiąć swoją premię pod własną fakturę. RLS jest
-- jednak WIERSZOWA, a rola `authenticated` ma GRANT UPDATE na wszystkich kolumnach —
-- polityka nie umie ograniczyć zmiany do `linked_invoice_id`. Ten sam PATCH zmieniał
-- równie dobrze `amount`, `reason` czy `notes` własnej premii.
--
-- Dziś jest to uśpione i JEST TO SPRAWDZONE, nie założone:
--   * trigger `enforce_bonus_stage_transitions` przepuszcza INSERT wyłącznie ze statusem
--     `assigned` („Legacy pending path closed in Phase 26"), więc nowy wiersz w statusie
--     `pending`/`paid` nie ma jak powstać;
--   * na produkcji (SELECT 2026-08-25) 153 premie: 141 `assigned` + 12 `cancelled`,
--     zero `pending` i zero `paid` — polityka nie obejmuje ANI JEDNEGO wiersza;
--   * obie akcje, które jej używały (`linkBonusToInvoice`, `unlinkBonus`), są od Fazy 26
--     oznaczone @deprecated i zablokowane bramką `INVOICES_ENABLED` (domyślnie wyłączona).
--
-- Dlatego kasujemy, zamiast łatać. Zostawiona „na wszelki wypadek" ożyłaby dokładnie
-- w chwili przywrócenia faktur — czyli wtedy, gdy o niej nikt już nie będzie pamiętał,
-- a w bazie pojawią się wiersze `pending` z realnymi kwotami. Jeśli workflow faktur
-- kiedyś wróci, podpięcie premii do faktury należy zrobić akcją serwerową (service-role
-- po guardzie), tak jak resztę zapisów w tym module — nie polityką dającą pracownikowi
-- UPDATE na własnym wierszu premii.
--
-- Po tej zmianie na `bonuses` zostają: SELECT (odbiorca/manager/finanse+admin),
-- INSERT (proponujący), UPDATE `bonuses_update_cancel_by_proposer` (proponujący/admin)
-- i `bonuses_update_admin`, DELETE (admin). Żadna ścieżka aplikacji nie traci dostępu.

DROP POLICY IF EXISTS "bonuses_update_link_by_recipient" ON public.bonuses;

DO $$
DECLARE v_rows int;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'bonuses'
          AND p.polname = 'bonuses_update_link_by_recipient'
    ) THEN
        RAISE EXCEPTION 'BAZA/4 nie zadziałał — polityka bonuses_update_link_by_recipient nadal istnieje';
    END IF;

    -- Gdyby w międzyczasie pojawiły się premie w starych statusach, chcemy o tym wiedzieć:
    -- ktoś reaktywował workflow faktur i musi świadomie zaprojektować dla niego zapis.
    SELECT count(*) INTO v_rows FROM public.bonuses WHERE status IN ('pending', 'paid');
    IF v_rows > 0 THEN
        RAISE WARNING 'BAZA/4: w bazie jest % premii w statusie pending/paid — workflow faktur wymaga własnej, kolumnowo bezpiecznej ścieżki zapisu.', v_rows;
    END IF;
END $$;
