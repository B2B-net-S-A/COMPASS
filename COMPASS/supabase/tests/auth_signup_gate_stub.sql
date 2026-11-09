-- Stub schematu pod migrację 20261109120000_auth_signup_gate_profiles_rls.sql.
-- TYLKO lokalny, jednorazowy `postgres:17` (kontener do wyrzucenia). Odtwarza z produkcji
-- to, czego dotyka migracja: role, auth.users, storage, profiles z politykami sprzed zmiany
-- i tabele Akademii czytane przez RPC. Kolejność: ten plik → migracja → smoke.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE supabase_auth_admin NOLOGIN;

-- Domyślne uprawnienia jak w Supabase: nowe obiekty w public są od razu dostępne dla
-- anon/authenticated. Bez tego kontrola REVOKE w migracji niczego by nie dowodziła.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, supabase_auth_admin;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, supabase_auth_admin;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb NOT NULL DEFAULT '{}'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.users TO supabase_auth_admin;

CREATE SCHEMA academy_private;

CREATE TYPE public.user_role AS ENUM ('consultant', 'admin', 'internal', 'finanse', 'manager', 'talent_community');
CREATE DOMAIN public.vector AS text;

CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text,
    full_name text,
    avatar_url text,
    phone text,
    desired_rate_min numeric,
    role public.user_role NOT NULL DEFAULT 'consultant'
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_catalog AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog AS
$$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::text = 'admin') $$;

CREATE FUNCTION public.is_internal_or_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
        AND role::text IN ('admin', 'internal', 'finanse', 'manager', 'talent_community'))
$$;

CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles
    FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_select_team_for_internal_admin ON public.profiles
    FOR SELECT TO authenticated
    USING (public.is_internal_or_admin() AND role::text IN ('internal', 'admin', 'finanse', 'manager', 'talent_community'));
CREATE POLICY "Users can update own profile." ON public.profiles
    FOR UPDATE USING ((SELECT auth.uid()) = id);

-- Akademia: tyle, ile czyta RPC.
CREATE FUNCTION public.academy_can_access() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT auth.uid() IS NOT NULL $$;

CREATE TABLE public.courses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id uuid NOT NULL REFERENCES public.profiles(id),
    status text NOT NULL DEFAULT 'draft'
);
CREATE TABLE public.course_staff (
    course_id uuid NOT NULL REFERENCES public.courses(id),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    revoked_at timestamptz
);
CREATE TABLE public.course_run_staff (
    run_id uuid NOT NULL,
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    revoked_at timestamptz
);
CREATE TABLE public.course_questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id uuid NOT NULL REFERENCES public.courses(id),
    user_id uuid NOT NULL REFERENCES public.profiles(id)
);
CREATE TABLE public.course_answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES public.course_questions(id),
    user_id uuid NOT NULL REFERENCES public.profiles(id)
);
CREATE TABLE public.academy_discussion_grant (user_id uuid NOT NULL, question_id uuid NOT NULL);
CREATE FUNCTION public.academy_can_read_discussion(p_question_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT EXISTS (SELECT 1 FROM academy_discussion_grant g WHERE g.user_id = auth.uid() AND g.question_id = p_question_id) $$;

-- Wiadomości.
CREATE TABLE public.news_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id uuid NOT NULL REFERENCES public.profiles(id),
    published_at timestamptz,
    audience_role text[]
);
ALTER TABLE public.news_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY news_posts_select_published_audience ON public.news_posts FOR SELECT TO authenticated
    USING (public.is_admin() OR (published_at IS NOT NULL AND (audience_role IS NULL OR audience_role = '{}'
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role::text = ANY (audience_role)))));
CREATE TABLE public.news_reactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid NOT NULL REFERENCES public.news_posts(id),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    kind text NOT NULL DEFAULT 'like'
);
ALTER TABLE public.news_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY news_reactions_select_via_post_access ON public.news_reactions
    FOR SELECT TO authenticated USING (true);

-- Helpdesk.
CREATE TABLE public.support_tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    assignee_id uuid REFERENCES public.profiles(id)
);
CREATE TABLE public.support_ticket_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES public.support_tickets(id),
    author_id uuid NOT NULL REFERENCES public.profiles(id),
    is_internal boolean NOT NULL DEFAULT false
);

-- Przegląd: funkcja i widok, którym migracja odbiera anon.
CREATE FUNCTION public.match_courses(query_embedding public.vector, match_threshold double precision, match_count integer)
RETURNS TABLE(course_id uuid, similarity double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT NULL::uuid, 0::double precision WHERE false $$;
CREATE VIEW public.work_clock_daily WITH (security_invoker = true) AS SELECT 1 AS placeholder;

-- Storage: tylko polityki i kubeł, które zmienia migracja.
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
$$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
CREATE TABLE storage.buckets (id text PRIMARY KEY, public boolean NOT NULL DEFAULT false);
CREATE TABLE storage.objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id text NOT NULL REFERENCES storage.buckets(id),
    name text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
INSERT INTO storage.buckets (id, public) VALUES ('avatars', true), ('chat-attachments', true);
CREATE POLICY "Anyone can upload an avatar" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = 'profiles');
CREATE POLICY "Users can upload chat attachments" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);
CREATE POLICY "Users can view chat attachments" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'chat-attachments');
