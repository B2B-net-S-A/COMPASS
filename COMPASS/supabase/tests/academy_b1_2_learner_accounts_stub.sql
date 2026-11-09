-- Doklejane po stubie i migracji B1.1. Minimalny stan po 20261109120000 (bramka kont).
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth, academy_private TO service_role;

ALTER TABLE auth.users ADD COLUMN raw_app_meta_data jsonb DEFAULT '{}', ADD COLUMN raw_user_meta_data jsonb DEFAULT '{}';
ALTER TABLE public.profiles
    ADD COLUMN email text, ADD COLUMN full_name text, ADD COLUMN avatar_url text,
    ADD COLUMN manager_id uuid, ADD COLUMN is_inbox_handler boolean, ADD COLUMN has_tcm_access boolean,
    ADD COLUMN can_log_overtime boolean, ADD COLUMN can_view_tech_map boolean, ADD COLUMN can_view_legal_monitor boolean,
    ADD COLUMN leave_entitlement_days int, ADD COLUMN termination_date date, ADD COLUMN leave_carried_over_days int,
    ADD COLUMN leave_used_initial_days int, ADD COLUMN hired_at date, ADD COLUMN employment_type text,
    ADD COLUMN loyalty_points int, ADD COLUMN loyalty_tier text;
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'consultant';
CREATE TABLE public.audit_logs (user_id uuid, action text, details jsonb, ip_address text);

CREATE TABLE public.academy_learner_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE CHECK (email = lower(email) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
    full_name text, source text, source_ref text,
    user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    info_accepted_at timestamptz, first_login_at timestamptz, ended_at timestamptz
);
ALTER TABLE public.academy_learner_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_learner_accounts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.academy_learner_accounts TO service_role;

CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE FUNCTION public.pin_profile_privilege_columns() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER trg_pin_profile_privilege_columns BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.pin_profile_privilege_columns();
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.audit_logs TO authenticated;
