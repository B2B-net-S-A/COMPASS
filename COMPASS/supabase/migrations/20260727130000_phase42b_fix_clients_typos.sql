-- ============================================================
-- Phase 42b — Literówki w słowniku klientów (tabela `clients`, Phase 27d)
--
-- `clients` zasila dropdown przy przypisywaniu premii, więc literówka w słowniku
-- nie zostaje w słowniku — wycieka do danych. Tak było z „PEFRON": trafiło do
-- 2 premii (jedna aktywna: delivery_lead 504 PLN, maj 2026; jedna anulowana).
-- Dlatego poprawiamy oba miejsca naraz, inaczej naprawa byłaby pozorna.
--
-- Dwie literówki, dwa różne zabiegi:
--   • „PEFRON"      → rename na „PFRON" (PFRON = Państwowy Fundusz Rehabilitacji
--                     Osób Niepełnosprawnych; taka forma jest w danych TC, 29 wystąpień),
--   • „Mnisterstwo" → DELETE, nie rename: „Ministerstwo Sprawiedliwości" już jest
--                     w tabeli, więc zmiana nazwy złamałaby UNIQUE(name).
--                     Sprawdzone: żadna premia nie używa tej wartości.
--
-- Kwoty, odbiorcy, statusy i okresy premii pozostają nietknięte — zmienia się wyłącznie
-- etykieta klienta. Trigger enforce_bonus_stage_transitions nie chroni `client_name`
-- (pilnuje recipient_user_id, category, period, linked_invoice_id), więc UPDATE
-- przechodzi zarówno na wierszu `assigned`, jak i `cancelled`.
--
-- Poza zakresem (świadomie): warianty wielkości liter w `bonuses.client_name`
-- (NORDEA/Nordea 20+36, EZDROWIE/e-zdrowie 6+1, ALIOR BANK/Alior 2+2, BNP/BNP Paribas)
-- — to nie literówki, tylko ten sam rozjazd pisowni, który Phase 42a naprawiła po
-- stronie TC. Do decyzji osobno, bo dotyka danych premiowych.
-- ============================================================

BEGIN;

-- Aktor dla wpisów audytowych — migracja nie ma zalogowanego użytkownika.
CREATE TEMP TABLE __phase42b_actor ON COMMIT DROP AS
SELECT id FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1;

-- ─── 1. „PEFRON" → „PFRON" w słowniku ────────────────────────────────────────
INSERT INTO audit_logs (user_id, action, details)
SELECT (SELECT id FROM __phase42b_actor), 'CLIENT_UPDATED',
       jsonb_build_object('client_id', c.id, 'name', 'PFRON', 'previous_name', c.name,
                          'reason', 'literówka', 'source', 'migration phase42b')
FROM clients c WHERE c.name = 'PEFRON';

UPDATE clients SET name = 'PFRON' WHERE name = 'PEFRON';

-- ─── 2. Ta sama literówka w premiach wystawionych z dropdownu ────────────────
INSERT INTO audit_logs (user_id, action, details)
SELECT (SELECT id FROM __phase42b_actor), 'BONUS_UPDATED',
       jsonb_build_object('bonus_id', b.id, 'recipient_user_id', b.recipient_user_id,
                          'changes', jsonb_build_object('client_name', jsonb_build_array('PEFRON', 'PFRON')),
                          'reason', 'literówka w słowniku klientów', 'source', 'migration phase42b')
FROM bonuses b WHERE b.client_name = 'PEFRON';

UPDATE bonuses SET client_name = 'PFRON' WHERE client_name = 'PEFRON';
UPDATE bonuses SET sales_client_name = 'PFRON' WHERE sales_client_name = 'PEFRON';

-- ─── 3. „Mnisterstwo" — duplikat istniejącego „Ministerstwo Sprawiedliwości" ─
INSERT INTO audit_logs (user_id, action, details)
SELECT (SELECT id FROM __phase42b_actor), 'CLIENT_DELETED',
       jsonb_build_object('client_id', c.id, 'name', c.name,
                          'reason', 'literówka — duplikat „Ministerstwo Sprawiedliwości"',
                          'source', 'migration phase42b')
FROM clients c WHERE c.name = 'Mnisterstwo';

DELETE FROM clients WHERE name = 'Mnisterstwo';

-- ─── 4. Kontrola końcowa ─────────────────────────────────────────────────────
DO $chk$
DECLARE leftover INT;
BEGIN
    SELECT (SELECT count(*) FROM clients WHERE name IN ('PEFRON', 'Mnisterstwo'))
         + (SELECT count(*) FROM bonuses WHERE client_name = 'PEFRON' OR sales_client_name = 'PEFRON')
    INTO leftover;
    IF leftover > 0 THEN
        RAISE EXCEPTION 'Literowki nadal obecne (% wystapien)', leftover;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM clients WHERE name = 'PFRON') THEN
        RAISE EXCEPTION 'Brak PFRON w slowniku po zmianie nazwy';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM clients WHERE name = 'Ministerstwo Sprawiedliwości') THEN
        RAISE EXCEPTION 'Brak Ministerstwa Sprawiedliwosci — usunieto niewlasciwy wiersz';
    END IF;
END $chk$;

COMMIT;
