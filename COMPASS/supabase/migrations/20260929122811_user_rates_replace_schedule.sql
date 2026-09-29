-- Stawki: naprawa zapisu + zmiana od dowolnego miesiąca (także bieżącego i wstecz) zamiast samego dopisywania.
--
-- Dotąd `auto_close_previous_rate` przyjmował wyłącznie wiersze od 1. dnia przyszłego
-- miesiąca i ściśle po OSTATNIM zaplanowanym kroku. Import XLS z 2026-05-21 zasiał rampy
-- sięgające 2028 r. (17 osób ma zaplanowane przyszłe kroki), więc dla tych osób każdy
-- miesiąc do końca rampy był odrzucany — finanse nie mogły zmienić stawki ani na
-- przyszłość, ani korygować bieżącego miesiąca.
--
-- Druga, niezależna awaria: `set_user_rate_progression` ma `SET search_path TO ''`, a trigger
-- odwoływał się do `user_rates` i `next_month_first_day()` bez schematu. Trigger dziedziczy
-- search_path wołającego, więc KAŻDY zapis przez tę funkcję padał na „relation user_rates
-- does not exist" (w audit_logs nie ma ani jednego USER_RATE_PROGRESSION_SET). Trigger
-- dostaje teraz pełne nazwy i własny search_path.
--
-- Nowa funkcja `replace_user_rate_schedule` w JEDNEJ transakcji:
--   1. usuwa wiersze od `p_replace_from` wzwyż (stary harmonogram od tego miesiąca),
--   2. otwiera ponownie wiersz obowiązujący tuż przed `p_replace_from`,
--   3. wstawia nowe punkty zmiany (trigger domyka poprzedni wiersz jak dotąd).
-- Pusta `p_entries` = „usuń zaplanowane zmiany od miesiąca X" (obowiązuje stawka sprzed X).
--
-- Trigger zachowuje blokadę wstecznych dat dla każdego innego INSERT-a; przepuszcza je
-- tylko pod flagą transakcyjną ustawianą wewnątrz tej funkcji. Funkcję woła wyłącznie
-- service_role (akcja `setRateProgression`, guard finanse/admin w aplikacji).

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_close_previous_rate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    existing_id UUID;
    existing_effective_from DATE;
    min_allowed DATE;
BEGIN
    -- Flaga ustawiana (is_local) wyłącznie przez replace_user_rate_schedule.
    IF coalesce(current_setting('compass.rate_schedule_replace', true), '') <> 'on' THEN
        min_allowed := public.next_month_first_day();
        IF NEW.effective_from < min_allowed THEN
            RAISE EXCEPTION 'effective_from (%) must be >= % (first day of next month). No mid-month or past rate changes.',
                NEW.effective_from, min_allowed
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    SELECT id, effective_from INTO existing_id, existing_effective_from
    FROM public.user_rates
    WHERE user_id = NEW.user_id AND effective_to IS NULL
    ORDER BY effective_from DESC LIMIT 1;

    IF existing_id IS NOT NULL THEN
        IF NEW.effective_from <= existing_effective_from THEN
            RAISE EXCEPTION 'New rate effective_from (%) must be > existing rate effective_from (%).',
                NEW.effective_from, existing_effective_from
                USING ERRCODE = 'P0001';
        END IF;

        UPDATE public.user_rates
        SET effective_to = NEW.effective_from
        WHERE id = existing_id;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.replace_user_rate_schedule(
    p_user_id      uuid,
    p_currency     text,
    p_replace_from date,
    p_entries      jsonb,
    p_set_by       uuid,
    p_reason       text
)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    e             JSONB;
    v_from        DATE;
    v_prev        DATE := NULL;
    v_prev_id     UUID;
    inserted_cnt  INTEGER := 0;
