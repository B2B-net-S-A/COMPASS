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

CREATE OR REPLACE FUNCTION public.nexus_workdays_export(
    p_from DATE,
    p_to   DATE
)
RETURNS TABLE (
    email          TEXT,
    month          DATE,
    business_days  INTEGER,
    absence_days   NUMERIC(5,1),
    working_days   NUMERIC(5,1)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH months AS (
        SELECT generate_series(
                   date_trunc('month', p_from)::date,
                   date_trunc('month', p_to)::date,
                   interval '1 month'
               )::date AS m
    ),
    -- Dni robocze miesiąca: pon-pt minus święta. Święta w weekend nie
    -- odejmują się dwa razy, bo filtr dnia tygodnia jest wspólny.
    business AS (
        SELECT months.m AS m,
               count(*)::int AS business_days
        FROM months
        CROSS JOIN LATERAL generate_series(
            months.m,
            (months.m + interval '1 month - 1 day')::date,
            interval '1 day'
        ) AS d(day)
        WHERE EXTRACT(ISODOW FROM d.day) < 6
          AND NOT EXISTS (
              SELECT 1 FROM public.public_holidays h WHERE h.date = d.day::date
          )
        GROUP BY months.m
    ),
    -- Nieobecności: liczymy DNI ROBOCZE objęte zatwierdzonym wnioskiem,
    -- przycięte do miesiąca. Pół dnia to 0.5 — CHECK dopuszcza je wyłącznie
    -- dla wniosku jednodniowego, więc mnożnik stosuje się do całego wniosku.
    absence AS (
        SELECT p.email::text AS email,
               months.m      AS m,
               SUM(
                   CASE WHEN l.half_day IS NOT NULL THEN 0.5 ELSE 1 END
               )::numeric(5,1) AS absence_days
        FROM public.leave_requests l
        JOIN public.profiles p ON p.id = l.user_id
        JOIN months ON TRUE
        CROSS JOIN LATERAL generate_series(
            GREATEST(l.start_date, months.m),
            LEAST(l.end_date, (months.m + interval '1 month - 1 day')::date),
            interval '1 day'
        ) AS d(day)
        WHERE l.status = 'approved'
          AND EXTRACT(ISODOW FROM d.day) < 6
          AND NOT EXISTS (
              SELECT 1 FROM public.public_holidays h WHERE h.date = d.day::date
          )
        GROUP BY p.email, months.m
    )
    SELECT p.email::text                                   AS email,
           b.m                                             AS month,
           b.business_days                                 AS business_days,
           COALESCE(a.absence_days, 0)::numeric(5,1)       AS absence_days,
           GREATEST(
               0,
               b.business_days - COALESCE(a.absence_days, 0)
           )::numeric(5,1)                                 AS working_days
    FROM public.profiles p
    CROSS JOIN business b
    LEFT JOIN absence a ON a.email = p.email::text AND a.m = b.m
    WHERE p.email IS NOT NULL
      -- Okno zatrudnienia. Bez niego do NEXUSA jechałyby adresy osób, które
      -- odeszły albo jeszcze nie zaczęły — z `absence_days = 0`, czyli
      -- nieodróżnialne od kogoś, kto po prostu nie brał urlopu. Wysyłanie
      -- e-maila byłego pracownika do zewnętrznego systemu nie ma uzasadnienia.
      --
      -- NULL nie wyklucza: 8 z 46 profili nie ma `hired_at`, a brak daty
      -- znaczy „nie wiemy", nie „nie pracował".
      AND (p.hired_at IS NULL OR p.hired_at <= (b.m + interval '1 month - 1 day')::date)
      AND (p.termination_date IS NULL OR p.termination_date >= b.m)
    ORDER BY p.email, b.m;
$$;

COMMENT ON FUNCTION public.nexus_workdays_export(DATE, DATE) IS
    'Eksport dni roboczych dla NEXUSA (D5). Zwraca WYŁĄCZNIE liczby dni — '
    'nigdy leave_type, note ani documentation_url. Typ nieobecności to dana '
    'o zdrowiu; kontrakt wymusza sygnatura, nie dyscyplina wołającego.';

REVOKE ALL ON FUNCTION public.nexus_workdays_export(DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nexus_workdays_export(DATE, DATE) FROM anon;
REVOKE ALL ON FUNCTION public.nexus_workdays_export(DATE, DATE) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_workdays_export(DATE, DATE) TO service_role;

-- Samosprawdzenie: migracja, która cicho nic nie zmieniła, jest gorsza niż
-- taka, która padła — bo wygląda na wdrożoną.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'nexus_workdays_export'
    ) THEN
        RAISE EXCEPTION 'Samosprawdzenie: funkcja nexus_workdays_export nie istnieje po migracji';
    END IF;
END $$;

COMMIT;
