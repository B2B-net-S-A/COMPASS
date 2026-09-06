-- ============================================================
-- Tożsamość kontraktorów z NEXUSA + eksport rosteru dla NEXUSA
-- Data: 2026-09-04
-- Depends on: contractors (20260606000001_phase33a_contractors.sql),
--             profiles (employment_status, email)
--
-- PO CO (część 1 — kolumny na `contractors`):
--   Zmierzone na produkcji 2026-09-04: 689 kontraktorów, z czego **0 ma
--   e-mail** i **0 ma `profile_id`**. Tożsamością jest samo imię i nazwisko
--   (`idx_contractors_natural_key` po `lower(trim(full_name))`). Wszystkie 689
--   mają `status='active'` mimo 365 zarejestrowanych zejść w
--   `client_departures` — nikt tego pola nigdy nie zmienia.
--
--   NEXUS zna te osoby dokładnie: z e-mailem, klientem, datami i realnym
--   statusem umowy. `nexus_contract_id` jest kotwicą tego połączenia.
--
--   `nexus_match_status` obsługuje kolejkę ręczną: automat linkuje WYŁĄCZNIE
--   przy jednoznacznym trafieniu, reszta czeka na człowieka. To nie jest
--   ostrożność na wyrost — Compass podjął dokładnie tę decyzję już raz:
--   `20260714183425_consultant_success_hub.sql` linkował `profile_id`
--   wyłącznie po unikalnym e-mailu, z komentarzem „Name matching is
--   intentionally forbidden". Dopasowywanie 689 nazwisk do ~49 tys.
--   kandydatów w NEXUSIE jest tym samym problemem, tylko większym.
--
-- PO CO (część 2 — `nexus_roster_export`):
--   COMPASS jest źródłem prawdy o zatrudnieniu, a NEXUS flipuje `is_active`
--   ręcznie, więc konto osoby, która odeszła, bywa aktywne tygodniami.
--
-- CO ŚWIADOMIE ODDAJE, A CZEGO NIE:
--   funkcja zwraca WYŁĄCZNIE `email` i `employment_status`. Nigdy nazwiska,
--   stanowiska, managera, stawki (`user_rates`), daty zatrudnienia ani niczego
--   innego z `profiles` — a ta tabela to pełna kartoteka kadrowa. NEXUS
--   potrzebuje odpowiedzi na jedno pytanie: „czy ta osoba u nas jeszcze
--   pracuje". Kontrakt wymusza sygnatura funkcji, nie dyscyplina handlera —
--   lustro decyzji z `nexus_workdays_export`.
-- ============================================================

BEGIN;

-- ── Część 1: kotwica tożsamości na `contractors` ────────────────────────────

ALTER TABLE contractors
    ADD COLUMN IF NOT EXISTS nexus_contract_id BIGINT;

ALTER TABLE contractors
    ADD COLUMN IF NOT EXISTS nexus_synced_at TIMESTAMPTZ;

-- Stan dopasowania. `pending` = automat nie miał pewności i wiersz czeka na
-- człowieka; `ambiguous` = trafień było WIĘCEJ NIŻ JEDNO, więc zgadywanie
-- skleiłoby dwie różne osoby — a błędne sklejenie jest ciche i trwałe.
ALTER TABLE contractors
    ADD COLUMN IF NOT EXISTS nexus_match_status TEXT
    CHECK (nexus_match_status IN ('linked', 'pending', 'ambiguous', 'not_found'));

-- Indeks CZĘŚCIOWY i UNIKALNY: jeden kontrakt NEXUSA = najwyżej jeden wiersz
-- w Compassie. Pełny UNIQUE nie zadziała, bo 689 istniejących wierszy ma tu
-- NULL i wszystkie kolidowałyby ze sobą.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contractors_nexus_contract_id
    ON contractors (nexus_contract_id)
    WHERE nexus_contract_id IS NOT NULL;

-- Kolejka ręczna czyta po tym indeksie.
CREATE INDEX IF NOT EXISTS idx_contractors_nexus_match_status
    ON contractors (nexus_match_status)
    WHERE nexus_match_status IS NOT NULL AND nexus_match_status <> 'linked';

COMMENT ON COLUMN contractors.nexus_contract_id IS
    'Kotwica tożsamości: id kontraktu w NEXUSIE. Ustawiana wyłącznie przy '
    'JEDNOZNACZNYM dopasowaniu (e-mail). Dopasowanie po nazwisku jest zakazane '
    '— patrz 20260714183425_consultant_success_hub.sql.';

COMMENT ON COLUMN contractors.nexus_match_status IS
    'linked = powiązany automatem po e-mailu · pending = czeka na człowieka · '
    'ambiguous = wiele trafień, automat NIE zgaduje · not_found = brak '
    'odpowiednika w NEXUSIE (np. kontraktor sprzed wdrożenia).';

-- ── Część 2: eksport rosteru dla NEXUSA ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.nexus_roster_export()
RETURNS TABLE (
    email             TEXT,
    employment_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        lower(trim(p.email))::TEXT       AS email,
        p.employment_status::TEXT        AS employment_status
    FROM profiles p
    WHERE p.email IS NOT NULL
      AND trim(p.email) <> ''
    ORDER BY 1;
$$;

COMMENT ON FUNCTION public.nexus_roster_export() IS
    'Eksport rosteru dla NEXUSA (Etap 5). Zwraca WYŁĄCZNIE email i '
    'employment_status — nigdy nazwiska, stanowiska, managera ani stawek. '
    'Kontrakt wymusza sygnatura, nie dyscyplina wołającego.';

REVOKE ALL ON FUNCTION public.nexus_roster_export() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nexus_roster_export() FROM anon;
REVOKE ALL ON FUNCTION public.nexus_roster_export() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_roster_export() TO service_role;

-- ── Samosprawdzenie ─────────────────────────────────────────────────────────
-- Migracja, która cicho nic nie zmieniła, jest gorsza niż taka, która padła —
-- bo wygląda na wdrożoną.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'contractors'
          AND column_name = 'nexus_contract_id'
    ) THEN
        RAISE EXCEPTION 'Samosprawdzenie: contractors.nexus_contract_id nie istnieje po migracji';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_contractors_nexus_contract_id'
    ) THEN
        RAISE EXCEPTION 'Samosprawdzenie: brak indeksu idx_contractors_nexus_contract_id';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'nexus_roster_export'
          AND p.pronargs = 0
    ) THEN
        RAISE EXCEPTION 'Samosprawdzenie: funkcja nexus_roster_export nie istnieje po migracji';
    END IF;
END $$;

COMMIT;
