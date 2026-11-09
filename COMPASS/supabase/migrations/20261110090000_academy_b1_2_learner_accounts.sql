-- B1.2: model konta nauki. Lista kont powstała w 20261109120000_auth_signup_gate_profiles_rls.
-- Dokłada pola potrzebne przepustce, profiles.academy_only i odcina dostęp kontom zakończonym.
--
-- Znacznik pochodzi z auth.users.raw_app_meta_data, które ustawia tylko Admin API. Kolumna
-- w profiles służy politykom i filtrom w bazie, a aplikacja czyta sam znacznik (B1.4).
--
-- Kolejność: po 20261109120000 (tabela) i po 20261109210000 (B1.1, rollout_allows_user).
-- Cofnięcie: supabase/rollbacks/20261110090000_academy_b1_2_learner_accounts.sql
BEGIN;

ALTER TABLE public.academy_learner_accounts
    ADD COLUMN access_until timestamptz,
    ADD COLUMN disappeared_at timestamptz,
    ADD COLUMN info_version text,
    -- Znak wodny jednorazowych linków: link wystawiony przed tym czasem jest już zużyty.
    ADD COLUMN last_entry_at timestamptz,
    ADD CONSTRAINT academy_learner_accounts_source_check
        CHECK (source IS NULL OR source IN ('proba','umowa','reczne')),
    -- Pracownik loguje się przez SSO. Konto nauki na adresie firmowym ominęłoby tę drogę.
    ADD CONSTRAINT academy_learner_accounts_not_company_check
        CHECK (email !~ '@b2bnetwork\.pl$');

-- Konto próbne omija wyłączony przełącznik przepustki, więc nadać je wolno tylko SQL-em
-- właściciela. SECURITY INVOKER celowo: current_user to rola wołającego.
CREATE OR REPLACE FUNCTION academy_private.guard_learner_trial_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.source = 'proba'
        AND (TG_OP = 'INSERT' OR OLD.source IS DISTINCT FROM 'proba')
        AND current_user IN ('service_role', 'authenticated', 'anon') THEN
        RAISE EXCEPTION 'trial_source_requires_sql' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION academy_private.guard_learner_trial_source() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER academy_learner_trial_source_guard
    BEFORE INSERT OR UPDATE OF source ON public.academy_learner_accounts
    FOR EACH ROW EXECUTE FUNCTION academy_private.guard_learner_trial_source();

ALTER TABLE public.profiles ADD COLUMN academy_only boolean NOT NULL DEFAULT false;

-- Znacznik wynika z listy kont nauki, a nie z drogi założenia konta. Publiczny signup na adres
-- z listy przechodzi bramkę z 20261109120000, więc bez tego powstałoby zwykłe konto bez izolacji.
-- Admin API dopisuje app_metadata dopiero po INSERT, dlatego znacznik ustawia baza, a wyzwalacz
-- pilnuje też UPDATE: późniejszy zapis metadanych z pamięci serwera nie może go zgubić.
CREATE OR REPLACE FUNCTION academy_private.mark_learner_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.academy_learner_accounts a WHERE a.email = lower(NEW.email) AND a.ended_at IS NULL) THEN
        NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) || '{"academy_only": true}'::jsonb;
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION academy_private.mark_learner_account() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER academy_learner_mark_account
    BEFORE INSERT OR UPDATE OF raw_app_meta_data, email ON auth.users
    FOR EACH ROW EXECUTE FUNCTION academy_private.mark_learner_account();

-- Porównanie z wartością jsonb, nie z tekstem: napis "true" nie włącza izolacji w aplikacji,
-- więc nie może też ustawić kolumny.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_catalog' AS $function$
begin
  insert into public.profiles (id, email, full_name, avatar_url, academy_only)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url',
          coalesce(new.raw_app_meta_data->'academy_only' = 'true'::jsonb, false));
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pin_profile_privilege_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS $function$
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
            OR NEW.academy_only IS DISTINCT FROM OLD.academy_only
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
        NEW.academy_only            := OLD.academy_only;
        IF NOT v_from_loyalty_trigger THEN
            NEW.loyalty_points      := OLD.loyalty_points;
            NEW.loyalty_tier        := OLD.loyalty_tier;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- Zakończone albo przeterminowane konto nauki traci Akademię także przy żywej sesji.
CREATE OR REPLACE FUNCTION academy_private.rollout_allows_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.academy_is_global_editor(p_user_id) OR EXISTS (
  SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
  CROSS JOIN public.academy_rollout_settings s WHERE p.id=p_user_id
   AND p.role::text IN ('consultant','internal','manager','finanse') AND NOT COALESCE(p.is_external,false)
   AND COALESCE(p.employment_status::text,'active')<>'exited'
   AND (s.mode='open' OR (s.mode='pilot' AND p.id=ANY(s.pilot_user_ids)))
   AND NOT EXISTS (
    SELECT 1 FROM public.academy_learner_accounts a
    WHERE a.user_id=p.id AND (a.ended_at IS NOT NULL OR (a.access_until IS NOT NULL AND a.access_until<=now()))
   )
 );
$$;

DO $check$
DECLARE v_def text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='profiles' AND column_name='academy_only' AND is_nullable='NO') THEN
        RAISE EXCEPTION 'b1_2_academy_only_missing';
    END IF;
    IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='academy_learner_accounts'
        AND column_name IN ('access_until','disappeared_at','info_version','last_entry_at')) <> 4 THEN
        RAISE EXCEPTION 'b1_2_learner_columns_missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='academy_learner_trial_source_guard' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'b1_2_trial_guard_missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='academy_learner_mark_account' AND tgrelid='auth.users'::regclass AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'b1_2_mark_trigger_missing';
    END IF;
    v_def := pg_get_functiondef('public.pin_profile_privilege_columns()'::regprocedure);
    IF v_def NOT LIKE '%NEW.academy_only            := OLD.academy_only%' THEN RAISE EXCEPTION 'b1_2_pin_missing'; END IF;
    v_def := pg_get_functiondef('public.handle_new_user()'::regprocedure);
    IF v_def NOT LIKE '%raw_app_meta_data%' OR v_def LIKE '%raw_user_meta_data->>''academy_only''%' THEN
        RAISE EXCEPTION 'b1_2_handle_new_user_wrong_source';
    END IF;
    v_def := pg_get_functiondef('academy_private.rollout_allows_user(uuid)'::regprocedure);
    IF v_def NOT LIKE '%academy_learner_accounts%' THEN RAISE EXCEPTION 'b1_2_rollout_end_missing'; END IF;
    IF has_table_privilege('authenticated','public.academy_learner_accounts','SELECT') THEN
        RAISE EXCEPTION 'b1_2_learner_table_exposed';
    END IF;
END $check$;

COMMIT;
