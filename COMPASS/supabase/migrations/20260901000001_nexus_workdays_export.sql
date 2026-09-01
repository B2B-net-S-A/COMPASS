-- ============================================================
-- Eksport dni roboczych dla NEXUSA (decyzja D5)
-- Data: 2026-09-01
--
-- PO CO: NEXUS ocenia rekruterów wskaźnikami „na dzień" (Power Calling,
-- CV/MD). Nie zna nieobecności, więc do 2026-08-31 dzielił przez sztywne 5 dni
-- — przez co osoba na urlopie lądowała na imiennej liście „poniżej progu".
-- Ta funkcja daje mu mianownik.
--
-- CO ŚWIADOMIE ODDAJE, A CZEGO NIE:
--   zwraca WYŁĄCZNIE LICZBĘ DNI. Nigdy `leave_type`, `note`, `documentation_url`
--   ani `decision_note`. Typ nieobecności to dana o zdrowiu (`sick_leave`,
--   `parental_leave`), a notatki w produkcji zawierają wolny tekst medyczny.
--   NEXUS nie ma powodu ich widzieć i nie zobaczy — kontrakt jest wymuszony
--   sygnaturą tej funkcji, nie dyscypliną wołającego.
--
-- DLACZEGO SQL, A NIE TypeScript: `app/api/internal/payroll-export/route.ts`
-- liczy daty przez `new Date(y, m-1, d).toISOString()`, co w Europe/Warsaw
-- przesuwa dzień. Arytmetyka na typach DATE nie ma tego problemu.
-- ============================================================

BEGIN;

-- Granulacja `p_bucket` ('month' | 'week') istnieje, bo Power Calling
-- w NEXUSIE raportuje TYDZIEŃ ISO, a wskaźniki MD — miesiąc. Przybliżanie
-- tygodnia z miesięcznej średniej byłoby zgadywaniem, czyli tym samym
-- defektem co dzielenie przez sztywne 5.
DROP FUNCTION IF EXISTS public.nexus_workdays_export(DATE, DATE);

CREATE OR REPLACE FUNCTION public.nexus_workdays_export(
    p_from   DATE,
    p_to     DATE,
    p_bucket TEXT DEFAULT 'month'
)
RETURNS TABLE (
    email          TEXT,
    period_start   DATE,
    period_end     DATE,
    business_days  INTEGER,
    absence_days   NUMERIC(5,1),
    working_days   NUMERIC(5,1)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH buckets AS (
        SELECT b.s AS period_start,
               CASE p_bucket
                   WHEN 'week'  THEN (b.s + interval '6 days')::date
                   ELSE (b.s + interval '1 month - 1 day')::date
               END AS period_end
        FROM generate_series(
                 date_trunc(CASE p_bucket WHEN 'week' THEN 'week' ELSE 'month' END, p_from)::date,
                 date_trunc(CASE p_bucket WHEN 'week' THEN 'week' ELSE 'month' END, p_to)::date,
                 CASE p_bucket WHEN 'week' THEN interval '1 week' ELSE interval '1 month' END
             ) AS b(s)
    ),
    business AS (
        SELECT bk.period_start, bk.period_end, count(*)::int AS business_days
        FROM buckets bk
        CROSS JOIN LATERAL generate_series(bk.period_start, bk.period_end, interval '1 day') AS d(day)
        WHERE EXTRACT(ISODOW FROM d.day) < 6
          AND NOT EXISTS (SELECT 1 FROM public.public_holidays h WHERE h.date = d.day::date)
        GROUP BY bk.period_start, bk.period_end
    ),
    absence AS (
        SELECT p.email::text AS email,
               bk.period_start,
               SUM(CASE WHEN l.half_day IS NOT NULL THEN 0.5 ELSE 1 END)::numeric(5,1) AS absence_days
        FROM public.leave_requests l
        JOIN public.profiles p ON p.id = l.user_id
        JOIN buckets bk ON TRUE
        CROSS JOIN LATERAL generate_series(
            GREATEST(l.start_date, bk.period_start),
            LEAST(l.end_date, bk.period_end),
            interval '1 day'
        ) AS d(day)
        WHERE l.status = 'approved'
          AND EXTRACT(ISODOW FROM d.day) < 6
          AND NOT EXISTS (SELECT 1 FROM public.public_holidays h WHERE h.date = d.day::date)
        GROUP BY p.email, bk.period_start
    )
    SELECT p.email::text                              AS email,
           b.period_start                             AS period_start,
           b.period_end                               AS period_end,
           b.business_days                            AS business_days,
           COALESCE(a.absence_days, 0)::numeric(5,1)  AS absence_days,
           GREATEST(0, b.business_days - COALESCE(a.absence_days, 0))::numeric(5,1) AS working_days
    FROM public.profiles p
    CROSS JOIN business b
    LEFT JOIN absence a ON a.email = p.email::text AND a.period_start = b.period_start
    WHERE p.email IS NOT NULL
      -- Okno zatrudnienia: bez niego do NEXUSA jechalyby adresy osob, ktore
      -- odeszly albo jeszcze nie zaczely, z absence_days=0 — nieodroznialne
      -- od kogos, kto po prostu nie bral urlopu. NULL nie wyklucza (brak daty
      -- znaczy „nie wiemy", nie „nie pracowal").
      AND (p.hired_at IS NULL OR p.hired_at <= b.period_end)
      AND (p.termination_date IS NULL OR p.termination_date >= b.period_start)
    ORDER BY p.email, b.period_start;
$$;

COMMENT ON FUNCTION public.nexus_workdays_export(DATE, DATE, TEXT) IS
    'Eksport dni roboczych dla NEXUSA (D5). Zwraca WYŁĄCZNIE liczby dni — '
    'nigdy leave_type, note ani documentation_url. Typ nieobecności to dana '
    'o zdrowiu; kontrakt wymusza sygnatura, nie dyscyplina wołającego.';

REVOKE ALL ON FUNCTION public.nexus_workdays_export(DATE, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nexus_workdays_export(DATE, DATE, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.nexus_workdays_export(DATE, DATE, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_workdays_export(DATE, DATE, TEXT) TO service_role;

-- Samosprawdzenie: migracja, która cicho nic nie zmieniła, jest gorsza niż
-- taka, która padła — bo wygląda na wdrożoną.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'nexus_workdays_export'
          AND p.pronargs = 3
    ) THEN
        RAISE EXCEPTION 'Samosprawdzenie: funkcja nexus_workdays_export nie istnieje po migracji';
    END IF;
END $$;

COMMIT;
