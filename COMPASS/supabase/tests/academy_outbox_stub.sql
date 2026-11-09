-- Minimalny schemat pod lokalny smoke test kolejki Akademii na czystym postgres:17.
-- Tylko to, do czego odwołuje się migracja. Nie uruchamiać na produkcji.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA academy_private;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.profiles(id uuid PRIMARY KEY);
CREATE TABLE public.course_runs(id uuid PRIMARY KEY);
CREATE FUNCTION public.academy_can_access() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('app.smoke_editor', true) = 'true' $$;
CREATE FUNCTION public.academy_is_global_editor(p_user_id uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('app.smoke_editor', true) = 'true' $$;
