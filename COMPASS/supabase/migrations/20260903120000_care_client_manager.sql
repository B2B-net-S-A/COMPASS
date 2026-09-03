-- ============================================================
-- Opieka TCM — manager konsultanta po stronie klienta
-- Data: 2026-09-03
--
-- Zależy od: contractors (Faza 33a)
--
-- Po co:
--   TCM pytają konsultanta o jego przełożonego u klienta podczas rozmów, ale nie
--   było gdzie tego zapisać na kartotece. Formularz wywiadu onboardingowego ma
--   pole `client_manager_name` od Fazy 33c — tyle że tabela
--   `contractor_onboarding_interviews` jest PUSTA (0 wierszy, stan 2026-09-03),
--   więc w praktyce te dane nigdzie w systemie nie istniały. Jedynym źródłem był
--   arkusz Excel prowadzony ręcznie.
--
--   Kolumna trafia na `contractors`, a nie na wywiad, bo pytanie „kto jest jego
--   managerem" dotyczy stanu BIEŻĄCEGO i zmienia się przy przepięciu do innego
--   projektu, natomiast wywiad jest zapisem jednej rozmowy w czasie. Filtr na
--   liście opieki musi pokazywać stan na dziś.
--
-- Świadomie TEXT, nie FK: to pracownik KLIENTA (Nordea, BNP), nie użytkownik
-- Compassa — nie mamy dla niego rekordu i nie chcemy go zakładać.
-- ============================================================

BEGIN;

ALTER TABLE contractors
    ADD COLUMN IF NOT EXISTS client_manager_name TEXT;

COMMENT ON COLUMN contractors.client_manager_name IS
    'Przełożony konsultanta po stronie klienta (line manager). Pracownik klienta, nie użytkownik Compassa — stąd tekst, nie FK. Stan bieżący; zmienia się przy przepięciu do innego projektu.';

-- Filtr „pokaż konsultantów managera X" skanuje po znormalizowanej formie.
CREATE INDEX IF NOT EXISTS idx_contractors_client_manager
    ON contractors (lower(trim(client_manager_name)))
    WHERE client_manager_name IS NOT NULL;

-- Samosprawdzenie: migracja, która „przeszła", ale nic nie zmieniła, jest gorsza
-- niż taka, która padła.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'contractors'
          AND column_name = 'client_manager_name'
    ) THEN
        RAISE EXCEPTION 'Migracja nieskuteczna: brak kolumny contractors.client_manager_name';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_contractors_client_manager'
    ) THEN
        RAISE EXCEPTION 'Migracja nieskuteczna: brak indeksu idx_contractors_client_manager';
    END IF;
END $$;

COMMIT;
