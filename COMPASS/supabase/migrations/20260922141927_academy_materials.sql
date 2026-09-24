-- Private, immutable, scanned academy assets. Browser uploads never become
-- learner-readable until the trusted scanner has accepted the stored bytes.
create table public.course_materials (
    id uuid primary key default gen_random_uuid(),
    course_id uuid not null references public.courses(id) on delete restrict,
    version_id uuid not null references public.course_versions(id) on delete restrict,
    lesson_id uuid references public.course_lessons(id) on delete set null,
    uploaded_by uuid not null references public.profiles(id) on delete restrict,
    filename text not null check (length(filename) between 1 and 180),
    storage_path text not null unique,
    mime_type text not null,
    size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 1073741824),
    file_modified_at bigint not null default 0,
    status text not null default 'uploading' check(status in ('uploading','quarantined','scanning','ready','rejected')),
    sha256 text,
    scan_error text,
    scan_attempts integer not null default 0,
    scan_started_at timestamptz,
    scan_next_attempt_at timestamptz not null default now(),
    scanned_at timestamptz,
    purged_at timestamptz,
    cleanup_claimed_at timestamptz,
    cleanup_token uuid,
    cleanup_attempts integer not null default 0,
    cleanup_error text,
    retention_changed_at timestamptz not null default now(),
    orphaned_since timestamptz,
    created_at timestamptz not null default now()
);
create index course_materials_course_version_idx on public.course_materials(course_id, version_id);
create index course_materials_scan_queue_idx on public.course_materials(created_at) where status in ('quarantined','scanning');
alter table public.course_materials enable row level security;
revoke all on public.course_materials from anon, authenticated;
grant select on public.course_materials to authenticated;
grant all on public.course_materials to service_role;