BEGIN
    IF p_user_id IS NULL OR p_replace_from IS NULL THEN
        RAISE EXCEPTION 'replace_user_rate_schedule: p_user_id i p_replace_from są wymagane.'
            USING ERRCODE = 'P0001';
    END IF;
    IF extract(day FROM p_replace_from) <> 1 THEN
        RAISE EXCEPTION 'replace_user_rate_schedule: p_replace_from (%) musi być 1. dniem miesiąca.', p_replace_from
            USING ERRCODE = 'P0001';
    END IF;
    IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'replace_user_rate_schedule: p_entries musi być tablicą JSON.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Walidacja PRZED jakimkolwiek DELETE: rosnące, unikalne, nie wcześniej niż p_replace_from.
    FOR e IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
        v_from := (e->>'effective_from')::DATE;
        IF v_from < p_replace_from THEN
            RAISE EXCEPTION 'replace_user_rate_schedule: miesiąc % jest wcześniejszy niż %.', v_from, p_replace_from
                USING ERRCODE = 'P0001';
        END IF;
        IF v_prev IS NOT NULL AND v_from <= v_prev THEN
            RAISE EXCEPTION 'replace_user_rate_schedule: miesiące muszą być rosnące i unikalne (problem przy %).', v_from
                USING ERRCODE = 'P0001';
        END IF;
        v_prev := v_from;
    END LOOP;

    -- Dwie równoległe zmiany tej samej osoby nie mogą się przeplatać.
    PERFORM pg_advisory_xact_lock(hashtext('user_rates:' || p_user_id::text));

    DELETE FROM public.user_rates
     WHERE user_id = p_user_id AND effective_from >= p_replace_from;

    -- Wiersz obowiązujący tuż przed p_replace_from staje się znów otwarty;
    -- pierwszy INSERT poniżej domknie go na nowej dacie (trigger).
    SELECT id INTO v_prev_id
      FROM public.user_rates
     WHERE user_id = p_user_id AND effective_from < p_replace_from
     ORDER BY effective_from DESC
     LIMIT 1;
    IF v_prev_id IS NOT NULL THEN
        UPDATE public.user_rates SET effective_to = NULL WHERE id = v_prev_id AND effective_to IS NOT NULL;
    END IF;

    PERFORM set_config('compass.rate_schedule_replace', 'on', true);
    FOR e IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
        INSERT INTO public.user_rates (user_id, hourly_rate, currency, effective_from, set_by, reason)
        VALUES (
            p_user_id,
            (e->>'hourly_rate')::NUMERIC,
            p_currency,
            (e->>'effective_from')::DATE,
            p_set_by,
            p_reason
        );
        inserted_cnt := inserted_cnt + 1;
    END LOOP;
    PERFORM set_config('compass.rate_schedule_replace', 'off', true);

    RETURN inserted_cnt;
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_user_rate_schedule(uuid, text, date, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_user_rate_schedule(uuid, text, date, jsonb, uuid, text) TO service_role;

COMMENT ON FUNCTION public.replace_user_rate_schedule(uuid, text, date, jsonb, uuid, text) IS
    'Zastępuje harmonogram stawek osoby od p_replace_from (usuwa wiersze >= p_replace_from, wstawia p_entries). Dozwolone daty wsteczne. Tylko service_role.';

-- Samosprawdzenie.
DO $$
DECLARE
    v_def text;
BEGIN
    v_def := pg_get_functiondef('public.auto_close_previous_rate()'::regprocedure);
    IF position('compass.rate_schedule_replace' IN v_def) = 0
       OR position('FROM public.user_rates' IN v_def) = 0
       OR position('No mid-month or past rate changes' IN v_def) = 0 THEN
        RAISE EXCEPTION 'auto_close_previous_rate: brak flagi albo zgubiona blokada wstecznych dat';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         WHERE c.relname = 'user_rates' AND t.tgname = 'user_rates_auto_close' AND NOT t.tgisinternal
    ) THEN
        RAISE EXCEPTION 'brak triggera user_rates_auto_close';
    END IF;

    IF to_regprocedure('public.replace_user_rate_schedule(uuid, text, date, jsonb, uuid, text)') IS NULL THEN
        RAISE EXCEPTION 'brak funkcji replace_user_rate_schedule';
    END IF;

    IF has_function_privilege('authenticated', 'public.replace_user_rate_schedule(uuid, text, date, jsonb, uuid, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.replace_user_rate_schedule(uuid, text, date, jsonb, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'replace_user_rate_schedule wykonywalna przez anon/authenticated';
    END IF;
END $$;

COMMIT;
