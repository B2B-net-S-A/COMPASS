-- Minimalny szkielet schematu Akademii do weryfikacji migracji B0 na pustym postgres:17.
-- Nie jest migracją i nigdy nie trafia na produkcję. Definicje wyzwalaczy i funkcji są
-- skopiowane z odczytu katalogu produkcji (2026-11-09), żeby sprawdzać realne przejścia.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA academy_private; CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('role',true) $$;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text NOT NULL,full_name text,is_external boolean DEFAULT false,employment_status text DEFAULT 'active',created_at timestamptz DEFAULT now());
CREATE TABLE public.courses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),author_id uuid NOT NULL,title text,slug text,category text DEFAULT 'x',status text NOT NULL DEFAULT 'draft',
  draft_version_id uuid,published_version_id uuid,rejection_reason text,reviewed_by uuid,reviewed_at timestamptz,published_at timestamptz,legacy_review_required boolean DEFAULT false,
  delivery_mode text DEFAULT 'self_paced',updated_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),
  CONSTRAINT courses_status_check CHECK(status IN ('draft','pending_review','published','archived','rejected')));
CREATE TABLE public.course_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_id uuid NOT NULL REFERENCES public.courses(id),version_number integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}',completion_rules jsonb NOT NULL DEFAULT '{}',submitted_at timestamptz,reviewed_by uuid,reviewed_at timestamptz,published_at timestamptz,rejection_reason text,submission_id uuid,
  CONSTRAINT course_versions_status_check CHECK(status IN ('draft','pending_review','published','rejected')));
ALTER TABLE public.courses ADD FOREIGN KEY(draft_version_id) REFERENCES public.course_versions(id),ADD FOREIGN KEY(published_version_id) REFERENCES public.course_versions(id);
CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,type text NOT NULL,title_pl text NOT NULL,title_en text NOT NULL,body_pl text,body_en text,action_url text,is_read boolean DEFAULT false,priority text DEFAULT 'normal',created_at timestamptz DEFAULT now(),read_at timestamptz,expires_at timestamptz);
CREATE TABLE public.academy_notification_receipts(dedupe_key text PRIMARY KEY,user_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.academy_audit_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid,action text NOT NULL,course_id uuid,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz DEFAULT now());
CREATE TABLE academy_private.version_contributors(version_id uuid NOT NULL,user_id uuid NOT NULL,PRIMARY KEY(version_id,user_id));

CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role::text='admin') $$;
CREATE FUNCTION public.academy_can_access() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL $$;
CREATE FUNCTION public.academy_can_manage_course(p_course_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.courses c JOIN public.profiles p ON p.id=auth.uid() WHERE c.id=p_course_id AND (p.role IN ('admin','talent_community') OR c.author_id=auth.uid())) $$;

CREATE FUNCTION academy_private.assign_review_submission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='pending_review' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'pending_review') THEN
  NEW.submission_id:=gen_random_uuid();
  INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(auth.uid(),'COURSE_REVIEW_SUBMITTED',NEW.course_id,jsonb_build_object('version_id',NEW.id,'submission_id',NEW.submission_id));
 ELSIF TG_OP='UPDATE' THEN NEW.submission_id:=OLD.submission_id;
 ELSE NEW.submission_id:=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_review_submission_identity BEFORE INSERT OR UPDATE ON public.course_versions FOR EACH ROW EXECUTE FUNCTION academy_private.assign_review_submission();
CREATE FUNCTION academy_private.guard_version_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
    IF OLD.status='published' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable_course_version'; END IF;
    IF NEW.id<>OLD.id OR NEW.course_id<>OLD.course_id OR NEW.version_number<>OLD.version_number THEN RAISE EXCEPTION 'immutable_version_identity'; END IF;
    IF OLD.status='pending_review' AND (NEW.metadata IS DISTINCT FROM OLD.metadata OR NEW.completion_rules IS DISTINCT FROM OLD.completion_rules) THEN RAISE EXCEPTION 'review_snapshot_immutable'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER academy_version_immutable BEFORE UPDATE OR DELETE ON public.course_versions FOR EACH ROW EXECUTE FUNCTION academy_private.guard_version_snapshot();
