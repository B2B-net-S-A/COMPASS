-- Audyt 2026-09-22 — uszczelnienie RLS po raporcie outputs/audit-2026-09-22/RAPORT.md.
--
-- Pięć niezależnych poprawek, każda zamyka ścieżkę, którą aplikacja blokowała wyłącznie
-- w server actions, a baza przepuszczała przy bezpośrednim wywołaniu Data API:
--
--   SEC-04  leave_requests: pracownik mógł wstawić własny urlop od razu jako `approved`
--           (gałąź self polityki INSERT nie sprawdzała statusu ani decydenta).
--   SEC-05  timesheets: to samo dla timesheetu wstawianego jako `approved`.
--   SEC-12  timesheet_entries: trigger nadgodzin weryfikował osobę wskazaną w payloadzie
--           (NEW.override_by), a nie faktycznego wykonawcę — wystarczyło wpisać UUID admina.
--   SEC-03  profiles: trigger pinujący pomijał employment_type, email, loyalty_points,
--           loyalty_tier — owner mógł zmienić sobie typ umowy i saldo lojalności.
--   HF-14   start_offboarding_for_user: anulowany exit interview blokował nowy na zawsze.
--   O06     public_holidays: brak Wigilii (dzień ustawowo wolny od 2025, Dz.U. 2024 poz. 1965).
--
-- Legalne ścieżki zapisu (sprawdzone w kodzie):
--   * createLeaveOnBehalf / approve / reject — service client (auth.uid() IS NULL) albo gałęzie
--     on-behalf polityki, których nie ruszamy. Auto-akceptacja L4 działa na wierszu `pending`.
--   * nagłówek timesheetu — insert bez statusu (DEFAULT 'draft').
--   * override nadgodzin — właściciel z can_log_overtime wpisuje override_by = sam siebie
--     (resolveOvertimeColumns); approverAddEntry idzie service clientem.
--   * employment_type — wyłącznie service client (internal-rates.ts, user-admin.ts).
--   * loyalty_* — wyłącznie trigger update_loyalty_status na loyalty_transactions
--     (pg_trigger_depth() > 1); użytkownik nie ma INSERT na loyalty_transactions.

BEGIN;

-- ─── SEC-04 ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "leave_insert_self_or_on_behalf" ON public.leave_requests;
CREATE POLICY "leave_insert_self_or_on_behalf" ON public.leave_requests
    FOR INSERT TO authenticated
    WITH CHECK (
        (
            (SELECT auth.uid()) = user_id
            AND is_internal_or_admin()
            AND created_on_behalf = FALSE
            -- Self-service zawsze startuje jako wniosek do decyzji.
            AND status = 'pending'
            AND decided_by IS NULL
            AND decided_at IS NULL
        )
        OR (is_admin() AND created_by = (SELECT auth.uid()) AND created_on_behalf = TRUE)
        OR (is_manager_of(user_id) AND created_by = (SELECT auth.uid()) AND created_on_behalf = TRUE)
    );

-- ─── SEC-05 ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "timesheets_insert_self" ON public.timesheets;
CREATE POLICY "timesheets_insert_self" ON public.timesheets
    FOR INSERT TO authenticated
    WITH CHECK (
        is_internal_or_admin()
        AND (SELECT auth.uid()) = user_id
        AND status = 'draft'
        AND approved_by IS NULL
        AND approved_at IS NULL
    );

-- ─── SEC-12 ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_overtime_override_admin_only()
RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
    v_actor UUID := auth.uid();
    v_role TEXT;
    v_can_log_overtime BOOLEAN;
