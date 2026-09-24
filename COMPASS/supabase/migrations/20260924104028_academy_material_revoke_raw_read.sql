-- Apply only after the app has moved its reads to academy_material_catalog.
-- This closes the direct PostgREST path to reviewer and scanner metadata.
begin;
revoke select on public.course_materials from authenticated;
grant select (
  id, course_id, version_id, lesson_id, run_id, filename, storage_path,
  mime_type, size_bytes, status, review_status, created_at, purged_at
) on public.course_materials to authenticated;
commit;
