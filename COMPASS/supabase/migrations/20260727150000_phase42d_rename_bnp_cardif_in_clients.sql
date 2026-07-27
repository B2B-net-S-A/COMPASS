-- ============================================================
-- Phase 42d — „BNP Cardif" → „BNP Paribas Cardif" w słowniku klientów
--
-- Ostatni rozjazd z serii 42a-c. Reszta bazy używała już pełnej nazwy
-- (2 premie, 1 placement, 1 kontraktor), tylko `clients` miało formę skróconą —
-- przez co dropdown nie dopasowywał wartości przy edycji tych premii.
--
-- Rename, nie DELETE: docelowa nazwa nie występuje w `clients`, więc UNIQUE(name)
-- nie jest zagrożone (inaczej niż przy „Mnisterstwo" w Phase 42b).
--
-- Cardif to spółka ubezpieczeniowa grupy BNP Paribas, więc pozostaje osobnym
-- klientem od „BNP Paribas" — scalamy tylko warianty jej własnej nazwy.
-- ============================================================

BEGIN;

-- Aktor dla audytu — migracja nie ma zalogowanego użytkownika.
CREATE TEMP TABLE __phase42d_actor ON COMMIT DROP AS
SELECT id FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1;

INSERT INTO audit_logs (user_id, action, details)
SELECT (SELECT id FROM __phase42d_actor), 'CLIENT_UPDATED',
       jsonb_build_object('client_id', c.id, 'name', 'BNP Paribas Cardif', 'previous_name', c.name,
                          'reason', 'ujednolicenie z nazwą używaną w premiach i placementach',
                          'source', 'migration phase42d')
FROM clients c WHERE c.name = 'BNP Cardif';

UPDATE clients SET name = 'BNP Paribas Cardif' WHERE name = 'BNP Cardif';

DO $chk$
BEGIN
    IF EXISTS (SELECT 1 FROM clients WHERE name = 'BNP Cardif') THEN
        RAISE EXCEPTION 'Stara nazwa „BNP Cardif" nadal w slowniku';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM clients WHERE name = 'BNP Paribas Cardif') THEN
        RAISE EXCEPTION 'Brak „BNP Paribas Cardif" w slowniku po zmianie nazwy';
    END IF;
    -- Premie z tą nazwą muszą się teraz dopasować do słownika (dropdown przy edycji).
    IF EXISTS (
        SELECT 1 FROM bonuses b
         WHERE b.client_name = 'BNP Paribas Cardif'
           AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.name = b.client_name)
    ) THEN
        RAISE EXCEPTION 'Premie z „BNP Paribas Cardif" nadal nie maja odpowiednika w slowniku';
    END IF;
END $chk$;

COMMIT;
