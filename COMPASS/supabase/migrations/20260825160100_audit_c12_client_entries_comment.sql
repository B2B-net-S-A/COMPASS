-- Audyt 2026-08-25 · KROK C12.2 — opis `client_entries` przestaje kłamać.
--
-- Migracja Fazy 33d (20260606000004) opisała tabelę jako
--     „Archive of "Wejścia do klientów 2024" (pre-Phase-28). Read-only analytics […]"
-- i to było prawdą przez trzy dni. Faza 39 podpięła codzienny cron `tc-sync`
-- (app/api/cron/tc-sync → importWejsciaFromBuffer), który dopisuje do tej samej tabeli
-- bieżące wiersze z arkusza SharePoint.
--
-- Stan prod 2026-08-25: 347 wierszy, start_date od 2024-01-02 do 2026-10-19 (200 wierszy
-- z 2026), ostatni zapis 2026-08-21 05:00 UTC — czyli przebieg crona. Ani „2024",
-- ani „read-only". Kod jest w porządku, nieprawdziwy był opis — poprawiamy opis.
--
-- Co ZOSTAJE prawdą i dlatego zostaje w treści: `client_entries` NIE napędza premii.
-- Premie liczy wyłącznie `placements` (Faza 28), a widok „Wejścia" łączy oba źródła.

COMMENT ON TABLE client_entries IS
    'Fazy 33d + 39. Lustro arkusza "Wejścia do klientów" z SharePointa: historia od 2024 ORAZ bieżące wejścia, dopisywane codziennie przez cron tc-sync (upsert po external_key, additive — usunięcia i edycje kluczowych pól z arkusza nie propagują). NIE napędza premii — te liczy wyłącznie placements (Faza 28). Widok "Wejścia" łączy client_entries i placements.';

DO $$
BEGIN
    IF obj_description('client_entries'::regclass, 'pg_class') LIKE '%Read-only analytics%' THEN
        RAISE EXCEPTION 'C12.2 nie zadziałał — komentarz `client_entries` wciąż mówi "Read-only analytics".';
    END IF;
END $$;
