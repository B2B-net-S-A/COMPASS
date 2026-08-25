-- Audyt 2026-08-25 · KROK A3 — zablokować samodzielne nadanie sobie roli i flag grantów.
--
-- ⚠️ KOLEJNOŚĆ: ta migracja MUSI iść PO kroku A2. Dopóki `sync_user_role` jest osiągalna
--    kluczem użytkownika, auth.uid() w jej wnętrzu jest niepuste, więc trigger cofnąłby
--    jej legalny UPDATE — synchronizacja ról przestałaby działać BEZ ŻADNEGO BŁĘDU.
--
-- Polityka "Users can update own profile." (20240502000000_initial_schema.sql:22) ma
-- wyłącznie USING (auth.uid() = id). UWAGA: dopisanie WITH CHECK (auth.uid() = id) jest
-- NO-OPEM — Postgres przy braku WITH CHECK używa klauzuli USING także dla nowego wiersza,
-- więc pilnuje tylko tego, żeby nie zmieniło się `id`.
--
-- Prawdziwa przyczyna: RLS działa WIERSZOWO, a rola `authenticated` ma GRANT UPDATE na
-- wszystkich 69 kolumnach — w tym role, manager_id, employment_status i pięciu flagach
-- grantów. Jedyny istniejący trigger (trg_profile_offboarding_reversal) pilnuje wyłącznie
-- employment_status. Zwykły PATCH /rest/v1/profiles?id=eq.<ja> z {"role":"finanse"}
-- wystarczał, a `sync_user_role` przy logowaniu jawnie ZACHOWUJE role internal/finanse/
-- manager/talent_community — czyli eskalacja była trwała.
--
-- Wybrano deny-listę triggerem, a NIE allow-listę grantów kolumnowych: przy grantach
-- każda nowa kolumna profilu domyślnie przestawałaby się zapisywać, a błąd wyszedłby
-- w produkcji jako zamaskowany „An error occurred in the Server Components render".

CREATE OR REPLACE FUNCTION public.pin_profile_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
    -- auth.uid() IS NULL  → kontekst service-role (16 wywołań createServiceClient
    --                       w lib/actions/user-admin.ts) — przepuszczamy.
    -- public.is_admin()   → lib/actions/admin-management.ts:115 i :153 zmieniają rolę
    --                       klientem cookie zalogowanego admina — przepuszczamy.
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
        NEW.role                    := OLD.role;
        NEW.manager_id              := OLD.manager_id;
        NEW.employment_status       := OLD.employment_status;
        NEW.is_inbox_handler        := OLD.is_inbox_handler;
        NEW.has_tcm_access          := OLD.has_tcm_access;
        NEW.can_log_overtime        := OLD.can_log_overtime;
        NEW.can_view_tech_map       := OLD.can_view_tech_map;
        NEW.can_view_legal_monitor  := OLD.can_view_legal_monitor;
        NEW.leave_entitlement_days  := OLD.leave_entitlement_days;
        NEW.leave_carried_over_days := OLD.leave_carried_over_days;
        NEW.leave_used_initial_days := OLD.leave_used_initial_days;
        NEW.hired_at                := OLD.hired_at;
        NEW.termination_date        := OLD.termination_date;
        NEW.is_external             := OLD.is_external;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pin_profile_privilege_columns() IS
    'Audyt 2026-08: RLS na profiles jest wierszowa, a authenticated ma GRANT UPDATE na wszystkich kolumnach. Ten trigger przywraca kolumny uprawnień, gdy pisze ktoś inny niż service-role albo admin.';

DROP TRIGGER IF EXISTS trg_pin_profile_privilege_columns ON public.profiles;
CREATE TRIGGER trg_pin_profile_privilege_columns
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.pin_profile_privilege_columns();
