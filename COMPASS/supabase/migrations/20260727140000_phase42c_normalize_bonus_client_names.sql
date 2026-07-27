-- ============================================================
-- Phase 42c — Kanonizacja nazw klientów w premiach (`bonuses`)
--
-- Domknięcie Phase 42a/42b. Po stronie TC nazwy są już kanoniczne, a słownik `clients`
-- nie ma literówek — ale premie wystawione wcześniej trzymają swoje warianty:
-- „NORDEA" 20 obok „Nordea" 36, „EZDROWIE" 6 obok „e-zdrowie" 1, „ALIOR BANK" 2 obok
-- „Alior" 2, „BNP" 2 obok „BNP Paribas". Statystyki premii liczyły każdy wariant osobno.
--
-- Ten sam słownik co lib/contractors/name-normalization.ts (snapshot), więc premie,
-- dane TC i dropdown `clients` mówią jedną nazwą.
--
-- Kwoty, odbiorcy, kategorie, statusy i okresy nietknięte — zmienia się wyłącznie
-- etykieta klienta. Trigger enforce_bonus_stage_transitions nie chroni `client_name`
-- (pilnuje recipient_user_id, category, period, linked_invoice_id), więc UPDATE
-- przechodzi na każdym statusie.
--
-- Świadomie NIE scalane (jak w Phase 42a): „BNP Paribas Cardif" zostaje osobno —
-- to spółka ubezpieczeniowa grupy, nie bank.
-- ============================================================

BEGIN;

CREATE TEMP TABLE __phase42c_alias (k TEXT PRIMARY KEY, v TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO __phase42c_alias (k, v) VALUES
    ('nordea', 'Nordea'), ('atos', 'ATOS'), ('bosch', 'BOSCH'), ('orlen', 'ORLEN'),
    ('ergo', 'ERGO'), ('nori', 'NORI'), ('santander', 'Santander'), ('polkomtel', 'Polkomtel'),
    ('xperi', 'XPERI'), ('xperii', 'XPERI'),
    ('alior', 'Alior'), ('alior bank', 'Alior'),
    ('bnp', 'BNP Paribas'), ('bnp paribas', 'BNP Paribas'),
    ('pko', 'PKO BP'), ('pko bp', 'PKO BP'),
    ('nationale', 'Nationale Nederlanden'), ('nationale nederlanden', 'Nationale Nederlanden'),
    ('velo', 'VeloBank'), ('velobank', 'VeloBank'),
    ('mleasing', 'mLeasing'), ('m-leasing', 'mLeasing'),
    ('ezdrowie', 'e-zdrowie'), ('e-zdrowie', 'e-zdrowie');

CREATE OR REPLACE FUNCTION __phase42c_client(raw TEXT) RETURNS TEXT
LANGUAGE sql STABLE AS $fn$
    SELECT coalesce(
        (SELECT a.v FROM __phase42c_alias a
          WHERE a.k = lower(regexp_replace(btrim(raw), '\s+', ' ', 'g'))),
        regexp_replace(btrim(raw), '\s+', ' ', 'g')
    );
$fn$;

-- Aktor dla audytu — migracja nie ma zalogowanego użytkownika. Kolumna jest nullable,
-- a `source` w details i tak wystarcza do namierzenia zmiany.
CREATE TEMP TABLE __phase42c_actor ON COMMIT DROP AS
SELECT id FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1;

-- Ślad audytowy PRZED zmianą (wszystko w jednej transakcji — rollback zabiera i wpisy).
INSERT INTO audit_logs (user_id, action, details)
SELECT (SELECT id FROM __phase42c_actor), 'BONUS_UPDATED',
       jsonb_build_object('bonus_id', b.id, 'recipient_user_id', b.recipient_user_id,
                          'changes', jsonb_build_object('client_name',
                              jsonb_build_array(b.client_name, __phase42c_client(b.client_name))),
                          'reason', 'ujednolicenie pisowni klienta',
                          'source', 'migration phase42c')
FROM bonuses b
WHERE b.client_name IS NOT NULL
  AND b.client_name IS DISTINCT FROM __phase42c_client(b.client_name);

UPDATE bonuses SET client_name = __phase42c_client(client_name)
 WHERE client_name IS NOT NULL AND client_name IS DISTINCT FROM __phase42c_client(client_name);

UPDATE bonuses SET sales_client_name = __phase42c_client(sales_client_name)
 WHERE sales_client_name IS NOT NULL
   AND sales_client_name IS DISTINCT FROM __phase42c_client(sales_client_name);

DO $chk$
DECLARE leftover INT;
BEGIN
    SELECT count(*) INTO leftover FROM bonuses
     WHERE (client_name IS NOT NULL AND client_name IS DISTINCT FROM __phase42c_client(client_name))
        OR (sales_client_name IS NOT NULL AND sales_client_name IS DISTINCT FROM __phase42c_client(sales_client_name));
    IF leftover > 0 THEN
        RAISE EXCEPTION 'Kanonizacja nazw w premiach niekompletna (% wierszy)', leftover;
    END IF;
    -- Warianty różniące się tylko wielkością liter nie mogą już współistnieć.
    IF EXISTS (
        SELECT 1 FROM bonuses WHERE client_name IS NOT NULL
         GROUP BY lower(btrim(client_name)) HAVING count(DISTINCT client_name) > 1
    ) THEN
        RAISE EXCEPTION 'W premiach nadal sa warianty roznizce sie wielkoscia liter';
    END IF;
END $chk$;

DROP FUNCTION IF EXISTS __phase42c_client(TEXT);

COMMIT;
