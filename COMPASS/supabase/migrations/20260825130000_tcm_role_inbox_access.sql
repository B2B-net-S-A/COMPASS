-- ============================================================================
-- Skrzynka administracja@: rola talent_community + grant has_tcm_access
-- (decyzja Artura, 2026-08-25: „wszystkie osoby Talent Community Manager
-- powinni to mieć" + „cała sekcja People Ops — adminowie też, finanse też,
-- Dominik Zwierzchowski też").
-- ============================================================================
-- Dotąd dostęp = admin OR flaga is_inbox_handler per-osoba; nowy TCM bez flagi
-- (case: Olaf Moczydłowski) nie widział kanbanu, a finanse z grantem
-- has_tcm_access (People Ops, Phase 45) dostawali na zakładce Sprawy baner
-- odmowy. Teraz:
--   - rola admin / talent_community → dostęp,
--   - grant has_tcm_access (HR-zone, nie-konsultant — jak has_lifecycle_access) → dostęp,
--   - flaga is_inbox_handler → dostęp (zostaje dla per-osoba nadań, np. manager).
-- Lustro w app-layer: isCallerHandler (support-inbox.ts) + guardy stron
-- /admin/inbox + badge w layout. Lista „osoba odpowiedzialna"
-- (listInboxHandlers) świadomie WĘŻSZA: TCM + is_inbox_handler (widzowie
-- z grantem nie są operatorami skrzynki).

CREATE OR REPLACE FUNCTION public.is_inbox_handler()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND (
            role::TEXT IN ('admin', 'talent_community')
            OR is_inbox_handler = true
            OR (has_tcm_access = TRUE AND role::TEXT <> 'consultant')
          )
    );
$function$;
