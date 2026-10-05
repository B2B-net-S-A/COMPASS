-- Preserve the separation between versioned lesson assets and run-only follow-up files.
-- Draft version cloning can reuse a scanned asset from an older course version.
begin;
create or replace function academy_private.validate_lesson_assets()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  item jsonb;
  asset public.course_materials;
  video public.course_materials;
  video_id uuid;
  linked_video_ids uuid[] := '{}';
begin
  if jsonb_typeof(new.attachments)<>'array' or jsonb_array_length(new.attachments)>100 then
    raise exception 'Lekcja może zawierać maksymalnie 100 plików.';
  end if;
  for item in select value from jsonb_array_elements(coalesce(new.attachments,'[]'::jsonb)) order by value->>'asset_id',value->>'storage_path' loop
    if item ? 'asset_id' then
      select * into asset from public.course_materials where id=(item->>'asset_id')::uuid for update;
      if not found or asset.run_id is not null or asset.course_id<>new.course_id or asset.status<>'ready'
        or asset.storage_path is distinct from (item->>'storage_path')
        or asset.mime_type is distinct from (item->>'mime_type')
        or asset.filename is distinct from (item->>'name')
        or asset.size_bytes is distinct from (item->>'size_bytes')::bigint then
        raise exception 'Załącznik jest niedostępny lub oczekuje na weryfikację';
      end if;
    elsif not exists(select 1 from public.course_lessons l where l.course_id=new.course_id and l.attachments @> jsonb_build_array(item)) then
      raise exception 'Nowe załączniki wymagają bezpiecznego uploadu';
    end if;

    if item ? 'caption_for_asset_id' then
      if item->>'mime_type'<>'text/vtt' or not (item ? 'asset_id') then
        raise exception 'caption_must_be_verified_vtt';
      end if;
      if jsonb_typeof(item->'caption_for_asset_id')='null' then continue; end if;
      if jsonb_typeof(item->'caption_for_asset_id')<>'string'
        or (item->>'caption_for_asset_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'invalid_lesson_caption_target';
      end if;
      video_id := (item->>'caption_for_asset_id')::uuid;
      if video_id=any(linked_video_ids) then raise exception 'lesson_video_already_captioned'; end if;
      if not exists (
        select 1 from jsonb_array_elements(new.attachments) attached(value)
        where attached.value->>'asset_id'=video_id::text and attached.value->>'mime_type'='video/mp4'
      ) then raise exception 'video_not_in_caption_lesson'; end if;
      select * into video from public.course_materials where id=video_id;
      if not found or video.status<>'ready' or video.mime_type<>'video/mp4'
        or video.course_id is distinct from asset.course_id
        or video.version_id is distinct from asset.version_id
        or video.lesson_id is distinct from asset.lesson_id or asset.lesson_id is null then
        raise exception 'video_not_in_caption_lesson';
      end if;
      linked_video_ids := array_append(linked_video_ids,video_id);
    end if;
  end loop;
  return new;
end;$$;

commit;
