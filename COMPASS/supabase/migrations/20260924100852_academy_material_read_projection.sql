-- Keep the material metadata that controls scanning, review and retention out of
-- the learner Data API. RLS filters rows, but never filters columns of a row.
begin;

-- Storage policies must use narrow privileged predicates before table SELECT is
-- removed from authenticated users. The schema is not exposed by PostgREST.
create schema academy_material_policy;

create function academy_material_policy.material_path_readable(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.course_materials a
    where a.storage_path = p_path and a.status = 'ready'
      and public.academy_can_read_asset(a.id)
  );
$$;
create function academy_material_policy.material_path_uploadable(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.course_materials a
    where a.storage_path = p_path and public.academy_can_upload_material(a.id)
  );
$$;
revoke all on function academy_material_policy.material_path_readable(text), academy_material_policy.material_path_uploadable(text) from public, anon;
grant usage on schema academy_material_policy to authenticated;
grant execute on function academy_material_policy.material_path_readable(text), academy_material_policy.material_path_uploadable(text) to authenticated;

alter policy academy_material_upload on storage.objects with check (
  bucket_id = 'academy-materials' and academy_material_policy.material_path_uploadable(name)
);
alter policy academy_material_read on storage.objects using (
  bucket_id = 'academy-materials' and academy_material_policy.material_path_readable(name)
);
alter policy academy_storage_read_guard on storage.objects using (
  (bucket_id <> 'academy-materials' and not (bucket_id = 'documents' and name like 'courses/%'))
  or (bucket_id = 'academy-materials' and academy_material_policy.material_path_readable(name))
  or (bucket_id = 'documents' and exists (
    select 1 from public.course_lessons l
    where l.attachments @> jsonb_build_array(jsonb_build_object('storage_path', name))
      and public.academy_can_read_lesson(l.id)
  ))
);
alter policy academy_storage_insert_guard on storage.objects with check (
  (bucket_id <> 'academy-materials' and not (bucket_id = 'documents' and name like 'courses/%'))
  or (bucket_id = 'academy-materials' and academy_material_policy.material_path_uploadable(name))
);

-- This owner view deliberately uses an explicit per-row predicate: an invoker
-- view would require granting the underlying sensitive columns to the Data API.
-- Privileged fields are additionally masked for non-staff callers.
create view public.academy_material_catalog with (security_barrier = true) as
select a.id, a.course_id, a.version_id, a.lesson_id, a.run_id,
  a.filename, a.storage_path, a.mime_type, a.size_bytes, a.status,
  a.review_status, a.created_at, a.purged_at,
  case when public.is_admin() or public.academy_can_manage_course(a.course_id)
       or (a.run_id is not null and public.academy_can_manage_run(a.run_id))
       then a.uploaded_by end as uploaded_by,
  case when public.is_admin() or public.academy_can_manage_course(a.course_id)
       or (a.run_id is not null and public.academy_can_manage_run(a.run_id))
       then a.review_note end as review_note,
  case when public.is_admin() or public.academy_can_manage_course(a.course_id)
       or (a.run_id is not null and public.academy_can_manage_run(a.run_id))
       then a.scan_error end as scan_error,
  case when public.is_admin() then a.scan_attempts end as scan_attempts,
  case when public.is_admin() then a.scan_started_at end as scan_started_at,
  case when public.is_admin() then a.scan_next_attempt_at end as scan_next_attempt_at,
  case when public.is_admin() then a.cleanup_token end as cleanup_token,
  case when public.is_admin() then a.cleanup_attempts end as cleanup_attempts,
  case when public.is_admin() then a.cleanup_claimed_at end as cleanup_claimed_at,
  case when public.is_admin() then a.cleanup_error end as cleanup_error
from public.course_materials a
where public.academy_can_read_asset(a.id);

revoke all on public.academy_material_catalog from public, anon;
grant select on public.academy_material_catalog to authenticated;
commit;