BEGIN
    IF NEW.is_overtime_override = TRUE THEN
        -- Zapis klientem użytkownika: zgodę może udzielić tylko on sam. Wcześniej trigger
        -- czytał rolę osoby wskazanej w payloadzie, więc wystarczyło podać UUID admina.
        -- Service role (v_actor IS NULL, np. approverAddEntry) waliduje jak dotąd override_by.
        IF v_actor IS NOT NULL AND NEW.override_by IS DISTINCT FROM v_actor THEN
            -- UPDATE, który nie rusza istniejącej zgody, zostaje przepuszczony.
            IF NOT (TG_OP = 'UPDATE'
                    AND OLD.is_overtime_override = TRUE
                    AND NEW.override_by IS NOT DISTINCT FROM OLD.override_by
                    AND NEW.hours IS NOT DISTINCT FROM OLD.hours) THEN
                RAISE EXCEPTION 'override_by must be the acting user'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;

        SELECT role::text, can_log_overtime
          INTO v_role, v_can_log_overtime
        FROM profiles
        WHERE id = NEW.override_by;

        IF v_role IS NULL THEN
            RAISE EXCEPTION 'override_by must reference an existing profile'
                USING ERRCODE = 'P0001';
        END IF;

        IF v_role <> 'admin' AND COALESCE(v_can_log_overtime, FALSE) = FALSE THEN
            RAISE EXCEPTION 'Only admin or a user granted can_log_overtime may apply overtime override (got role: %)', v_role
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- Trigger mógł nie istnieć na produkcji (rozjazd repo↔rejestr) — zakładamy go jawnie.
DROP TRIGGER IF EXISTS timesheet_entries_enforce_override ON public.timesheet_entries;
CREATE TRIGGER timesheet_entries_enforce_override
    BEFORE INSERT OR UPDATE ON public.timesheet_entries
    FOR EACH ROW EXECUTE FUNCTION public.enforce_overtime_override_admin_only();

-- ─── SEC-03 ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pin_profile_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
    -- Zmiana salda/poziomu z triggera update_loyalty_status (loyalty_transactions → profiles)
    -- ma głębokość > 1. Bezpośredni PATCH /rest/v1/profiles ma głębokość 1.
    v_from_loyalty_trigger BOOLEAN := pg_trigger_depth() > 1;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
        IF NEW.role IS DISTINCT FROM OLD.role
            OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
            OR NEW.employment_status IS DISTINCT FROM OLD.employment_status
            OR NEW.is_inbox_handler IS DISTINCT FROM OLD.is_inbox_handler
            OR NEW.has_tcm_access IS DISTINCT FROM OLD.has_tcm_access
            OR NEW.can_log_overtime IS DISTINCT FROM OLD.can_log_overtime
            OR NEW.can_view_tech_map IS DISTINCT FROM OLD.can_view_tech_map
            OR NEW.can_view_legal_monitor IS DISTINCT FROM OLD.can_view_legal_monitor
            OR NEW.leave_entitlement_days IS DISTINCT FROM OLD.leave_entitlement_days
            OR NEW.termination_date IS DISTINCT FROM OLD.termination_date
            OR NEW.leave_carried_over_days IS DISTINCT FROM OLD.leave_carried_over_days
            OR NEW.leave_used_initial_days IS DISTINCT FROM OLD.leave_used_initial_days
            OR NEW.hired_at IS DISTINCT FROM OLD.hired_at
            OR NEW.is_external IS DISTINCT FROM OLD.is_external
            OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
            OR NEW.email IS DISTINCT FROM OLD.email
            OR (NOT v_from_loyalty_trigger AND (
                   NEW.loyalty_points IS DISTINCT FROM OLD.loyalty_points
                OR NEW.loyalty_tier IS DISTINCT FROM OLD.loyalty_tier))
        THEN
            INSERT INTO public.audit_logs (user_id, action, details, ip_address)
            VALUES (
                auth.uid(),
                'PROFILE_PRIVILEGE_CHANGE_BLOCKED',
                jsonb_build_object(
                    'target_user_id', NEW.id,
                    'attempted_role', NEW.role,
                    'current_role', OLD.role,
                    'attempted_employment_status', NEW.employment_status,
                    'attempted_employment_type', NEW.employment_type
                ),
                'trigger'
            );
        END IF;

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
        NEW.employment_type         := OLD.employment_type;
        -- profiles.email trafia do eksportu rosteru dla NEXUSA — nie może go zmieniać owner.
        NEW.email                   := OLD.email;
        IF NOT v_from_loyalty_trigger THEN
            NEW.loyalty_points      := OLD.loyalty_points;
            NEW.loyalty_tier        := OLD.loyalty_tier;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ─── HF-14 ─────────────────────────────────────────────────────────────────
