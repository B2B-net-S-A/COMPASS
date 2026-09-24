-- Apply only after the app has moved its reads to academy_material_catalog.
-- This closes the direct PostgREST path to reviewer and scanner metadata.
begin;
revoke select on public.course_materials from authenticated;
commit;
