-- Wersja prosta, krok 1 (decyzja właściciela z 2026-11-10): zatwierdzone nagranie i materiał
-- edycji widzi każdy z dostępem do Akademii, bez terminu. Warunek organizacyjny: nagranie bez
-- głosów uczestników (mikrofony wyłączone, pytania na czacie), potwierdzany przy akceptacji.
--
-- Co się zmienia:
--   * academy_can_read_asset: materiał edycji `ready` + `published` czyta każdy z dostępem
--     do Akademii, o ile kurs jest opublikowany (nie archiwum) i edycja opublikowana.
--     Zapisani na edycję czytają go jak dotąd. Termin `available_until` przestaje działać.
--   * Sprzątanie: opublikowanego materiału edycji nie usuwa już upływ terminu.
-- Ta sama funkcja pilnuje podpisanego URL ze Storage, rozdziałów wideo i katalogu
-- academy_material_catalog (RLS na course_materials), więc wszystkie trzy poszerzają się razem.
-- Kolumna available_until i funkcja academy_set_run_material_availability zostają (bez skutku).
--
-- Kolejność: po 20261109213300_academy_run_material_availability.sql.
-- Cofnięcie: przywrócić trzy funkcje z 20261109213300_academy_run_material_availability.sql.
BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = 'course_materials' AND column_name = 'available_until') THEN
        RAISE EXCEPTION 'prosta_1_wymaga_B4_6: najpierw 20261109213300_academy_run_material_availability.sql';
    END IF;
END $pre$;

CREATE OR REPLACE FUNCTION public.academy_can_read_asset(p_asset_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT public.academy_can_access() AND EXISTS (SELECT 1 FROM public.course_materials a WHERE a.id = p_asset_id AND (
   (a.run_id IS NULL AND (public.academy_can_manage_course(a.course_id)
      OR (a.status = 'ready' AND EXISTS (SELECT 1 FROM public.course_lessons l WHERE l.course_id = a.course_id
         AND l.attachments @> jsonb_build_array(jsonb_build_object('asset_id', a.id::text))
         AND public.academy_can_read_lesson(l.id)))))
   OR (a.run_id IS NOT NULL AND (public.academy_can_manage_run(a.run_id)
      OR (a.status = 'ready' AND a.review_status = 'published' AND (
         public.academy_is_run_registered(a.run_id)
         OR EXISTS (SELECT 1 FROM public.course_runs r JOIN public.courses c ON c.id = r.course_id
            WHERE r.id = a.run_id AND r.status = 'published' AND c.status = 'published')))))
 ));
$$;

CREATE OR REPLACE FUNCTION academy_private.material_has_references(p_asset public.course_materials)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT (p_asset.run_id IS NOT NULL AND p_asset.review_status IN ('published', 'withdrawn'))
 OR EXISTS (SELECT 1 FROM public.course_lessons l WHERE
   l.attachments @> jsonb_build_array(jsonb_build_object('asset_id', p_asset.id::text))
   OR l.attachments @> jsonb_build_array(jsonb_build_object('storage_path', p_asset.storage_path)));
$$;

CREATE OR REPLACE FUNCTION academy_private.material_cleanup_eligible(p_asset public.course_materials, p_upload_hours integer, p_rejected_days integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT p_asset.purged_at IS NULL AND p_upload_hours BETWEEN 48 AND 8760
 AND p_rejected_days BETWEEN 30 AND 3650 AND NOT academy_private.material_has_references(p_asset)
 AND (
   (p_asset.cleanup_token IS NOT NULL AND p_asset.status = 'rejected')
   OR (p_asset.status = 'uploading' AND p_asset.created_at < now() - make_interval(hours => p_upload_hours))
   OR (p_asset.status = 'rejected' AND p_asset.retention_changed_at < now() - make_interval(days => p_rejected_days))
   OR (p_asset.status = 'ready' AND p_asset.orphaned_since < now() - make_interval(days => p_rejected_days)
      AND (p_asset.run_id IS NULL OR p_asset.review_status = 'rejected'))
 );
$$;

NOTIFY pgrst, 'reload schema';

DO $check$
DECLARE v_def text;
BEGIN
    v_def := pg_get_functiondef('public.academy_can_read_asset(uuid)'::regprocedure);
    IF v_def LIKE '%available_until%' THEN RAISE EXCEPTION 'prosta_1: odczyt nadal sprawdza termin'; END IF;
    IF v_def NOT LIKE '%r.status = ''published'' AND c.status = ''published''%' THEN
        RAISE EXCEPTION 'prosta_1: odczyt nie wymaga opublikowanego kursu i edycji';
    END IF;
    IF v_def NOT LIKE '%public.academy_can_access() AND EXISTS%' THEN RAISE EXCEPTION 'prosta_1: odczyt bez bramki dostępu'; END IF;
    IF pg_get_functiondef('academy_private.material_cleanup_eligible(public.course_materials,integer,integer)'::regprocedure) LIKE '%available_until%'
        OR pg_get_functiondef('academy_private.material_has_references(public.course_materials)'::regprocedure) LIKE '%available_until%' THEN
        RAISE EXCEPTION 'prosta_1: sprzątanie nadal liczy termin';
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.academy_can_read_asset(uuid)'::regprocedure) THEN
        RAISE EXCEPTION 'prosta_1: funkcja odczytu straciła SECURITY DEFINER';
    END IF;
END $check$;

COMMIT;
