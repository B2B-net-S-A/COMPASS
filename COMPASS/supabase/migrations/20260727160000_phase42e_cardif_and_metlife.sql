-- ============================================================
-- Phase 42e — „Cardif" → „BNP Paribas Cardif" i „Metlife" → „MetLife"
--
-- Dwa ostatnie warianty z serii 42a-d:
--   • `client_entries` ma 1 wiersz z samotnym „Cardif" (Jakub Jedynak, 2026-04-24),
--   • „Metlife" siedzi w `clients` (1), `client_entries` (2) i `contractors` (2)
--     — oficjalna stylizacja marki to „MetLife".
--
-- external_key: klucz zawiera nazwę klienta, ale liczy ją po `lower()`, więc sama
-- zmiana wielkości liter („Metlife" → „MetLife") klucza NIE zmienia. Realnie zmienia
-- go tylko wiersz z „Cardif". Migracja przelicza klucze generycznie (tam, gdzie się
-- różnią) i — jak w Phase 42a — najpierw sprawdza, że replika hashu FNV-1a zgadza się
-- z każdym istniejącym kluczem. Rozjazd = RAISE EXCEPTION i rollback całości.
--
-- Zweryfikowane przed migracją: zero kolizji klucza naturalnego w `client_entries`
-- po zmianie nazwy.
-- ============================================================

BEGIN;