-- Podmieniamy wyłącznie warunek podwójnego startu na ŻYWEJ definicji funkcji, żeby nie
-- nadpisać reszty ciała wersją z repo (repo i rejestr migracji są rozjechane).
DO $$
DECLARE
    v_def TEXT;
    v_new TEXT;
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'start_offboarding_for_user';

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'HF-14: brak funkcji start_offboarding_for_user';
    END IF;

    IF position('status NOT IN (''archived'', ''cancelled'')' IN v_def) > 0 THEN
        RETURN; -- już zaaplikowane
    END IF;

    v_new := replace(v_def, 'AND status <> ''archived''', 'AND status NOT IN (''archived'', ''cancelled'')');
    IF v_new = v_def THEN
        RAISE EXCEPTION 'HF-14: nie znaleziono warunku podwójnego startu w start_offboarding_for_user';
    END IF;
    EXECUTE v_new;
END $$;

-- ─── O06 ───────────────────────────────────────────────────────────────────
INSERT INTO public.public_holidays (date, name_pl) VALUES
    ('2026-12-24', 'Wigilia Bożego Narodzenia'),
    ('2027-12-24', 'Wigilia Bożego Narodzenia'),
    ('2028-12-24', 'Wigilia Bożego Narodzenia'),
    ('2029-12-24', 'Wigilia Bożego Narodzenia'),
    ('2030-12-24', 'Wigilia Bożego Narodzenia')
ON CONFLICT (date) DO NOTHING;

-- ─── Samosprawdzenie ───────────────────────────────────────────────────────
DO $$
DECLARE
    v_check TEXT;
BEGIN
    SELECT pg_get_expr(p.polwithcheck, p.polrelid) INTO v_check
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = 'leave_requests' AND p.polname = 'leave_insert_self_or_on_behalf';
    IF v_check IS NULL OR position('decided_by IS NULL' IN v_check) = 0 THEN
        RAISE EXCEPTION 'SEC-04 nie zadziałał: %', v_check;
    END IF;

    SELECT pg_get_expr(p.polwithcheck, p.polrelid) INTO v_check
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = 'timesheets' AND p.polname = 'timesheets_insert_self';
    IF v_check IS NULL OR position('approved_by IS NULL' IN v_check) = 0 THEN
        RAISE EXCEPTION 'SEC-05 nie zadziałał: %', v_check;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         WHERE c.relname = 'timesheet_entries'
           AND t.tgname = 'timesheet_entries_enforce_override' AND NOT t.tgisinternal
    ) OR position('must be the acting user' IN pg_get_functiondef('public.enforce_overtime_override_admin_only()'::regprocedure)) = 0 THEN
        RAISE EXCEPTION 'SEC-12 nie zadziałał';
    END IF;

    IF position('NEW.employment_type         := OLD.employment_type' IN
                pg_get_functiondef('public.pin_profile_privilege_columns()'::regprocedure)) = 0
       OR NOT EXISTS (
            SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
             WHERE c.relname = 'profiles' AND t.tgname = 'trg_pin_profile_privilege_columns'
               AND NOT t.tgisinternal) THEN
        RAISE EXCEPTION 'SEC-03 nie zadziałał';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'start_offboarding_for_user'
           AND position('status NOT IN (''archived'', ''cancelled'')' IN pg_get_functiondef(p.oid)) > 0
    ) THEN
        RAISE EXCEPTION 'HF-14 nie zadziałał';
    END IF;

    IF (SELECT count(*) FROM public.public_holidays
         WHERE to_char(date, 'MM-DD') = '12-24' AND date BETWEEN '2026-01-01' AND '2030-12-31') <> 5 THEN
        RAISE EXCEPTION 'O06 nie zadziałał — brak Wigilii w public_holidays';
    END IF;
END $$;

COMMIT;
