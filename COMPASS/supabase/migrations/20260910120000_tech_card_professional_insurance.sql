-- Mapa technologiczna (Faza 46) — nowe pole karty rozmowy:
-- „Czy konsultant IT posiada OC zawodowe?". Tri-state jawny: tak / nie / nie_wiem.
-- NULL = brak odpowiedzi (pytanie pominięte) — świadomie różny od jawnego „Nie wiem".
--
-- Pole opcjonalne (jak większość pól karty) — NIE wchodzi do matrycy finalizacji
-- (validateCardForFinalize), więc karta bez odpowiedzi nadal się finalizuje.
--
-- ⚠ Baza produkcyjna jest READ-ONLY dla sesji Claude'a — ten plik NIE jest tu
--    aplikowany. Wersję z rejestru stempluje osobno MCP apply_migration; prefiks
--    pliku ≠ wersja w rejestrze (patrz CLAUDE.md „NIGDY supabase db push").

ALTER TABLE tech_interview_cards
    ADD COLUMN IF NOT EXISTS professional_insurance TEXT
        CHECK (professional_insurance IN ('tak', 'nie', 'nie_wiem'));

COMMENT ON COLUMN tech_interview_cards.professional_insurance IS
    'Faza 46 — „Czy konsultant IT posiada OC zawodowe?": tak/nie/nie_wiem; NULL = brak odpowiedzi.';

-- ─── Samosprawdzenie: kolumna + CHECK faktycznie powstały ────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tech_interview_cards'
          AND column_name = 'professional_insurance'
    ) THEN
        RAISE EXCEPTION 'Migracja nieudana: brak kolumny tech_interview_cards.professional_insurance';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'tech_interview_cards'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%professional_insurance%'
    ) THEN
        RAISE EXCEPTION 'Migracja nieudana: brak CHECK na professional_insurance';
    END IF;
END $$;
