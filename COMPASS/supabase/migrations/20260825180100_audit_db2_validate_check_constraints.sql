-- Audyt 2026-08-25 · BAZA/2 — dwa CHECK-i zostały NOT VALID i nikt ich nie domknął.
--
-- `SELECT conname FROM pg_constraint WHERE NOT convalidated` zwraca w schemacie
-- publicznym dokładnie dwa więzy aplikacji:
--   * public.timesheet_entries_hours_check      (Faza 27a — nadgodziny)
--   * public.bonuses_category_fields_required   (Faza 27b/31 — pola per kategoria premii)
-- (trzeci, `realtime.messages_payload_exclusive`, należy do Supabase — nie ruszamy.)
--
-- NOT VALID znaczy „nowe i zmieniane wiersze sprawdzam, starych nie oglądałem".
-- Obie migracje dodały je tak celowo, żeby nie wywrócić wdrożenia na historycznych
-- danych — ale nikt nigdy nie wrócił po VALIDATE. Skutek: schemat obiecuje regułę,
-- której nie da się użyć jako gwarancji przy analizie danych, a ewentualny wiersz
-- sprzed wdrożenia łamiący warunek siedziałby cicho aż do pierwszej edycji.
--
-- Sprawdzone na produkcji (wyłącznie SELECT, 2026-08-25): 2419 wierszy timesheet_entries
-- i 153 wiersze bonuses — ZERO naruszeń obu warunków. VALIDATE jest więc formalnością,
-- a nie ryzykiem: gdyby jakikolwiek wiersz łamał regułę, polecenie samo przerwie migrację.
--
-- Blokada: VALIDATE bierze SHARE UPDATE EXCLUSIVE (nie blokuje odczytów ani zapisów)
-- i skanuje tabelę raz. Przy tych rozmiarach to milisekundy.

ALTER TABLE public.timesheet_entries VALIDATE CONSTRAINT timesheet_entries_hours_check;
ALTER TABLE public.bonuses           VALIDATE CONSTRAINT bonuses_category_fields_required;

DO $$
DECLARE v_left text;
BEGIN
    SELECT string_agg(c.conname, ', ') INTO v_left
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND NOT c.convalidated
      AND c.conname IN ('timesheet_entries_hours_check', 'bonuses_category_fields_required');

    IF v_left IS NOT NULL THEN
        RAISE EXCEPTION 'BAZA/2 nie zadziałał — nadal NOT VALID: %', v_left;
    END IF;
END $$;
