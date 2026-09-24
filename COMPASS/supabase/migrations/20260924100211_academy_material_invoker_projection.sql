-- Use the caller's RLS and column grants for the catalog. Sensitive metadata
-- is fetched by a narrowly scoped helper outside the exposed Data API schema.
begin;

create function academy_material_policy.staff_metadata(p_asset_id uuid)
returns table (
  uploaded_by uuid,
  review_note text,
  scan_error text,
  scan_attempts integer,
  scan_started_at timestamptz,
  scan_next_attempt_at timestamptz,
  cleanup_token uuid,
  cleanup_attempts integer,
  cleanup_claimed_at timestamptz,
  cleanup_error text
)
language sql stable security definer set search_path = '' as $$
  select a.uploaded_by, a.review_note, a.scan_error,
    case when public.is_admin() then a.scan_attempts end,
    case when public.is_admin() then a.scan_started_at end,
    case when public.is_admin() then a.scan_next_attempt_at end,
    case when public.is_admin() then a.cleanup_token end,
    case when public.is_admin() then a.cleanup_attempts end,
    case when public.is_admin() then a.cleanup_claimed_at end,
    case when public.is_admin() then a.cleanup_error end
  from public.course_materials a
  where a.id = p_asset_id
    and auth.uid() is not null
    and public.academy_can_access()
    and public.academy_can_read_asset(a.id)
    and (public.is_admin() or public.academy_can_manage_course(a.course_id)
      or (a.run_id is not null and public.academy_can_manage_run(a.run_id)));
$$;
revoke all on function academy_material_policy.staff_metadata(uuid) from public, anon;
grant execute on function academy_material_policy.staff_metadata(uuid) to authenticated;

create or replace view public.academy_material_catalog
with (security_barrier = true, security_invoker = true) as
select a.id, a.course_id, a.version_id, a.lesson_id, a.run_id,
  a.filename, a.storage_path, a.mime_type, a.size_bytes, a.status,
  a.review_status, a.created_at, a.purged_at,
  staff.uploaded_by, staff.review_note, staff.scan_error,
  staff.scan_attempts, staff.scan_started_at, staff.scan_next_attempt_at,
  staff.cleanup_token, staff.cleanup_attempts, staff.cleanup_claimed_at,
  staff.cleanup_error
from public.course_materials a
left join lateral academy_material_policy.staff_metadata(a.id) staff on true;

alter view public.academy_material_catalog set (security_invoker = true);
commit;
