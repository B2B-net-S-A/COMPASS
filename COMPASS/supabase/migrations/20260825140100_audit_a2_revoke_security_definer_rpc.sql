-- Audyt 2026-08-25 · KROK A2 — odebrać `authenticated` prawo wykonania trzech
-- funkcji SECURITY DEFINER, które nie sprawdzają, kim jest wywołujący.
--
-- ⚠️ KOLEJNOŚĆ: ta migracja WYMAGA, żeby na produkcji był już wdrożony kod, w którym
--    lib/auth/sync-role.ts tworzy klienta service-role sam (KROK A0.1). Zastosowana
--    wcześniej odbiera uprawnienie ścieżce logowania i NIKT SIĘ NIE ZALOGUJE —
--    ani hasłem, ani przez SSO.
--
-- 1. public.sync_user_role(uuid, text, boolean)
--    p_user_id, p_email ORAZ p_is_super_admin to parametry od wywołującego, a funkcja
--    nie odwołuje się do auth.uid() ani razu. Trzy nadużycia, każde jednym POST
--    /rest/v1/rpc/sync_user_role z konta dowolnego pracownika:
--      (a) p_is_super_admin => true            → nadaj sobie rolę admin
--      (b) p_email = adres z admin_access_list → to samo, bez parametru boolean
--      (c) cudzy p_user_id + obcy e-mail       → ZDEGRADUJ istniejącego admina
--                                                do roli consultant (gałąź ELSE
--                                                nie chroni roli admin)
--
-- 2. public.start_offboarding_for_user(uuid, date, date, uuid)
-- 3. public.start_onboarding_for_user(uuid, uuid, uuid)
--    Obie SECURITY DEFINER, obie z EXECUTE dla `authenticated`, obie bez sprawdzania
--    uprawnień w ciele. Dowolny zalogowany mógł ustawić dowolnej osobie
--    employment_status='offboarding' + termination_date, założyć exit interview
--    i podpisać wpis w niemodyfikowalnym lifecycle_events cudzym UUID-em.
--
-- Wszystkie ścieżki aplikacyjne wołają te funkcje service-rolą po guardzie
-- (lib/actions/lifecycle.ts, lib/actions/user-admin.ts), więc REVOKE nie zabiera
-- żadnemu istniejącemu przepływowi niczego. Precedens w tym repo:
-- 20260716000001_people_ops_security_containment.sql:110-125.

REVOKE EXECUTE ON FUNCTION public.sync_user_role(uuid, text, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.start_offboarding_for_user(uuid, date, date, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.start_onboarding_for_user(uuid, uuid, uuid) FROM authenticated;

DO $$
DECLARE
    v_leftover text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO v_leftover
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('sync_user_role', 'start_offboarding_for_user', 'start_onboarding_for_user')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

    IF v_leftover IS NOT NULL THEN
        RAISE EXCEPTION 'A2 nie zadziałał — authenticated nadal może wykonać: %', v_leftover;
    END IF;
END $$;
