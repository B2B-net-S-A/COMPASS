-- Keep the published prerequisite graph usable for new learners. The archive
-- course lock conflicts with publication's FOR SHARE prerequisite lock, so a
-- concurrent approval cannot publish a dependency after archive has checked.
BEGIN;

CREATE FUNCTION academy_private.guard_active_prerequisites()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_ids uuid[]; v_id uuid; v_required public.courses;
BEGIN
 IF NEW.status='archived' AND OLD.status IS DISTINCT FROM 'archived' THEN
  IF EXISTS (
   SELECT 1 FROM public.courses dependent
   JOIN public.course_versions published ON published.id=dependent.published_version_id
   WHERE dependent.id<>NEW.id AND dependent.status='published'
    AND NOT dependent.legacy_review_required
    AND published.metadata->'prerequisite_course_ids' ? NEW.id::text
  ) THEN RAISE EXCEPTION 'archive_prerequisite_in_use'; END IF;
 ELSIF NEW.status='published' AND NOT NEW.legacy_review_required AND NEW.published_version_id IS NOT NULL THEN
  SELECT array_agg(value::uuid ORDER BY value::uuid) INTO v_ids
   FROM public.course_versions published,
    jsonb_array_elements_text(COALESCE(published.metadata->'prerequisite_course_ids','[]'::jsonb)) prerequisite(value)
   WHERE published.id=NEW.published_version_id AND published.course_id=NEW.id;
  FOREACH v_id IN ARRAY COALESCE(v_ids,'{}'::uuid[]) LOOP
   SELECT * INTO v_required FROM public.courses WHERE id=v_id FOR SHARE;
   IF NOT FOUND OR v_required.status<>'published' OR v_required.legacy_review_required
    OR v_required.published_version_id IS NULL THEN
    RAISE EXCEPTION 'published_visible_prerequisites_required';
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER academy_guard_active_prerequisites
 BEFORE UPDATE OF status,published_version_id,legacy_review_required ON public.courses
 FOR EACH ROW EXECUTE FUNCTION academy_private.guard_active_prerequisites();
REVOKE ALL ON FUNCTION academy_private.guard_active_prerequisites() FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
