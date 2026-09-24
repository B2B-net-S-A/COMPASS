BEGIN;

-- The scanner attaches approved files as service_role, without auth.uid().
-- Record the real uploader as a permanent contributor to every version that
-- references the file, including cloned versions. This makes the existing
-- independent-review guard apply to upload-only contributors as well.
CREATE FUNCTION academy_private.track_lesson_material_uploaders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO academy_private.version_contributors(version_id,user_id)
 SELECT DISTINCT NEW.version_id,a.uploaded_by
 FROM jsonb_array_elements(coalesce(NEW.attachments,'[]'::jsonb)) item
 JOIN public.course_materials a ON a.id=CASE
   WHEN item->>'asset_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   THEN (item->>'asset_id')::uuid END
 WHERE a.course_id=NEW.course_id AND a.run_id IS NULL
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION academy_private.track_lesson_material_uploaders() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER academy_track_lesson_material_uploaders
 AFTER INSERT OR UPDATE OF attachments ON public.course_lessons
 FOR EACH ROW EXECUTE FUNCTION academy_private.track_lesson_material_uploaders();

-- Existing lesson attachments may have been added before the trigger existed.
-- Do not infer a contributor from legacy links without a matching asset ID.
INSERT INTO academy_private.version_contributors(version_id,user_id)
SELECT DISTINCT l.version_id,a.uploaded_by
FROM public.course_lessons l
CROSS JOIN LATERAL jsonb_array_elements(coalesce(l.attachments,'[]'::jsonb)) item
JOIN public.course_materials a ON a.id=CASE
 WHEN item->>'asset_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN (item->>'asset_id')::uuid END
WHERE l.version_id IS NOT NULL AND a.course_id=l.course_id AND a.run_id IS NULL
ON CONFLICT DO NOTHING;

COMMIT;
