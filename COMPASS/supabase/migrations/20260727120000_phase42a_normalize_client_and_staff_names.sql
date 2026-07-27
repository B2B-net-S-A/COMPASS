-- ============================================================
-- Phase 42a — Kanonizacja nazw klientów i osób (backfill historii)
--
-- Od tej migracji importy normalizują nazwy w parserach
-- (lib/contractors/name-normalization.ts). Ta migracja doprowadza do tego samego
-- stanu dane wgrane wcześniej — bez niej statystyki historyczne zostają rozjechane
-- (Nordea jako 181 + 100, Xperi jako 28 + 15 + 5 literówki „Xperii").
--
-- ŹRÓDŁEM PRAWDY dla słownika jest plik TS. Mapy poniżej to jego snapshot na dzień
-- migracji — przy dopisywaniu nowych aliasów aktualizuj TS, a backfill rób osobną
-- migracją tylko wtedy, gdy trzeba poprawić historię.
--
-- external_key: klucz idempotencji importu zawiera nazwę klienta
-- (importExternalKey('dep', nazwisko, klient, data) w lib/types/contractor.ts).
-- Zmiana nazwy zmienia klucz, więc bez przeliczenia ponowny wgrany ten sam plik
-- wstawiłby duplikaty. Poniżej odtwarzamy hash FNV-1a w SQL i — zanim cokolwiek
-- zmienimy — sprawdzamy, że replika zgadza się z każdym istniejącym kluczem.
-- Rozjazd = RAISE EXCEPTION i rollback całości.
--
-- Zweryfikowane na produkcji przed napisaniem migracji: replika hashu zgodna
-- (40/40 próbek), zero kolizji UNIQUE po normalizacji w client_departures,
-- client_entries i idx_placements_natural_key.
-- ============================================================

BEGIN;

-- ─── 1. Replika importExternalKey (FNV-1a 32-bit → base36) ───────────────────
CREATE OR REPLACE FUNCTION __phase42_fnv1a_b36(input TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    h      BIGINT := 2166136261;  -- 0x811c9dc5
    i      INT;
    n      BIGINT;
    digits CONSTANT TEXT := '0123456789abcdefghijklmnopqrstuvwxyz';
    out    TEXT := '';
BEGIN
    FOR i IN 1..length(input) LOOP
        -- XOR z kodem znaku, potem mnożenie mod 2^32 (odpowiednik Math.imul w JS).
        h := ((h # ascii(substr(input, i, 1))) * 16777619) & 4294967295;
    END LOOP;
    n := h;
    IF n = 0 THEN RETURN '0'; END IF;
    WHILE n > 0 LOOP
        out := substr(digits, (n % 36)::INT + 1, 1) || out;
        n := n / 36;
    END LOOP;
    RETURN out;
END $$;

CREATE OR REPLACE FUNCTION __phase42_import_key(VARIADIC parts TEXT[]) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT __phase42_fnv1a_b36(
        (SELECT string_agg(lower(btrim(coalesce(p, ''))), '|' ORDER BY ord)
         FROM unnest(parts) WITH ORDINALITY AS t(p, ord))
    );
$$;

-- ─── 2. Walidacja repliki na istniejących danych ─────────────────────────────
DO $$
DECLARE bad_dep INT; bad_entry INT;
BEGIN
    SELECT count(*) INTO bad_dep FROM client_departures
     WHERE external_key IS NOT NULL
       AND external_key <> __phase42_import_key(
             'dep', consultant_name, client_name, to_char(departure_date, 'YYYY-MM-DD'));

    SELECT count(*) INTO bad_entry FROM client_entries
     WHERE external_key IS NOT NULL
       AND external_key <> __phase42_import_key(
             'entry', consultant_name, client_name, to_char(start_date, 'YYYY-MM-DD'));

    IF bad_dep > 0 OR bad_entry > 0 THEN
        RAISE EXCEPTION
            'Replika external_key rozjezdza sie z baza (zejscia: %, wejscia: %) - przerywam backfill',
            bad_dep, bad_entry;
    END IF;
END $$;

-- ─── 3. Słowniki (snapshot z lib/contractors/name-normalization.ts) ──────────
CREATE TEMP TABLE __phase42_client_alias (k TEXT PRIMARY KEY, v TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO __phase42_client_alias (k, v) VALUES
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

CREATE TEMP TABLE __phase42_staff_alias (k TEXT PRIMARY KEY, v TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO __phase42_staff_alias (k, v) VALUES
    ('aleksandra borzecka', 'Aleksandra Borzęcka'),
    ('aleskandra borzęcka', 'Aleksandra Borzęcka'),
    ('anna makushenko', 'Anna Makushchenko'),
    ('diana sditianova', 'Diana Sditanova'),
    ('lza grabińska', 'Elza Grabińska'),
    ('michał lenczewsk', 'Michał Lenczewski'),
    ('michał walasek', 'Michał Walasek'),
    ('krystyna soiko', 'Krystyna Sojko'),
    ('kristsina soiko', 'Krystyna Sojko'),
    ('ola królewicz', 'Aleksandra Królewicz'),
    ('igor', 'Igor Twardowski'),
    ('igor twardowski / stara kadencja', 'Igor Twardowski'),
    ('błażej', 'Błażej Bęben');

-- Znaczniki „nikt" — jako tekst tworzyłyby fałszywą osobę w statystykach.
CREATE TEMP TABLE __phase42_empty_marker (k TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO __phase42_empty_marker (k) VALUES
    ('-'), ('--'), ('—'), ('–'), ('brak'), ('n/a'), ('nd'), ('nd.'), ('x');

CREATE OR REPLACE FUNCTION __phase42_client(raw TEXT) RETURNS TEXT
LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        (SELECT a.v FROM __phase42_client_alias a
          WHERE a.k = lower(regexp_replace(btrim(raw), '\s+', ' ', 'g'))),
        regexp_replace(btrim(raw), '\s+', ' ', 'g')
    );
$$;

CREATE OR REPLACE FUNCTION __phase42_staff(raw TEXT) RETURNS TEXT
LANGUAGE sql STABLE AS $$
    SELECT CASE
        WHEN regexp_replace(btrim(coalesce(raw, '')), '\s+', ' ', 'g') = '' THEN NULL
        WHEN EXISTS (SELECT 1 FROM __phase42_empty_marker m
                      WHERE m.k = lower(regexp_replace(btrim(raw), '\s+', ' ', 'g'))) THEN NULL
        ELSE coalesce(
            (SELECT a.v FROM __phase42_staff_alias a
              WHERE a.k = lower(regexp_replace(btrim(raw), '\s+', ' ', 'g'))),
            regexp_replace(btrim(raw), '\s+', ' ', 'g'))
    END;
$$;

-- ─── 4. Backfill nazw klientów ───────────────────────────────────────────────
UPDATE client_departures SET client_name = __phase42_client(client_name)
 WHERE client_name IS DISTINCT FROM __phase42_client(client_name);

UPDATE client_entries SET client_name = __phase42_client(client_name)
 WHERE client_name IS DISTINCT FROM __phase42_client(client_name);

UPDATE placements SET client_name = __phase42_client(client_name)
 WHERE client_name IS DISTINCT FROM __phase42_client(client_name);

UPDATE contractor_bench SET client_name = __phase42_client(client_name)
 WHERE client_name IS NOT NULL AND client_name IS DISTINCT FROM __phase42_client(client_name);

UPDATE contractors SET current_client = __phase42_client(current_client)
 WHERE current_client IS NOT NULL AND current_client IS DISTINCT FROM __phase42_client(current_client);

UPDATE contractor_conversations SET client_snapshot = __phase42_client(client_snapshot)
 WHERE client_snapshot IS NOT NULL AND client_snapshot IS DISTINCT FROM __phase42_client(client_snapshot);

UPDATE contractor_onboarding_interviews SET client_snapshot = __phase42_client(client_snapshot)
 WHERE client_snapshot IS NOT NULL AND client_snapshot IS DISTINCT FROM __phase42_client(client_snapshot);

UPDATE contractor_exit_interviews SET client_snapshot = __phase42_client(client_snapshot)
 WHERE client_snapshot IS NOT NULL AND client_snapshot IS DISTINCT FROM __phase42_client(client_snapshot);

-- Mirror Phase 37 — aktualizowany jawnie, nie polegamy na tym, które kolumny kopiuje trigger.
UPDATE support_contractor_meta SET client_snapshot = __phase42_client(client_snapshot)
 WHERE client_snapshot IS NOT NULL AND client_snapshot IS DISTINCT FROM __phase42_client(client_snapshot);

UPDATE onboarding_cases SET client_snapshot = __phase42_client(client_snapshot)
 WHERE client_snapshot IS NOT NULL AND client_snapshot IS DISTINCT FROM __phase42_client(client_snapshot);

UPDATE exit_cases SET client_snapshot = __phase42_client(client_snapshot)
 WHERE client_snapshot IS NOT NULL AND client_snapshot IS DISTINCT FROM __phase42_client(client_snapshot);

-- ─── 5. Backfill osób (rekruter / Delivery Lead / TCM) ───────────────────────
UPDATE client_departures SET recruiter_raw = __phase42_staff(recruiter_raw)
 WHERE recruiter_raw IS DISTINCT FROM __phase42_staff(recruiter_raw);

UPDATE client_entries SET recruiter_raw = __phase42_staff(recruiter_raw)
 WHERE recruiter_raw IS DISTINCT FROM __phase42_staff(recruiter_raw);

UPDATE client_entries SET delivery_lead_raw = __phase42_staff(delivery_lead_raw)
 WHERE delivery_lead_raw IS DISTINCT FROM __phase42_staff(delivery_lead_raw);

-- placements.recruiter_raw / delivery_lead_raw są NOT NULL — pusty wynik zostawiamy bez zmian.
UPDATE placements SET recruiter_raw = __phase42_staff(recruiter_raw)
 WHERE __phase42_staff(recruiter_raw) IS NOT NULL
   AND recruiter_raw IS DISTINCT FROM __phase42_staff(recruiter_raw);

UPDATE placements SET delivery_lead_raw = __phase42_staff(delivery_lead_raw)
 WHERE __phase42_staff(delivery_lead_raw) IS NOT NULL
   AND delivery_lead_raw IS DISTINCT FROM __phase42_staff(delivery_lead_raw);

UPDATE contractor_conversations SET tcm_raw = __phase42_staff(tcm_raw)
 WHERE tcm_raw IS DISTINCT FROM __phase42_staff(tcm_raw);

-- ─── 6. Przeliczenie external_key po zmianie nazw klientów ───────────────────
UPDATE client_departures
   SET external_key = __phase42_import_key('dep', consultant_name, client_name, to_char(departure_date, 'YYYY-MM-DD'))
 WHERE external_key IS NOT NULL
   AND external_key IS DISTINCT FROM
       __phase42_import_key('dep', consultant_name, client_name, to_char(departure_date, 'YYYY-MM-DD'));

UPDATE client_entries
   SET external_key = __phase42_import_key('entry', consultant_name, client_name, to_char(start_date, 'YYYY-MM-DD'))
 WHERE external_key IS NOT NULL
   AND external_key IS DISTINCT FROM
       __phase42_import_key('entry', consultant_name, client_name, to_char(start_date, 'YYYY-MM-DD'));

-- ─── 7. Kontrola końcowa ─────────────────────────────────────────────────────
DO $$
DECLARE leftover INT;
BEGIN
    -- Po backfillu żadna tabela nie może mieć nazwy różnej od kanonicznej.
    SELECT
        (SELECT count(*) FROM client_departures WHERE client_name IS DISTINCT FROM __phase42_client(client_name))
      + (SELECT count(*) FROM client_entries    WHERE client_name IS DISTINCT FROM __phase42_client(client_name))
      + (SELECT count(*) FROM placements        WHERE client_name IS DISTINCT FROM __phase42_client(client_name))
    INTO leftover;
    IF leftover > 0 THEN
        RAISE EXCEPTION 'Backfill nazw klientow niekompletny (% wierszy)', leftover;
    END IF;
END $$;

DROP FUNCTION IF EXISTS __phase42_client(TEXT);
DROP FUNCTION IF EXISTS __phase42_staff(TEXT);
DROP FUNCTION IF EXISTS __phase42_import_key(VARIADIC TEXT[]);
DROP FUNCTION IF EXISTS __phase42_fnv1a_b36(TEXT);

COMMIT;
