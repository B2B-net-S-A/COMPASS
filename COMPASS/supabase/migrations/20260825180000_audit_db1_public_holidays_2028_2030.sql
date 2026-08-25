-- Audyt 2026-08-25 · BAZA/1 — kalendarz świąt kończył się na 2027.
--
-- `public_holidays` to jedyne źródło dni wolnych dla całej strefy HR: liczenie dni
-- roboczych urlopu i podziału płatny/bezpłatny (lib/hr/working-days.ts,
-- lib/actions/internal-leave.ts), blokady w karcie pracy, eksport payrollu
-- (app/api/internal/payroll-export/route.ts), data powrotu w autoresponderze OOF
-- (lib/mailbox/oof-template.ts) oraz „pominięty dzień roboczy" w monitoringu prawnym
-- (lib/legal-monitor/health.ts).
--
-- Stan na produkcji (SELECT 2026-08-25): 2026 → 12 wpisów, 2027 → 12 wpisów, dalej NIC.
-- Tabelę wypełniła jednorazowo migracja 20260507120001_phase11b_hr_internal_schema.sql
-- i nie ma ŻADNEGO procesu, który by ją uzupełniał — ani zadania cyklicznego, ani ekranu
-- w panelu. Brak roku nie powoduje błędu: kod po prostu nie znajduje żadnego święta
-- i liczy 1 stycznia jako zwykły dzień roboczy. To awaria cicha — wniosek urlopowy
-- „zjadłby" z puli dzień więcej, a payroll pokazałby zawyżoną liczbę dni roboczych.
--
-- Dosypujemy trzy lata (2028–2030). Święta ruchome wyliczone z Wielkanocy:
--   Poniedziałek Wielkanocny = Wielkanoc + 1, Boże Ciało = Wielkanoc + 60.
--   Wielkanoc: 2028-04-16, 2029-04-01, 2030-04-21.
-- Samosprawdzenie na końcu weryfikuje obie te reguły oraz komplet 12 dni na rok,
-- więc literówka w dacie wywali migrację, a nie wyjdzie po latach w rozliczeniu.
--
-- Kolumna `year` jest GENERATED ALWAYS z `date` — wstawiamy wyłącznie (date, name_pl).

INSERT INTO public.public_holidays (date, name_pl) VALUES
    -- 2028 (Wielkanoc 16 kwietnia)
    ('2028-01-01', 'Nowy Rok'),
    ('2028-01-06', 'Trzech Króli'),
    ('2028-04-16', 'Niedziela Wielkanocna'),
    ('2028-04-17', 'Poniedziałek Wielkanocny'),
    ('2028-05-01', 'Święto Pracy'),
    ('2028-05-03', 'Święto Konstytucji 3 Maja'),
    ('2028-06-15', 'Boże Ciało'),
    ('2028-08-15', 'Wniebowzięcie NMP / Święto Wojska Polskiego'),
    ('2028-11-01', 'Wszystkich Świętych'),
    ('2028-11-11', 'Narodowe Święto Niepodległości'),
    ('2028-12-25', 'Boże Narodzenie (1. dzień)'),
    ('2028-12-26', 'Boże Narodzenie (2. dzień)'),
    -- 2029 (Wielkanoc 1 kwietnia)
    ('2029-01-01', 'Nowy Rok'),
    ('2029-01-06', 'Trzech Króli'),
    ('2029-04-01', 'Niedziela Wielkanocna'),
    ('2029-04-02', 'Poniedziałek Wielkanocny'),
    ('2029-05-01', 'Święto Pracy'),
    ('2029-05-03', 'Święto Konstytucji 3 Maja'),
    ('2029-05-31', 'Boże Ciało'),
    ('2029-08-15', 'Wniebowzięcie NMP / Święto Wojska Polskiego'),
    ('2029-11-01', 'Wszystkich Świętych'),
    ('2029-11-11', 'Narodowe Święto Niepodległości'),
    ('2029-12-25', 'Boże Narodzenie (1. dzień)'),
    ('2029-12-26', 'Boże Narodzenie (2. dzień)'),
    -- 2030 (Wielkanoc 21 kwietnia)
    ('2030-01-01', 'Nowy Rok'),
    ('2030-01-06', 'Trzech Króli'),
    ('2030-04-21', 'Niedziela Wielkanocna'),
    ('2030-04-22', 'Poniedziałek Wielkanocny'),
    ('2030-05-01', 'Święto Pracy'),
    ('2030-05-03', 'Święto Konstytucji 3 Maja'),
    ('2030-06-20', 'Boże Ciało'),
    ('2030-08-15', 'Wniebowzięcie NMP / Święto Wojska Polskiego'),
    ('2030-11-01', 'Wszystkich Świętych'),
    ('2030-11-11', 'Narodowe Święto Niepodległości'),
    ('2030-12-25', 'Boże Narodzenie (1. dzień)'),
    ('2030-12-26', 'Boże Narodzenie (2. dzień)')
ON CONFLICT (date) DO NOTHING;

COMMENT ON TABLE public.public_holidays IS
    'Polskie dni ustawowo wolne. JEDYNE źródło dni wolnych dla liczenia urlopów, karty pracy, payrollu i OOF. Wypełniane RĘCZNIE migracją — nie ma zadania cyklicznego, które by je dosypywało. Ostatni wpisany rok: 2030 (audyt 2026-08). Kolejne lata dopisać nową migracją: Poniedziałek Wielkanocny = Wielkanoc + 1 dzień, Boże Ciało = Wielkanoc + 60 dni.';

DO $$
DECLARE
    v_year   int;
    v_cnt    int;
    v_easter date;
BEGIN
    FOREACH v_year IN ARRAY ARRAY[2028, 2029, 2030] LOOP
        SELECT count(*) INTO v_cnt FROM public.public_holidays WHERE year = v_year;
        IF v_cnt <> 12 THEN
            RAISE EXCEPTION 'BAZA/1: rok % ma % dni wolnych zamiast 12', v_year, v_cnt;
        END IF;

        SELECT date INTO v_easter
        FROM public.public_holidays
        WHERE year = v_year AND name_pl = 'Niedziela Wielkanocna';

        IF NOT EXISTS (
            SELECT 1 FROM public.public_holidays
            WHERE date = v_easter + 1 AND name_pl = 'Poniedziałek Wielkanocny'
        ) THEN
            RAISE EXCEPTION 'BAZA/1: rok % — Poniedziałek Wielkanocny nie wypada dzień po Wielkanocy (%)', v_year, v_easter;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.public_holidays
            WHERE date = v_easter + 60 AND name_pl = 'Boże Ciało'
        ) THEN
            RAISE EXCEPTION 'BAZA/1: rok % — Boże Ciało nie wypada 60 dni po Wielkanocy (%)', v_year, v_easter;
        END IF;
    END LOOP;
END $$;