create or replace function public.academy_can_read_asset(p_asset_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.academy_can_access() and exists (
    select 1 from public.course_materials a where a.id=p_asset_id and (
      public.academy_can_manage_course(a.course_id)
      or (a.status='ready' and exists (
        select 1 from public.course_lessons l where l.course_id=a.course_id
          and l.attachments @> jsonb_build_array(jsonb_build_object('asset_id',a.id::text))
          and public.academy_can_read_lesson(l.id)
      ))
    )
  );
$$;
revoke all on function public.academy_can_read_asset(uuid) from public, anon;
grant execute on function public.academy_can_read_asset(uuid) to authenticated, service_role;
create policy academy_asset_read on public.course_materials for select to authenticated using(public.academy_can_read_asset(id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('academy-materials','academy-materials',false,1073741824,array[
'application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation',
'application/vnd.openxmlformats-officedocument.wordprocessingml.document','video/mp4','text/vtt'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy academy_material_upload on storage.objects for insert to authenticated with check(
 bucket_id='academy-materials' and exists(select 1 from public.course_materials a
 where a.storage_path=name and a.uploaded_by=auth.uid() and a.status='uploading' and public.academy_can_edit_version(a.version_id))
);
create policy academy_material_read on storage.objects for select to authenticated using(
 bucket_id='academy-materials' and exists(select 1 from public.course_materials a
 where a.storage_path=name and a.status='ready' and public.academy_can_read_asset(a.id))
);

create or replace function public.academy_reserve_material(p_course_id uuid,p_filename text,p_mime_type text,p_size_bytes bigint,p_file_modified_at bigint default 0,p_lesson_id uuid default null)
returns public.course_materials language plpgsql security definer set search_path=public,pg_temp as $$
declare v_version uuid; v_asset public.course_materials; v_limit bigint; v_id uuid:=gen_random_uuid();
begin
 if not public.academy_can_manage_course(p_course_id) then raise exception 'Brak uprawnień do dodawania materiałów'; end if;
 select draft_version_id into v_version from public.courses where id=p_course_id for update;
 perform 1 from public.course_versions where id=v_version for update;
 if v_version is null or not public.academy_can_edit_version(v_version) then raise exception 'Materiały można dodawać wyłącznie do wersji roboczej'; end if;
 if p_lesson_id is null or not exists(select 1 from public.course_lessons where id=p_lesson_id and course_id=p_course_id and version_id=v_version) then raise exception 'Nieprawidłowa lekcja'; end if;
 if p_mime_type not in ('application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.wordprocessingml.document','video/mp4','text/vtt') then raise exception 'Niedozwolony typ pliku'; end if;
 v_limit:=case when p_mime_type='video/mp4' then 1073741824 else 52428800 end;
 if p_size_bytes<=0 or p_size_bytes>v_limit then raise exception 'Plik przekracza dopuszczalny rozmiar'; end if;
 if p_filename is null or length(p_filename) not between 1 and 180 or p_filename ~ E'[\\n\\r/\\\\]' then raise exception 'Nieprawidłowa nazwa pliku'; end if;
 perform pg_advisory_xact_lock(hashtextextended('academy-material:'||auth.uid()::text,0));
 select * into v_asset from public.course_materials where uploaded_by=auth.uid() and version_id=v_version
 and lesson_id=p_lesson_id and filename=p_filename and mime_type=p_mime_type and size_bytes=p_size_bytes and file_modified_at=p_file_modified_at
 and status <> 'rejected' and created_at>now()-interval '23 hours'
 and (status<>'ready' or exists(select 1 from public.course_lessons l where l.id=p_lesson_id and l.attachments @> jsonb_build_array(jsonb_build_object('asset_id',course_materials.id::text))))
 order by created_at desc limit 1;
 if found then
   -- Recover a successful Storage upload whose browser finalization was lost.
   if v_asset.status='uploading' and exists(select 1 from storage.objects where bucket_id='academy-materials' and name=v_asset.storage_path and (metadata->>'size')::bigint=v_asset.size_bytes) then
     update public.course_materials set status='quarantined' where id=v_asset.id returning * into v_asset;
   end if;
   return v_asset;
 end if;
 if (select count(*) from public.course_materials where uploaded_by=auth.uid() and status in ('uploading','quarantined','scanning'))>=10 then raise exception 'Dokończ lub anuluj poprzednie przesyłanie (maksymalnie 10 oczekujących plików).'; end if;
 if (select jsonb_array_length(attachments) from public.course_lessons where id=p_lesson_id)+(select count(*) from public.course_materials where lesson_id=p_lesson_id and status in ('uploading','quarantined','scanning'))>=100 then raise exception 'Lekcja może zawierać maksymalnie 100 plików.'; end if;
 if (select coalesce(sum(size_bytes),0) from public.course_materials where uploaded_by=auth.uid() and purged_at is null)+p_size_bytes>10737418240 then raise exception 'Limit materiałów autora (10 GB) został osiągnięty. Skontaktuj się z administratorem.'; end if;
 insert into public.course_materials(id,course_id,version_id,lesson_id,uploaded_by,filename,storage_path,mime_type,size_bytes,file_modified_at)
 values(v_id,p_course_id,v_version,p_lesson_id,auth.uid(),p_filename,p_course_id::text||'/'||v_id::text||'/'||regexp_replace(p_filename,'[^a-zA-Z0-9._-]','_','g'),p_mime_type,p_size_bytes,p_file_modified_at)
 returning * into v_asset;
 return v_asset;
end;$$;
revoke all on function public.academy_reserve_material(uuid,text,text,bigint,bigint,uuid) from public,anon;
grant execute on function public.academy_reserve_material(uuid,text,text,bigint,bigint,uuid) to authenticated;

create or replace function public.academy_finish_material_upload(p_asset_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.course_materials; stored_size bigint;
begin
 select * into a from public.course_materials where id=p_asset_id for update;
 if not found or not public.academy_can_edit_version(a.version_id) or (a.uploaded_by<>auth.uid() and not public.is_admin()) then raise exception 'Brak uprawnień'; end if;
 if a.status in ('quarantined','scanning','ready') then return; end if;
 if a.status<>'uploading' then raise exception 'Plik został odrzucony'; end if;
 select (metadata->>'size')::bigint into stored_size from storage.objects where bucket_id='academy-materials' and name=a.storage_path;
 if stored_size is null or stored_size<>a.size_bytes then raise exception 'Plik nie został w całości przesłany'; end if;
 update public.course_materials set status='quarantined' where id=a.id;
end;$$;
revoke all on function public.academy_finish_material_upload(uuid) from public,anon;
grant execute on function public.academy_finish_material_upload(uuid) to authenticated;

create or replace function public.academy_claim_material_scan()
returns setof public.course_materials language plpgsql security definer set search_path=public,pg_temp as $$
begin
 return query with picked as (
 select id from public.course_materials where (status='quarantined' or (status='scanning' and scan_started_at<now()-interval '15 minutes'))
 and scan_attempts<5 and scan_next_attempt_at<=now() order by created_at for update skip locked limit 1
 ) update public.course_materials a set status='scanning',scan_attempts=scan_attempts+1,scan_started_at=now()
 from picked where a.id=picked.id returning a.*;
end;$$;
revoke all on function public.academy_claim_material_scan() from public,anon,authenticated;
grant execute on function public.academy_claim_material_scan() to service_role;

create or replace function academy_private.validate_lesson_assets()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; a public.course_materials;
begin
 if jsonb_typeof(new.attachments)<>'array' or jsonb_array_length(new.attachments)>100 then raise exception 'Lekcja może zawierać maksymalnie 100 plików.'; end if;
 for item in select value from jsonb_array_elements(coalesce(new.attachments,'[]'::jsonb)) order by value->>'asset_id',value->>'storage_path' loop
   if item ? 'asset_id' then
     select * into a from public.course_materials where id=(item->>'asset_id')::uuid for update;
     if not found or a.course_id<>new.course_id or a.status<>'ready' or a.storage_path is distinct from (item->>'storage_path')
       or a.mime_type is distinct from (item->>'mime_type')
       or a.filename is distinct from (item->>'name')
       or a.size_bytes is distinct from (item->>'size_bytes')::bigint then raise exception 'Załącznik jest niedostępny lub oczekuje na weryfikację'; end if;
     if a.orphaned_since is not null then update public.course_materials set orphaned_since=null where id=a.id; end if;
   elsif not exists(select 1 from public.course_lessons l where l.course_id=new.course_id and l.attachments @> jsonb_build_array(item)) then
     raise exception 'Nowe załączniki wymagają bezpiecznego uploadu';
   end if;
 end loop;
 return new;
end;$$;
create trigger academy_lesson_assets_guard before insert or update on public.course_lessons for each row execute function academy_private.validate_lesson_assets();

-- Validation results are committed with the lesson reference, never in a
-- browser callback. A stale scanner lease cannot overwrite a later decision.
create or replace function public.academy_accept_material_scan(p_asset_id uuid,p_scan_started_at timestamptz,p_sha256 text,p_error text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.course_materials; attachment jsonb; v_course uuid;
begin
 select course_id into v_course from public.course_materials where id=p_asset_id;
 perform 1 from public.courses where id=v_course for update;
 select * into a from public.course_materials where id=p_asset_id for update;
 if not found or a.status<>'scanning' or a.scan_started_at is distinct from p_scan_started_at then return false; end if;
 if p_error is not null then
   update public.course_materials set status='rejected',scan_error=left(p_error,500),scanned_at=now() where id=a.id;
   return true;
 end if;
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'invalid_checksum'; end if;
 update public.course_materials set status='ready',sha256=p_sha256,scan_error=null,scanned_at=now() where id=a.id;
 attachment:=jsonb_build_object('asset_id',a.id,'name',a.filename,'storage_path',a.storage_path,'size_bytes',a.size_bytes,'mime_type',a.mime_type);
 if a.lesson_id is not null and exists(select 1 from public.course_versions v join public.courses c on c.id=v.course_id where v.id=a.version_id and c.draft_version_id=v.id and c.status<>'archived' and v.status in ('draft','rejected')) then
   update public.course_lessons set attachments=coalesce(attachments,'[]'::jsonb)||jsonb_build_array(attachment)
   where id=a.lesson_id and version_id=a.version_id and not (attachments @> jsonb_build_array(jsonb_build_object('asset_id',a.id::text)));
 end if;
 return true;
end;$$;
revoke all on function public.academy_accept_material_scan(uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.academy_accept_material_scan(uuid,timestamptz,text,text) to service_role;

create or replace function public.academy_discard_material(p_asset_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.course_materials;
begin
 select * into a from public.course_materials where id=p_asset_id for update;
 if not found or not public.academy_can_edit_version(a.version_id) then raise exception 'Brak uprawnień'; end if;
 if a.status='ready' then raise exception 'Usuń gotowy materiał z lekcji, zachowując historię'; end if;
 update public.course_materials set status='rejected',scan_error='discarded_by_author' where id=a.id;
end;$$;
revoke all on function public.academy_discard_material(uuid) from public,anon;
grant execute on function public.academy_discard_material(uuid) to authenticated;

create or replace function academy_private.require_ready_materials()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status in ('pending_review','published') and old.status is distinct from new.status and exists(
 select 1 from public.course_materials where version_id=new.id and status in ('uploading','quarantined','scanning')) then
   raise exception 'Zaczekaj na weryfikację materiałów lub anuluj niedokończone przesyłanie';
 end if;
 return new;
end;$$;
create trigger academy_version_materials_ready before update on public.course_versions for each row execute function academy_private.require_ready_materials();

-- Existing broad Storage policies cannot bypass the academy's private material scope.
create policy academy_storage_read_guard on storage.objects as restrictive for select to authenticated using (
 (bucket_id <> 'academy-materials' and not (bucket_id='documents' and name like 'courses/%'))
 or (bucket_id='academy-materials' and exists(select 1 from public.course_materials a where a.storage_path=name and a.status='ready' and public.academy_can_read_asset(a.id)))
 or (bucket_id='documents' and exists(select 1 from public.course_lessons l where l.attachments @> jsonb_build_array(jsonb_build_object('storage_path',name)) and public.academy_can_read_lesson(l.id)))
);
create policy academy_legacy_material_read on storage.objects for select to authenticated using (
 bucket_id='documents' and name like 'courses/%' and exists(select 1 from public.course_lessons l where l.attachments @> jsonb_build_array(jsonb_build_object('storage_path',name)) and public.academy_can_read_lesson(l.id))
);
create policy academy_storage_insert_guard on storage.objects as restrictive for insert to authenticated with check (
 (bucket_id<>'academy-materials' and not (bucket_id='documents' and name like 'courses/%'))
 or (bucket_id='academy-materials' and exists(select 1 from public.course_materials a where a.storage_path=name and a.uploaded_by=auth.uid() and a.status='uploading' and public.academy_can_edit_version(a.version_id)))
);
create policy academy_storage_update_guard on storage.objects as restrictive for update to authenticated
 using (bucket_id<>'academy-materials' and not (bucket_id='documents' and name like 'courses/%'))
 with check (bucket_id<>'academy-materials' and not (bucket_id='documents' and name like 'courses/%'));
create policy academy_storage_delete_guard on storage.objects as restrictive for delete to authenticated
 using (bucket_id<>'academy-materials' and not (bucket_id='documents' and name like 'courses/%'));

create or replace function public.academy_retry_material_scan(p_asset_id uuid,p_scan_started_at timestamptz)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.course_materials set status='quarantined',scan_error='scanner_unavailable',
 scan_next_attempt_at=now()+make_interval(secs=>least(3600,30*(2^scan_attempts)::integer))
 where id=p_asset_id and status='scanning' and scan_started_at=p_scan_started_at;
 return found;
end;$$;
revoke all on function public.academy_retry_material_scan(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.academy_retry_material_scan(uuid,timestamptz) to service_role;

create or replace function public.academy_admin_retry_material(p_asset_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.academy_can_access() or not public.is_admin() then raise exception 'admin_required'; end if;
 update public.course_materials set status='quarantined',scan_attempts=0,scan_next_attempt_at=now(),scan_started_at=null,scan_error=null
 where id=p_asset_id and scan_attempts>=5 and (status='quarantined' or (status='scanning' and scan_started_at<now()-interval '15 minutes'));
 if not found then raise exception 'material_not_waiting_for_retry'; end if;
 insert into public.academy_audit_events(actor_id,action,details) values(auth.uid(),'MATERIAL_SCAN_RETRIED',jsonb_build_object('asset_id',p_asset_id));
end;$$;
revoke all on function public.academy_admin_retry_material(uuid) from public,anon;
grant execute on function public.academy_admin_retry_material(uuid) to authenticated;

-- Storage permission probes use version='1' and request contentLength, and are
-- rolled back by Storage. Completed TUS objects carry server-observed size/mime.
-- Finalization is a Storage superuser write, so RLS alone cannot enforce quotas.
create or replace function academy_private.enforce_stored_material()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.course_materials; v_course uuid;
begin
 if new.bucket_id<>'academy-materials' then
   if tg_op='UPDATE' and old.bucket_id='academy-materials' then raise exception 'immutable_material_bucket'; end if;
   return new;
 end if;
 if new.version='1' and not (coalesce(new.metadata,'{}'::jsonb) ? 'size') then return new; end if;
 select course_id into v_course from public.course_materials where storage_path=new.name;
 if not found then raise exception 'material_reservation_required'; end if;
 perform 1 from public.courses where id=v_course for update;
 select * into a from public.course_materials where storage_path=new.name for update;
 if tg_op='UPDATE' and old.bucket_id=new.bucket_id and old.name=new.name and old.version is not distinct from new.version
    and old.metadata is not distinct from new.metadata and old.owner_id is not distinct from new.owner_id and old.owner is not distinct from new.owner then return new; end if;
 if a.status<>'uploading' then raise exception 'immutable_stored_material'; end if;
 if tg_op='UPDATE' and (old.name<>new.name or old.bucket_id<>new.bucket_id) then raise exception 'immutable_material_path'; end if;
 if new.version is null or new.version='1' or (new.metadata->>'size')::bigint is distinct from a.size_bytes
    or (new.metadata->>'mimetype') is distinct from a.mime_type
    or coalesce(new.owner_id,new.owner::text) is distinct from a.uploaded_by::text then raise exception 'stored_material_mismatch'; end if;
 if not exists(select 1 from public.course_versions v join public.courses c on c.id=v.course_id
   join public.profiles p on p.id=a.uploaded_by
   where v.id=a.version_id and c.draft_version_id=v.id and c.status<>'archived' and v.status in ('draft','rejected')
   and not coalesce(p.is_external,false) and p.employment_status is distinct from 'exited'
   and (p.role='admin' or (p.role='consultant' and c.author_id=p.id and exists(
     select 1 from public.academy_user_capabilities cap where cap.user_id=p.id and cap.can_train and cap.revoked_at is null))))
 then raise exception 'material_authorization_changed'; end if;
 return new;
end;$$;
create trigger academy_stored_material_guard before insert or update of bucket_id,name,version,metadata,owner,owner_id on storage.objects
 for each row execute function academy_private.enforce_stored_material();
