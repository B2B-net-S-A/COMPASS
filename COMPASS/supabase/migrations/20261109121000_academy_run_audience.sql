-- B3.12: who was chosen as the audience of an edition, by whom and when.
-- Recipients live in academy_outbox as held rows; this table is the decision record.
-- Rollback: supabase/rollbacks/20261109121000_academy_run_audience.sql
BEGIN;

CREATE TABLE public.academy_run_audience (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES public.course_runs(id),
 filter jsonb NOT NULL CHECK(jsonb_typeof(filter)='object'),
 recipient_count integer NOT NULL CHECK(recipient_count BETWEEN 1 AND 1000),
 excluded_emails text[] NOT NULL DEFAULT '{}',
 chosen_by uuid NOT NULL REFERENCES public.profiles(id),
 chosen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX academy_run_audience_latest ON public.academy_run_audience(run_id,chosen_at DESC);

ALTER TABLE public.academy_run_audience ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_run_audience FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.academy_run_audience TO service_role;
GRANT SELECT ON public.academy_run_audience TO authenticated;
CREATE POLICY academy_run_audience_editor ON public.academy_run_audience FOR SELECT TO authenticated USING(public.academy_can_access() AND public.academy_is_global_editor());

CREATE FUNCTION public.academy_record_run_audience(p_run_id uuid,p_filter jsonb,p_count integer,p_excluded text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs; v_id uuid;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.academy_is_global_editor() THEN RAISE EXCEPTION 'Wymagany administrator lub TCM.' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.course_runs WHERE id=p_run_id;
 IF NOT FOUND OR r.status<>'published' THEN RAISE EXCEPTION 'Adresatów wybiera się dla opublikowanej edycji.'; END IF;
 IF p_count IS NULL OR p_count NOT BETWEEN 1 AND 1000 OR jsonb_typeof(p_filter) IS DISTINCT FROM 'object' OR COALESCE(cardinality(p_excluded),0)>500 THEN RAISE EXCEPTION 'Nieprawidłowy wybór adresatów.'; END IF;
 INSERT INTO public.academy_run_audience(run_id,filter,recipient_count,excluded_emails,chosen_by) VALUES(r.id,p_filter,p_count,COALESCE(p_excluded,'{}'),auth.uid()) RETURNING id INTO v_id;
 INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(auth.uid(),'ACADEMY_RUN_AUDIENCE_CHOSEN',r.course_id,jsonb_build_object('run_id',r.id,'audience_id',v_id,'count',p_count,'excluded',COALESCE(cardinality(p_excluded),0)));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.academy_record_run_audience(uuid,jsonb,integer,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_record_run_audience(uuid,jsonb,integer,text[]) TO authenticated;

DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='academy_run_audience' AND c.relrowsecurity) THEN RAISE EXCEPTION 'B3.12: brak tabeli albo RLS.'; END IF;
 IF has_function_privilege('anon','public.academy_record_run_audience(uuid,jsonb,integer,text[])','EXECUTE') THEN RAISE EXCEPTION 'B3.12: anon nie może wykonywać funkcji.'; END IF;
 IF NOT has_function_privilege('authenticated','public.academy_record_run_audience(uuid,jsonb,integer,text[])','EXECUTE') THEN RAISE EXCEPTION 'B3.12: brak uprawnienia authenticated.'; END IF;
END $$;
COMMIT;
