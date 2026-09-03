-- ============================================================
-- Program telefonów po wejściu do klienta — co 2 tygodnie przez 3 miesiące
-- Data: 2026-09-03
-- Bez BEGIN/COMMIT: apply_migration wykonuje treść we własnej transakcji.
--
-- Zależy od: contractor_success_settings (Consultant Success Hub, 20260714183425)
--
-- Po co:
--   `check_in_cadence_days` opisuje rytm WIECZNY — kolumna nie zna pojęcia
--   „przez pierwsze 90 dni częściej, potem rzadziej". Bez daty końca jedyny
--   sposób na zaostrzony rytm onboardingowy to ręczne przestawienie kadencji
--   po trzech miesiącach na 330 kartotekach, czyli w praktyce: nigdy.
--
--   Trzy kolumny zamiast jednej flagi, bo każda odpowiada na inne pytanie:
--     • started_on   — OD KIEDY (= data wejścia do klienta). Zarazem klucz
--                      idempotencji: automat zapisuje kogoś do programu tylko
--                      wtedy, gdy ta data różni się od daty ostatniego wejścia.
--                      Dzięki temu ręczne wstrzymanie monitoringu w trakcie
--                      programu nie zostaje co dobę cofnięte przez crona,
--                      a przepięcie do NOWEGO klienta otwiera nowy cykl.
--     • ends_on      — DO KIEDY trwa rytm co 2 tygodnie.
--     • completed_at — czy absolutorium (zwolnienie rytmu do 30 dni) już się
--                      wykonało. Bez tego stempla planner co dobę widziałby
--                      „program minął" i nadpisywał kadencję ustawioną ręcznie
--                      przez TCM po zakończeniu programu.
--
-- Świadomie BEZ indeksu: tabela ma 688 wierszy i jest skanowana raz na dobę
-- przez jedno zadanie. Indeks kosztowałby więcej przy zapisie, niż oszczędza.
-- ============================================================

ALTER TABLE contractor_success_settings
    ADD COLUMN IF NOT EXISTS onboarding_program_started_on   DATE,
    ADD COLUMN IF NOT EXISTS onboarding_program_ends_on      DATE,
    ADD COLUMN IF NOT EXISTS onboarding_program_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN contractor_success_settings.onboarding_program_started_on IS
    'Data wejścia do klienta, od której liczy się program telefonów onboardingowych. Zarazem klucz idempotencji automatu zapisującego do programu.';
COMMENT ON COLUMN contractor_success_settings.onboarding_program_ends_on IS
    'Ostatni dzień zaostrzonego rytmu (co 2 tygodnie). Po tej dacie planner zwalnia kadencję i stempluje onboarding_program_completed_at.';
COMMENT ON COLUMN contractor_success_settings.onboarding_program_completed_at IS
    'Kiedy program się domknął i kadencja wróciła do rytmu bieżącej opieki. NULL = program trwa albo osoba nigdy nim nie była objęta.';

-- Obie daty albo żadna; koniec nie może wypaść przed początkiem. Stempel
-- domknięcia bez dat programu znaczyłby „domknęliśmy coś, czego nie było".
ALTER TABLE contractor_success_settings
    DROP CONSTRAINT IF EXISTS contractor_success_settings_onboarding_program_window_check;
ALTER TABLE contractor_success_settings
    ADD CONSTRAINT contractor_success_settings_onboarding_program_window_check CHECK (
        (onboarding_program_started_on IS NULL AND onboarding_program_ends_on IS NULL)
        OR (
            onboarding_program_started_on IS NOT NULL
            AND onboarding_program_ends_on IS NOT NULL
            AND onboarding_program_ends_on > onboarding_program_started_on
        )
    );

ALTER TABLE contractor_success_settings
    DROP CONSTRAINT IF EXISTS contractor_success_settings_onboarding_program_completed_check;
ALTER TABLE contractor_success_settings
    ADD CONSTRAINT contractor_success_settings_onboarding_program_completed_check CHECK (
        onboarding_program_completed_at IS NULL
        OR onboarding_program_ends_on IS NOT NULL
    );

-- Samosprawdzenie: migracja, która „przeszła", ale nic nie zmieniła, jest gorsza
-- niż taka, która padła.
DO $$
DECLARE
    missing TEXT;
BEGIN
    SELECT string_agg(expected, ', ')
      INTO missing
      FROM unnest(ARRAY[
          'onboarding_program_started_on',
          'onboarding_program_ends_on',
          'onboarding_program_completed_at'
      ]) AS expected
     WHERE NOT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'contractor_success_settings'
            AND column_name = expected
     );

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Migracja nieskuteczna: brak kolumn contractor_success_settings.{%}', missing;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'contractor_success_settings_onboarding_program_window_check'
    ) THEN
        RAISE EXCEPTION 'Migracja nieskuteczna: brak ograniczenia na okno programu onboardingowego';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'contractor_success_settings_onboarding_program_completed_check'
    ) THEN
        RAISE EXCEPTION 'Migracja nieskuteczna: brak ograniczenia na stempel domknięcia programu';
    END IF;
END $$;
