-- B4.6: nagranie edycji z terminem dostępności. Termin egzekwuje academy_can_read_asset,
-- więc obowiązuje też podpisany URL ze Storage. Prowadzący edycji widzi plik po terminie.
-- Fizyczne usunięcie stoi za ACADEMY_MATERIAL_CLEANUP_ENABLED i liczy się od retencji odrzuconych.
-- Cofnięcie: przywrócić academy_can_read_asset i material_cleanup_eligible z migracji
-- 20260922141941 i 20260922142003, usunąć funkcję i kolumnę available_until.

ALTER TABLE public.course_materials ADD COLUMN available_until timestamptz;
ALTER TABLE public.course_materials ADD CONSTRAINT academy_available_until_run_only
    CHECK (available_until IS NULL OR run_id IS NOT NULL);

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

CREATE FUNCTION public.academy_set_run_material_availability(p_asset_id uuid, p_until timestamptz)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_run uuid;
BEGIN
    SELECT run_id INTO v_run FROM public.course_materials WHERE id = p_asset_id;
    IF NOT FOUND OR v_run IS NULL THEN RAISE EXCEPTION 'run_material_required'; END IF;
    IF NOT public.academy_can_manage_run(v_run) THEN RAISE EXCEPTION 'run_manager_required' USING ERRCODE = '42501'; END IF;
    UPDATE public.course_materials SET available_until = p_until WHERE id = p_asset_id;
    RETURN p_until;
END $$;
REVOKE ALL ON FUNCTION public.academy_set_run_material_availability(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_set_run_material_availability(uuid, timestamptz) TO authenticated;

-- Widok działa z uprawnieniami wywołującego, a odczyt course_materials jest nadawany kolumnami.
GRANT SELECT (available_until) ON public.course_materials TO authenticated;

-- Dopisana kolumna na końcu; nazwy, kolejność i uprawnienia pozostałych bez zmian.
CREATE OR REPLACE VIEW public.academy_material_catalog
WITH (security_barrier = true, security_invoker = true) AS
SELECT a.id, a.course_id, a.version_id, a.lesson_id, a.run_id,
 a.filename, a.storage_path, a.mime_type, a.size_bytes, a.status,
 a.review_status, a.created_at, a.purged_at,
 staff.uploaded_by, staff.review_note, staff.scan_error,
 staff.scan_attempts, staff.scan_started_at, staff.scan_next_attempt_at,
 staff.cleanup_token, staff.cleanup_attempts, staff.cleanup_claimed_at, staff.cleanup_error,
 a.caption_for_asset_id,
 academy_material_policy.cleanup_pending(a.id) AS cleanup_pending,
 a.available_until
FROM public.course_materials a
LEFT JOIN LATERAL academy_material_policy.staff_metadata(a.id) staff ON true;
ALTER VIEW public.academy_material_catalog SET (security_invoker = true);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'course_materials' AND column_name = 'available_until') THEN RAISE EXCEPTION 'B4.6: brak kolumny available_until'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'academy_material_catalog' AND column_name = 'available_until') THEN RAISE EXCEPTION 'B4.6: katalog bez available_until'; END IF;
    IF pg_get_functiondef('public.academy_can_read_asset(uuid)'::regprocedure) NOT LIKE '%available_until%' THEN RAISE EXCEPTION 'B4.6: odczyt nie sprawdza terminu'; END IF;
    IF NOT has_function_privilege('authenticated', 'public.academy_set_run_material_availability(uuid,timestamptz)', 'EXECUTE') THEN RAISE EXCEPTION 'B4.6: brak EXECUTE dla authenticated'; END IF;
END $$;
