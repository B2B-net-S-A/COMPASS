-- Schemat sprzed blokady pod lokalny smoke test na czystym postgres:17. Stara funkcja
-- academy_set_rollout tylko rzuca, żeby smoke padł, gdyby migracja jej nie zastąpiła.
-- Nie uruchamiać na produkcji.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text NOT NULL, is_external boolean DEFAULT false, employment_status text DEFAULT 'active');
CREATE TABLE public.academy_audit_events(actor_id uuid, action text, details jsonb);
INSERT INTO auth.users(id) SELECT gen_random_uuid() FROM generate_series(1, 22);
INSERT INTO public.profiles(id, role) SELECT id, CASE WHEN row_number() OVER () = 1 THEN 'admin' ELSE 'consultant' END FROM auth.users;
CREATE TABLE public.academy_rollout_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 mode text NOT NULL DEFAULT 'closed' CHECK(mode IN ('closed','pilot','open')),
 pilot_user_ids uuid[] NOT NULL DEFAULT '{}',
 updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.academy_rollout_settings DEFAULT VALUES;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') $$;
CREATE FUNCTION public.academy_can_access() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL $$;
CREATE FUNCTION public.academy_rollout_access() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT jsonb_build_object('mode', mode) FROM public.academy_rollout_settings $$;
CREATE FUNCTION public.academy_set_rollout(p_mode text, p_user_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN RAISE EXCEPTION 'stub: migracja powinna zastąpić tę funkcję'; END $function$;
REVOKE ALL ON FUNCTION public.academy_set_rollout(text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academy_set_rollout(text, uuid[]) TO authenticated;
