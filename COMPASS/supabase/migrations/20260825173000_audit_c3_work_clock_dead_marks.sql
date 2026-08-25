-- Audyt 2026-08-25 · KROK C3 — oznaczenie martwej schematycznej pozostałości po Smart Work Clock (Faza 17/17b).
--
-- Ta migracja NICZEGO NIE USUWA. Usunięty został wyłącznie KOD: 5 tras `/api/clock/*`,
-- 4 zadania cykliczne `clock-*`, `lib/clock/*`, `lib/actions/internal-clock*`, wszystkie
-- komponenty zegara oraz sprzężenie zegara z timesheetem. Po tej zmianie w aplikacji nie ma
-- ANI JEDNEGO odczytu i ANI JEDNEGO zapisu do poniższych tabel i kolumn.
--
-- Stan prod w chwili usuwania (SELECT, 2026-08-25): work_clock_sessions 0, work_clock_daily 0,
-- work_clock_heartbeats 0, work_clock_consents 0, work_clock_session_pauses 0,
-- work_clock_route_metadata 0; timesheet_entries z source clock_* = 0, z tracked_hours = 0,
-- z correction_required = 0. Feature nigdy nie zebrał danych produkcyjnych.
--
-- Dlaczego SAM KOMENTARZ, a nie DROP:
--   1. Równolegle powstaje warstwa RODO (C5), która wylicza `work_clock_sessions`
--      i `work_clock_consents` jako źródła danych osoby (lib/gdpr/subject-data.ts).
--      DROP wykonany teraz wywróciłby tamten kod w locie.
--   2. `timesheets.auto_filled_at` i `timesheet_entries.source` mają 150 wierszy historii
--      (znacznik po przebiegach auto-fillu) na ŻYWEJ tabeli rozliczeniowej — kasowanie
--      kolumn tabeli, z której generowane są podpisane PDF-y, to osobna decyzja z własnym
--      oknem, nie efekt uboczny sprzątania kodu.
-- Komentarz jest po to, żeby następna osoba nie zbudowała czegoś na tym schemacie w przekonaniu,
-- że po drugiej stronie jest działający moduł.

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'work_clock_sessions', 'work_clock_daily', 'work_clock_heartbeats',
        'work_clock_consents', 'work_clock_session_pauses', 'work_clock_route_metadata'
    ] LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format(
                'COMMENT ON TABLE public.%I IS %L',
                t,
                'MARTWE (audyt 2026-08, C3). Smart Work Clock (Faza 17/17b) usunięty z kodu 2026-08-25 — brak jakiegokolwiek czytelnika i pisarza w aplikacji. Tabela pusta na produkcji; zostawiona wyłącznie dlatego, że wylicza ją warstwa RODO (art. 15) jako źródło danych osoby. Nie budować na niej nowych funkcji.'
            );
        END IF;
    END LOOP;
END $$;

DO $$
BEGIN
    IF to_regclass('public.timesheets') IS NOT NULL THEN
        COMMENT ON COLUMN public.timesheets.auto_filled_at IS
            'MARTWE (audyt 2026-08, C3). Znacznik po auto-fillu z work clocka; funkcja usunięta 2026-08-25. Nic tego już nie zapisuje ani nie czyta — 150 wierszy to historia przebiegów, które wstawiały zero wpisów.';
        COMMENT ON COLUMN public.timesheets.user_cleared_auto_fill IS
            'MARTWE (audyt 2026-08, C3) — patrz auto_filled_at.';
    END IF;
    IF to_regclass('public.timesheet_entries') IS NOT NULL THEN
        COMMENT ON COLUMN public.timesheet_entries.tracked_hours IS
            'MARTWE (audyt 2026-08, C3). Godziny z work clocka; 0 wierszy, feature usunięty 2026-08-25.';
        COMMENT ON COLUMN public.timesheet_entries.correction_required IS
            'MARTWE (audyt 2026-08, C3). Flagę ustawiał wyłącznie work clock (applyCorrectionFlag); 0 wierszy, feature usunięty 2026-08-25.';
        COMMENT ON COLUMN public.timesheet_entries.source IS
            'ŻYWE tylko dla wartości manual i leave_paid (Faza 30b). Wartości clock_suggested / clock_accepted są martwe od 2026-08-25 (audyt C3) — 0 wierszy.';
    END IF;
END $$;

DO $$
DECLARE
    missing text;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM unnest(ARRAY[
        'work_clock_sessions', 'work_clock_daily', 'work_clock_heartbeats',
        'work_clock_consents', 'work_clock_session_pauses', 'work_clock_route_metadata'
    ]) AS t
    WHERE to_regclass('public.' || t) IS NOT NULL
      AND coalesce(obj_description(('public.' || t)::regclass, 'pg_class'), '') NOT LIKE 'MARTWE (audyt 2026-08, C3)%';

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'C3 nie zadziałał — tabele bez znacznika MARTWE: %', missing;
    END IF;

    IF to_regclass('public.timesheet_entries') IS NOT NULL
       AND coalesce(col_description('public.timesheet_entries'::regclass,
             (SELECT attnum FROM pg_attribute
               WHERE attrelid = 'public.timesheet_entries'::regclass AND attname = 'correction_required')), '')
           NOT LIKE 'MARTWE (audyt 2026-08, C3)%' THEN
        RAISE EXCEPTION 'C3 nie zadziałał — timesheet_entries.correction_required bez znacznika MARTWE.';
    END IF;
END $$;