-- ─── 1. Replika importExternalKey (patrz lib/types/contractor.ts) ────────────
CREATE OR REPLACE FUNCTION __phase42e_fnv1a_b36(input TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
    h      BIGINT := 2166136261;
    i      INT;
    n      BIGINT;
    digits CONSTANT TEXT := '0123456789abcdefghijklmnopqrstuvwxyz';
    out    TEXT := '';
BEGIN
    FOR i IN 1..length(input) LOOP
        h := ((h # ascii(substr(input, i, 1))) * 16777619) & 4294967295;
    END LOOP;
    n := h;
    IF n = 0 THEN RETURN '0'; END IF;
    WHILE n > 0 LOOP
        out := substr(digits, (n % 36)::INT + 1, 1) || out;
        n := n / 36;
    END LOOP;
    RETURN out;
END $fn$;

CREATE OR REPLACE FUNCTION __phase42e_import_key(VARIADIC parts TEXT[]) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $fn$
    SELECT __phase42e_fnv1a_b36(
        (SELECT string_agg(lower(btrim(coalesce(p, ''))), '|' ORDER BY ord)
         FROM unnest(parts) WITH ORDINALITY AS t(p, ord))
    );
$fn$;

DO $val$
DECLARE bad_dep INT; bad_entry INT;
BEGIN
    SELECT count(*) INTO bad_dep FROM client_departures
     WHERE external_key IS NOT NULL
       AND external_key <> __phase42e_import_key('dep', consultant_name, client_name, to_char(departure_date, 'YYYY-MM-DD'));
    SELECT count(*) INTO bad_entry FROM client_entries
     WHERE external_key IS NOT NULL
       AND external_key <> __phase42e_import_key('entry', consultant_name, client_name, to_char(start_date, 'YYYY-MM-DD'));
    IF bad_dep > 0 OR bad_entry > 0 THEN
        RAISE EXCEPTION 'Replika external_key rozjezdza sie z baza (zejscia: %, wejscia: %) - przerywam backfill', bad_dep, bad_entry;
    END IF;
END $val$;

-- ─── 2. Słownik (snapshot z lib/contractors/name-normalization.ts) ───────────
CREATE TEMP TABLE __phase42e_alias (k TEXT PRIMARY KEY, v TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO __phase42e_alias (k, v) VALUES
    ('cardif', 'BNP Paribas Cardif'),
    ('bnp cardif', 'BNP Paribas Cardif'),
    ('bnp paribas cardif', 'BNP Paribas Cardif'),
    ('metlife', 'MetLife');

CREATE OR REPLACE FUNCTION __phase42e_client(raw TEXT) RETURNS TEXT
LANGUAGE sql STABLE AS $fn$
    SELECT coalesce(
        (SELECT a.v FROM __phase42e_alias a
          WHERE a.k = lower(regexp_replace(btrim(raw), '\s+', ' ', 'g'))),
        regexp_replace(btrim(raw), '\s+', ' ', 'g')
    );
$fn$;

CREATE TEMP TABLE __phase42e_actor ON COMMIT DROP AS
SELECT id FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1;

-- ─── 3. Słownik klientów (dropdown premii) ───────────────────────────────────
INSERT INTO audit_logs (user_id, action, details)
SELECT (SELECT id FROM __phase42e_actor), 'CLIENT_UPDATED',
       jsonb_build_object('client_id', c.id, 'name', __phase42e_client(c.name), 'previous_name', c.name,
                          'reason', 'oficjalna stylizacja marki', 'source', 'migration phase42e')
FROM clients c WHERE c.name IS DISTINCT FROM __phase42e_client(c.name);

UPDATE clients SET name = __phase42e_client(name)
 WHERE name IS DISTINCT FROM __phase42e_client(name);

-- ─── 4. Dane TC ──────────────────────────────────────────────────────────────
UPDATE client_departures SET client_name = __phase42e_client(client_name)
 WHERE client_name IS DISTINCT FROM __phase42e_client(client_name);

UPDATE client_entries SET client_name = __phase42e_client(client_name)
 WHERE client_name IS DISTINCT FROM __phase42e_client(client_name);

UPDATE placements SET client_name = __phase42e_client(client_name)
 WHERE client_name IS DISTINCT FROM __phase42e_client(client_name);

UPDATE contractor_bench SET client_name = __phase42e_client(client_name)
 WHERE client_name IS NOT NULL AND client_name IS DISTINCT FROM __phase42e_client(client_name);

UPDATE contractors SET current_client = __phase42e_client(current_client)
 WHERE current_client IS NOT NULL AND current_client IS DISTINCT FROM __phase42e_client(current_client);

UPDATE contractor_conversations SET client_snapshot = __phase42e_client(client_snapshot)
 WHERE client_snapshot IS NOT NULL AND client_snapshot IS DISTINCT FROM __phase42e_client(client_snapshot);

UPDATE contractor_onboarding_interviews SET client_snapshot = __phase42e_client(client_snapshot)
 WHERE client_snapshot IS NOT NULL AND client_snapshot IS DISTINCT FROM __phase42e_client(client_snapshot);

UPDATE contractor_exit_interviews SET client_snapshot = __phase42e_client(client_snapshot)
 WHERE client_snapshot IS NOT NULL AND client_snapshot IS DISTINCT FROM __phase42e_client(client_snapshot);

UPDATE support_contractor_meta SET client_snapshot = __phase42e_client(client_snapshot)
 WHERE client_snapshot IS NOT NULL AND client_snapshot IS DISTINCT FROM __phase42e_client(client_snapshot);

UPDATE onboarding_cases SET client_snapshot = __phase42e_client(client_snapshot)
 WHERE client_snapshot IS NOT NULL AND client_snapshot IS DISTINCT FROM __phase42e_client(client_snapshot);

UPDATE exit_cases SET client_snapshot = __phase42e_client(client_snapshot)
 WHERE client_snapshot IS NOT NULL AND client_snapshot IS DISTINCT FROM __phase42e_client(client_snapshot);

-- ─── 5. Premie (etykieta klienta; kwoty/odbiorcy/okresy nietknięte) ──────────
INSERT INTO audit_logs (user_id, action, details)
SELECT (SELECT id FROM __phase42e_actor), 'BONUS_UPDATED',
       jsonb_build_object('bonus_id', b.id, 'recipient_user_id', b.recipient_user_id,
                          'changes', jsonb_build_object('client_name',
                              jsonb_build_array(b.client_name, __phase42e_client(b.client_name))),
                          'reason', 'ujednolicenie pisowni klienta', 'source', 'migration phase42e')
FROM bonuses b
WHERE b.client_name IS NOT NULL AND b.client_name IS DISTINCT FROM __phase42e_client(b.client_name);

UPDATE bonuses SET client_name = __phase42e_client(client_name)
 WHERE client_name IS NOT NULL AND client_name IS DISTINCT FROM __phase42e_client(client_name);

UPDATE bonuses SET sales_client_name = __phase42e_client(sales_client_name)
 WHERE sales_client_name IS NOT NULL AND sales_client_name IS DISTINCT FROM __phase42e_client(sales_client_name);

-- ─── 6. Przeliczenie external_key (realnie tylko wiersz „Cardif") ────────────
UPDATE client_departures
   SET external_key = __phase42e_import_key('dep', consultant_name, client_name, to_char(departure_date, 'YYYY-MM-DD'))
 WHERE external_key IS NOT NULL
   AND external_key IS DISTINCT FROM
       __phase42e_import_key('dep', consultant_name, client_name, to_char(departure_date, 'YYYY-MM-DD'));

UPDATE client_entries
   SET external_key = __phase42e_import_key('entry', consultant_name, client_name, to_char(start_date, 'YYYY-MM-DD'))
 WHERE external_key IS NOT NULL
   AND external_key IS DISTINCT FROM
       __phase42e_import_key('entry', consultant_name, client_name, to_char(start_date, 'YYYY-MM-DD'));

-- ─── 7. Kontrola końcowa ─────────────────────────────────────────────────────
DO $chk$
DECLARE leftover INT;
BEGIN
    SELECT
        (SELECT count(*) FROM clients            WHERE name IS DISTINCT FROM __phase42e_client(name))
      + (SELECT count(*) FROM client_departures  WHERE client_name IS DISTINCT FROM __phase42e_client(client_name))
      + (SELECT count(*) FROM client_entries     WHERE client_name IS DISTINCT FROM __phase42e_client(client_name))
      + (SELECT count(*) FROM placements         WHERE client_name IS DISTINCT FROM __phase42e_client(client_name))
      + (SELECT count(*) FROM contractors        WHERE current_client IS NOT NULL
                                                   AND current_client IS DISTINCT FROM __phase42e_client(current_client))
      + (SELECT count(*) FROM bonuses            WHERE client_name IS NOT NULL
                                                   AND client_name IS DISTINCT FROM __phase42e_client(client_name))
    INTO leftover;
    IF leftover > 0 THEN
        RAISE EXCEPTION 'Kanonizacja niekompletna (% wierszy)', leftover;
    END IF;

    -- Klucze idempotencji muszą zgadzać się z nowymi nazwami, inaczej ponowny import
    -- tego samego pliku wstawi duplikaty.
    IF EXISTS (
        SELECT 1 FROM client_entries WHERE external_key IS NOT NULL
          AND external_key <> __phase42e_import_key('entry', consultant_name, client_name, to_char(start_date, 'YYYY-MM-DD'))
    ) THEN
        RAISE EXCEPTION 'external_key w client_entries nie zgadza sie z nowymi nazwami';
    END IF;

    IF EXISTS (SELECT 1 FROM clients WHERE name IN ('Metlife', 'BNP Cardif')) THEN
        RAISE EXCEPTION 'Stare nazwy nadal w slowniku klientow';
    END IF;
END $chk$;

DROP FUNCTION IF EXISTS __phase42e_client(TEXT);
DROP FUNCTION IF EXISTS __phase42e_import_key(VARIADIC TEXT[]);
DROP FUNCTION IF EXISTS __phase42e_fnv1a_b36(TEXT);

COMMIT;
