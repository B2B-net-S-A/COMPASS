-- Cofnięcie wersji prostej, krok 1. Stosuje wyłącznie właściciel. Nagranie edycji znów widzą
-- tylko zapisani i do terminu available_until; sprzątanie znów liczy termin.
-- Ciała funkcji skopiowane z 20261109213300_academy_run_material_availability.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.academy_can_read_asset(p_asset_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT public.academy_can_access() AND EXISTS (SELECT 1 FROM public.course_materials a WHERE a.id = p_asset_id AND (
   (a.run_id IS NULL AND (public.academy_can_manage_course(a.course_id)
      OR (a.status = 'ready' AND EXISTS (SELECT 1 FROM public.course_lessons l WHERE l.course_id = a.course_id
         AND l.attachments @> jsonb_build_array(jsonb_build_object('asset_id', a.id::text))
         AND public.academy_can_read_lesson(l.id)))))
   OR (a.run_id IS NOT NULL AND (public.academy_can_manage_run(a.run_id)
      OR (a.status = 'ready' AND a.review_status = 'published'
         AND (a.available_until IS NULL OR a.available_until > now())
         AND public.academy_is_run_registered(a.run_id))))
 ));
$$;

-- Opublikowany materiał edycji jest chroniony przed sprzątaniem, ale nagranie po terminie już nie.
CREATE OR REPLACE FUNCTION academy_private.material_has_references(p_asset public.course_materials)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT (p_asset.run_id IS NOT NULL AND p_asset.review_status IN ('published', 'withdrawn')
        AND (p_asset.available_until IS NULL OR p_asset.available_until >= now()))
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
   OR (p_asset.status = 'ready' AND p_asset.run_id IS NOT NULL AND p_asset.available_until < now() - make_interval(days => p_rejected_days))
 );
$$;

DO $check$
BEGIN
    IF pg_get_functiondef('public.academy_can_read_asset(uuid)'::regprocedure) NOT LIKE '%available_until%' THEN
        RAISE EXCEPTION 'prosta_1_down: odczyt bez terminu';
    END IF;
END $check$;

COMMIT;
