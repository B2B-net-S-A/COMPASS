-- Audyt 2026-08-25 · KROK C12.1 — placementy wracają na profil kontraktora.
--
-- `placements.contractor_id` wypełnił tylko jednorazowy backfill Fazy 33a. Importer
-- placementów (lib/actions/placements.ts → commitPlacementImport) tego FK nie ustawiał,
-- w odróżnieniu od importera Wejść/Zejść (lib/contractors/import-core.ts → ensureContractors),
-- a na tabeli nie ma triggera, który by to nadrobił.
--
-- Stan prod przed migracją: 69 placementów, 17 podpiętych (backfill 33a), 52 sierot —
-- czyli wszystko, co weszło po Fazie 33a. Skutek: placement nie pokazuje się ani na
-- karcie kontraktora, ani w Consultant Success.
--
-- Migracja domyka historię; przyczynę usuwa poprawka importera w tym samym PR.
--
-- Klucz dopięcia: lower(btrim(full_name)) — ten sam, na którym stoi unikalny indeks
-- `idx_contractors_natural_key`, i ten sam, który liczy `normalizePersonName` po stronie
-- aplikacji. Dwuznaczności (dwóch kontraktorów o tej samej znormalizowanej nazwie) ten
-- indeks nie dopuszcza, ale krok 2 i tak je jawnie POMIJA zamiast zgadywać — gdyby indeks
-- kiedyś zniknął, migracja zostawi takie wiersze niepodpięte, a nie podepnie losowo.

BEGIN;

-- ─── 1. Kontraktorzy, których jeszcze nie ma ────────────────────────────────
-- 51 z 52 sierot ma już swojego kontraktora (założył go import Wejść/Zejść). Dla reszty
-- zakładamy wiersz — dokładnie to samo, co zrobi teraz poprawiony importer przy najbliższym
-- wgraniu pliku, i to samo, co zrobił backfill Fazy 33a. DISTINCT ON bierze najświeższy
-- placement, żeby `current_client` / `current_position` opisywały stan bieżący.
INSERT INTO contractors (full_name, current_client, current_position)
SELECT DISTINCT ON (lower(btrim(p.consultant_name)))
    btrim(p.consultant_name), p.client_name, p.position
FROM placements p
WHERE p.contractor_id IS NULL
  AND length(btrim(COALESCE(p.consultant_name, ''))) >= 2
ORDER BY lower(btrim(p.consultant_name)), p.start_date DESC
ON CONFLICT (lower(trim(full_name))) DO NOTHING;

-- ─── 2. Dopięcie FK ─────────────────────────────────────────────────────────
UPDATE placements p
SET contractor_id = c.id
FROM contractors c
WHERE p.contractor_id IS NULL
  AND lower(btrim(p.consultant_name)) = lower(btrim(c.full_name))
  -- Dwuznaczne nazwy zostają niepodpięte (patrz nagłówek).
  AND NOT EXISTS (
      SELECT 1 FROM contractors c2
      WHERE lower(btrim(c2.full_name)) = lower(btrim(p.consultant_name))
        AND c2.id <> c.id
  );

-- ─── 3. Samosprawdzenie ─────────────────────────────────────────────────────
DO $$
DECLARE
    v_orphans   int;
    v_ambiguous int;
BEGIN
    SELECT count(*) INTO v_ambiguous
    FROM (
        SELECT lower(btrim(full_name)) AS norm
        FROM contractors
        GROUP BY 1 HAVING count(*) > 1
    ) dup;

    IF v_ambiguous > 0 THEN
        RAISE NOTICE 'C12.1: % nazw kontraktorów jest dwuznacznych — ich placementy zostały świadomie pominięte.', v_ambiguous;
    END IF;

    -- Sierota bez dwuznaczności = migracja nie zadziałała.
    SELECT count(*) INTO v_orphans
    FROM placements p
    WHERE p.contractor_id IS NULL
      AND length(btrim(COALESCE(p.consultant_name, ''))) >= 2
      AND NOT EXISTS (
          SELECT 1
          FROM contractors c
          WHERE lower(btrim(c.full_name)) = lower(btrim(p.consultant_name))
          GROUP BY lower(btrim(c.full_name))
          HAVING count(*) > 1
      );

    IF v_orphans > 0 THEN
        RAISE EXCEPTION 'C12.1 nie zadziałał — % placementów wciąż bez contractor_id.', v_orphans;
    END IF;
END $$;

COMMIT;
