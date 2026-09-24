-- Captions are explicitly associated with one recording in the same run.
-- No filename or list-order inference is allowed for participant playback.
begin;

alter table public.course_materials
  add column caption_for_asset_id uuid references public.course_materials(id),
  add constraint academy_run_caption_scope check (
    caption_for_asset_id is null or
    (run_id is not null and mime_type='text/vtt' and id<>caption_for_asset_id)
  );
create unique index academy_run_caption_one_per_video
  on public.course_materials(caption_for_asset_id)
  where caption_for_asset_id is not null;

create function academy_private.validate_run_caption_target()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.caption_for_asset_id is not null and not exists (
    select 1 from public.course_materials video
    where video.id=new.caption_for_asset_id and video.run_id=new.run_id
      and video.mime_type='video/mp4'
  ) then raise exception 'video_not_in_caption_run'; end if;
  return new;
end;$$;
create trigger academy_run_caption_target before insert or update of caption_for_asset_id,run_id,mime_type
  on public.course_materials for each row execute function academy_private.validate_run_caption_target();

create function public.academy_set_run_caption(p_caption_id uuid, p_video_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  caption public.course_materials;
  video public.course_materials;
  v_course_id uuid;
  v_run_id uuid;
begin
  if auth.uid() is null or not public.academy_can_access() or not public.is_admin() then
    raise exception 'admin_required' using errcode='42501';
  end if;
  select course_id,run_id into v_course_id,v_run_id from public.course_materials where id=p_caption_id;
  if v_run_id is null then raise exception 'caption_run_required'; end if;
  perform 1 from public.courses where id=v_course_id for update;
  perform 1 from public.course_runs where id=v_run_id for update;
  select * into caption from public.course_materials where id=p_caption_id for update;
  if not found or caption.run_id is distinct from v_run_id or caption.mime_type<>'text/vtt' then
    raise exception 'caption_run_required';
  end if;
  if p_video_id is not null then
    if caption.status<>'ready' or caption.review_status<>'published' then
      raise exception 'caption_not_published';
    end if;
    select * into video from public.course_materials where id=p_video_id for update;
    if not found or video.run_id is distinct from caption.run_id or video.mime_type<>'video/mp4'
      or video.status<>'ready' or video.review_status<>'published' then
      raise exception 'video_not_published_in_run';
    end if;
  end if;
  if caption.caption_for_asset_id is not distinct from p_video_id then return; end if;
  update public.course_materials set caption_for_asset_id=p_video_id where id=caption.id;
  insert into public.academy_audit_events(actor_id,action,course_id,details)
  values(auth.uid(),'RUN_CAPTION_ASSIGNED',caption.course_id,
    jsonb_build_object('run_id',caption.run_id,'caption_id',caption.id,
      'previous_video_id',caption.caption_for_asset_id,'video_id',p_video_id));
end;$$;
revoke all on function public.academy_set_run_caption(uuid,uuid) from public,anon;
grant execute on function public.academy_set_run_caption(uuid,uuid) to authenticated;

-- Extend the curated read projection without granting clients access to the
-- underlying material table. The explicit row predicate remains mandatory.
create or replace view public.academy_material_catalog with (security_barrier = true) as
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
  case when public.is_admin() then a.cleanup_error end as cleanup_error,
  a.caption_for_asset_id
from public.course_materials a
where public.academy_can_read_asset(a.id);
revoke all on public.academy_material_catalog from public, anon;
grant select on public.academy_material_catalog to authenticated;

commit;
