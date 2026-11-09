-- B0.5: wyniki scenariuszy gotowości, warunki bramki startu i prywatny bucket na zrzuty.
-- Definicje scenariuszy są w kodzie (lib/academy/readiness-scenarios.ts), tu tylko wyniki.
-- Tabele czyta wyłącznie administrator; zapis tylko przez RPC (ręczny, SSO) albo service role (trasa automatu).
--
-- Cofnięcie: supabase/rollbacks/20261109130300_academy_readiness.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS public.academy_readiness_results(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id text NOT NULL CHECK(scenario_id ~ '^G[0-9]{2}$'),
    kind text NOT NULL CHECK(kind IN ('automat','ręczny')),
    sha text NOT NULL CHECK(sha ~ '^[0-9a-f]{7,40}$'),
    status text NOT NULL CHECK(status IN ('passed','failed','stale')),
    evidence_path text CHECK(evidence_path IS NULL OR evidence_path ~ '^G[0-9]{2}/[0-9a-f-]{36}\.(png|jpg|pdf)$'),
    note text CHECK(note IS NULL OR length(note)<=2000),
    run_at timestamptz NOT NULL DEFAULT now(),
    actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    valid_until timestamptz
);
CREATE INDEX IF NOT EXISTS academy_readiness_latest ON public.academy_readiness_results(scenario_id,run_at DESC);
ALTER TABLE public.academy_readiness_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_readiness_results FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.academy_readiness_results TO authenticated;
GRANT SELECT,INSERT ON public.academy_readiness_results TO service_role;
DROP POLICY IF EXISTS academy_readiness_results_admin_read ON public.academy_readiness_results;
CREATE POLICY academy_readiness_results_admin_read ON public.academy_readiness_results FOR SELECT TO authenticated USING(public.is_admin());

CREATE TABLE IF NOT EXISTS public.academy_launch_conditions(
    item text PRIMARY KEY,
    owner text NOT NULL,
    status text NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','ready')),
    evidence text CHECK(evidence IS NULL OR length(evidence)<=2000),
    decided_at timestamptz,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.academy_launch_conditions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_launch_conditions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.academy_launch_conditions TO authenticated;
GRANT SELECT ON public.academy_launch_conditions TO service_role;
DROP POLICY IF EXISTS academy_launch_conditions_admin_read ON public.academy_launch_conditions;
CREATE POLICY academy_launch_conditions_admin_read ON public.academy_launch_conditions FOR SELECT TO authenticated USING(public.is_admin());

INSERT INTO public.academy_launch_conditions(item,owner) VALUES
 ('Zadanie bezpieczeństwa z Etapu 0 zamknięte, wynik u IOD','właściciel'),
 ('57 scenariuszy z ważnym wynikiem','właściciel'),
 ('RODO: rejestr czynności, test równowagi, DPIA, retencja','IOD'),
 ('Klauzula art. 13/14 i regulamin dla kont nauki','prawnik, IOD'),
 ('Podstawa wysyłki do osób niezapisanych na szkolenie','prawnik'),
 ('Nagrywanie, transkrypcja i retencja nagrań','prawnik, IOD'),
 ('Ryzyko przekwalifikowania B2B przy raportach','prawnik'),
 ('Doręczalność: SPF, DKIM, DMARC, MAIL_FROM, 5 dostawców','właściciel'),
 ('Skrzynka nadawcza: licencja, RAOP, smoke','właściciel'),
 ('Zewnętrzny test penetracyjny','właściciel'),
 ('Treść startowa: kursy z prawdziwą zawartością','organizator'),
 ('Prawa autorskie do materiałów','organizator, prawnik'),
 ('Adres konsultantów w eksporcie NEXUSA','właściciel'),
 ('Zastępstwo recenzenta','właściciel'),
 ('Uprawnienia Graph dla frekwencji i nagrań','właściciel'),
 ('Test obciążeniowy wejścia z linku','osoba techniczna'),
 ('Usunięcie danych prób, wygaszenie kolejki held, plan wycofania','osoba techniczna'),
 ('Migracja zdejmująca blokadę trybu open','właściciel'),
 ('Odczyt PITR, kopii dziennych i limitu Storage','właściciel')
ON CONFLICT(item) DO NOTHING;

CREATE OR REPLACE FUNCTION public.academy_record_readiness_result(p_scenario_id text,p_sha text,p_status text,p_evidence_path text,p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
    IF p_status NOT IN ('passed','failed') THEN RAISE EXCEPTION 'invalid_readiness_status'; END IF;
    IF p_status='passed' AND p_evidence_path IS NULL THEN RAISE EXCEPTION 'readiness_evidence_required'; END IF;
    INSERT INTO public.academy_readiness_results(scenario_id,kind,sha,status,evidence_path,note,actor,valid_until)
    VALUES(p_scenario_id,'ręczny',p_sha,p_status,p_evidence_path,NULLIF(trim(p_note),''),auth.uid(),now()+interval '30 days')
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.academy_record_readiness_result(text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_record_readiness_result(text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_update_launch_condition(p_item text,p_status text,p_evidence text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
    IF p_status NOT IN ('not_started','in_progress','ready') THEN RAISE EXCEPTION 'invalid_launch_condition_status'; END IF;
    IF p_status='ready' AND length(trim(COALESCE(p_evidence,'')))<3 THEN RAISE EXCEPTION 'launch_condition_evidence_required'; END IF;
    UPDATE public.academy_launch_conditions SET status=p_status,evidence=NULLIF(trim(p_evidence),''),
        decided_at=CASE WHEN p_status='ready' THEN now() END,updated_by=auth.uid() WHERE item=p_item;
    IF NOT FOUND THEN RAISE EXCEPTION 'launch_condition_not_found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.academy_update_launch_condition(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_update_launch_condition(text,text,text) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('academy-readiness-evidence','academy-readiness-evidence',false,10485760,ARRAY['image/png','image/jpeg','application/pdf'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS academy_readiness_evidence_admin_read ON storage.objects;
CREATE POLICY academy_readiness_evidence_admin_read ON storage.objects FOR SELECT TO authenticated
    USING(bucket_id='academy-readiness-evidence' AND public.is_admin());
DROP POLICY IF EXISTS academy_readiness_evidence_admin_insert ON storage.objects;
CREATE POLICY academy_readiness_evidence_admin_insert ON storage.objects FOR INSERT TO authenticated
    WITH CHECK(bucket_id='academy-readiness-evidence' AND public.is_admin());

NOTIFY pgrst,'reload schema';

DO $$
BEGIN
    IF (SELECT public FROM storage.buckets WHERE id='academy-readiness-evidence') IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'B0.5: bucket zrzutów nie jest prywatny';
    END IF;
    IF has_table_privilege('authenticated','public.academy_readiness_results','INSERT')
        OR has_table_privilege('anon','public.academy_readiness_results','SELECT')
        OR has_table_privilege('authenticated','public.academy_launch_conditions','UPDATE') THEN
        RAISE EXCEPTION 'B0.5: zbyt szerokie prawa do tabel gotowości';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.academy_readiness_results'::regclass AND relrowsecurity) THEN
        RAISE EXCEPTION 'B0.5: brak RLS na wynikach';
    END IF;
    IF (SELECT count(*) FROM public.academy_launch_conditions)<18 THEN RAISE EXCEPTION 'B0.5: brak warunków bramki startu'; END IF;
END $$;
COMMIT;
