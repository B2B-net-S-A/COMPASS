-- Post-session material belongs to the attended run, not a replacement program.
-- The original enrollment/version and its completion rules stay unchanged.
begin;
alter table public.course_materials
 add column run_id uuid,
 add column review_status text,
 add column reviewed_by uuid references public.profiles(id),
 add column reviewed_at timestamptz,
 add column review_note text check(length(review_note)<=2000),
 add constraint academy_material_run_fk foreign key(run_id,course_id,version_id)
   references public.course_runs(id,course_id,version_id),
 add constraint academy_material_scope check (
   (run_id is null and review_status is null)
   or (run_id is not null and lesson_id is null and review_status is not null and review_status in ('pending_review','published','rejected','withdrawn'))
 );
create index academy_material_run_idx on public.course_materials(run_id,created_at) where run_id is not null;

create or replace function public.academy_can_read_asset(p_asset_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.academy_can_access() and exists(select 1 from public.course_materials a where a.id=p_asset_id and (
   (a.run_id is null and (public.academy_can_manage_course(a.course_id)
      or (a.status='ready' and exists(select 1 from public.course_lessons l where l.course_id=a.course_id
         and l.attachments @> jsonb_build_array(jsonb_build_object('asset_id',a.id::text))
         and public.academy_can_read_lesson(l.id)))))
   or (a.run_id is not null and (public.academy_can_manage_run(a.run_id)
      or (a.status='ready' and a.review_status='published' and public.academy_is_run_registered(a.run_id))))
 ));
$$;

create function public.academy_can_upload_material(p_asset_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.course_materials a join public.courses c on c.id=a.course_id
   where a.id=p_asset_id and a.uploaded_by=auth.uid() and a.status='uploading' and c.status<>'archived'
   and ((a.run_id is null and public.academy_can_edit_version(a.version_id))
      or (a.run_id is not null and public.academy_can_manage_run(a.run_id)
        and exists(select 1 from public.course_runs r where r.id=a.run_id and r.status<>'cancelled'))));
$$;
revoke all on function public.academy_can_upload_material(uuid) from public,anon;
grant execute on function public.academy_can_upload_material(uuid) to authenticated;

alter policy academy_material_upload on storage.objects with check(
 bucket_id='academy-materials' and exists(select 1 from public.course_materials a
   where a.storage_path=name and public.academy_can_upload_material(a.id)));
alter policy academy_storage_insert_guard on storage.objects with check(
 (bucket_id<>'academy-materials' and not (bucket_id='documents' and name like 'courses/%'))
 or (bucket_id='academy-materials' and exists(select 1 from public.course_materials a
   where a.storage_path=name and public.academy_can_upload_material(a.id))));

create function public.academy_reserve_run_material(p_run_id uuid,p_filename text,p_mime_type text,p_size_bytes bigint,p_file_modified_at bigint default 0)
returns public.course_materials language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.course_runs; a public.course_materials; v_id uuid:=gen_random_uuid(); v_course uuid; v_limit bigint;
begin
 select course_id into v_course from public.course_runs where id=p_run_id;
 perform 1 from public.courses where id=v_course and status<>'archived' for update;
 if not found or not public.academy_can_manage_run(p_run_id) then raise exception 'Brak uprawnień do materiałów edycji'; end if;
 select * into r from public.course_runs where id=p_run_id for update;
 if r.status='cancelled' then raise exception 'Edycja jest odwołana.'; end if;
 if p_mime_type not in ('application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.wordprocessingml.document','video/mp4','text/vtt') then raise exception 'Niedozwolony typ pliku'; end if;
 v_limit:=case when p_mime_type='video/mp4' then 1073741824 else 52428800 end;
 if p_size_bytes is null or p_size_bytes<=0 or p_size_bytes>v_limit then raise exception 'Plik przekracza dopuszczalny rozmiar'; end if;
 if p_filename is null or length(p_filename) not between 1 and 180 or p_filename ~ E'[\\n\\r/\\\\]' then raise exception 'Nieprawidłowa nazwa pliku'; end if;
 perform pg_advisory_xact_lock(hashtextextended('academy-material:'||auth.uid()::text,0));
 select * into a from public.course_materials where run_id=p_run_id and uploaded_by=auth.uid()
   and filename=p_filename and mime_type=p_mime_type and size_bytes=p_size_bytes and file_modified_at=p_file_modified_at
   and status<>'rejected' and review_status in ('pending_review','published') and created_at>now()-interval '23 hours'
   order by created_at desc limit 1;
 if found then
   if a.status='uploading' and exists(select 1 from storage.objects where bucket_id='academy-materials' and name=a.storage_path and (metadata->>'size')::bigint=a.size_bytes) then
     update public.course_materials set status='quarantined' where id=a.id returning * into a;
   end if;
   return a;
 end if;
 if (select count(*) from public.course_materials where uploaded_by=auth.uid() and status in ('uploading','quarantined','scanning'))>=10 then raise exception 'Dokończ lub anuluj poprzednie przesyłanie (maksymalnie 10 oczekujących plików).'; end if;
 if (select count(*) from public.course_materials where run_id=p_run_id and status<>'rejected' and review_status in ('pending_review','published'))>=100 then raise exception 'Edycja może zawierać maksymalnie 100 materiałów.'; end if;
 if (select coalesce(sum(size_bytes),0) from public.course_materials where uploaded_by=auth.uid() and purged_at is null)+p_size_bytes>10737418240 then raise exception 'Limit materiałów autora (10 GB) został osiągnięty. Skontaktuj się z administratorem.'; end if;
 insert into public.course_materials(id,course_id,version_id,run_id,uploaded_by,filename,storage_path,mime_type,size_bytes,file_modified_at,review_status)
 values(v_id,r.course_id,r.version_id,r.id,auth.uid(),p_filename,r.course_id::text||'/'||v_id::text||'/'||regexp_replace(p_filename,'[^a-zA-Z0-9._-]','_','g'),p_mime_type,p_size_bytes,p_file_modified_at,'pending_review') returning * into a;
 return a;
end;$$;
revoke all on function public.academy_reserve_run_material(uuid,text,text,bigint,bigint) from public,anon;
grant execute on function public.academy_reserve_run_material(uuid,text,text,bigint,bigint) to authenticated;

create or replace function public.academy_finish_material_upload(p_asset_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.course_materials; stored_size bigint; v_course uuid; v_run uuid;
begin
 select course_id,run_id into v_course,v_run from public.course_materials where id=p_asset_id;
 perform 1 from public.courses where id=v_course for update;
 if v_run is not null then perform 1 from public.course_runs where id=v_run for update; end if;
 select * into a from public.course_materials where id=p_asset_id for update;
 if not found or (a.uploaded_by<>auth.uid() and not public.is_admin())
   or not (case when a.run_id is null then public.academy_can_edit_version(a.version_id)
     else public.academy_can_manage_run(a.run_id) and exists(select 1 from public.course_runs r where r.id=a.run_id and r.status<>'cancelled') end)
 then raise exception 'Brak uprawnień'; end if;
 if a.status in ('quarantined','scanning','ready') then return; end if;
 if a.status<>'uploading' then raise exception 'Plik został odrzucony'; end if;
 select (metadata->>'size')::bigint into stored_size from storage.objects where bucket_id='academy-materials' and name=a.storage_path;
 if stored_size is null or stored_size<>a.size_bytes then raise exception 'Plik nie został w całości przesłany'; end if;
 update public.course_materials set status='quarantined' where id=a.id;
end;$$;

create or replace function public.academy_discard_material(p_asset_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.course_materials; v_course uuid; v_run uuid;
begin
 select course_id,run_id into v_course,v_run from public.course_materials where id=p_asset_id;
 perform 1 from public.courses where id=v_course for update;
 if v_run is not null then perform 1 from public.course_runs where id=v_run for update; end if;
 select * into a from public.course_materials where id=p_asset_id for update;
 if not found or not (case when a.run_id is null then public.academy_can_edit_version(a.version_id)
   else public.academy_can_manage_run(a.run_id) end) then raise exception 'Brak uprawnień'; end if;
 if a.status='ready' then raise exception 'Gotowy materiał wymaga moderacji lub usunięcia odwołania z lekcji.'; end if;
 update public.course_materials set status='rejected',scan_error='discarded_by_author' where id=a.id;
end;$$;

-- A ready run file is readable by staff for review, but by learners only after approval.
create function public.academy_review_run_material(p_asset_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.course_materials; v_course uuid; v_run uuid; target text;
begin
 if not public.academy_can_access() or not public.is_admin() then raise exception 'admin_required'; end if;
 if p_decision is null or p_decision not in ('approve','reject','withdraw') then raise exception 'review_decision_required'; end if;
 if p_decision<>'approve' and coalesce(length(btrim(p_note)),0)<5 then raise exception 'rejection_reason_required'; end if;
 if length(p_note)>2000 then raise exception 'rejection_reason_required'; end if;
 select course_id,run_id into v_course,v_run from public.course_materials where id=p_asset_id;
 perform 1 from public.courses where id=v_course and (p_decision<>'approve' or status<>'archived') for update;
 if not found then raise exception 'course_archived'; end if;
 perform 1 from public.course_runs where id=v_run for update;
 select * into a from public.course_materials where id=p_asset_id for update;
 if not found or a.run_id is null or a.status<>'ready' then raise exception 'Materiał oczekuje na weryfikację bezpieczeństwa.'; end if;
 if a.uploaded_by=auth.uid() and p_decision='approve' then raise exception 'Własny materiał musi zatwierdzić inny administrator.'; end if;
 target:=case p_decision when 'approve' then 'published' when 'reject' then 'rejected' else 'withdrawn' end;
 if a.review_status=target then return; end if;
 if (p_decision in ('approve','reject') and a.review_status<>'pending_review')
    or (p_decision='withdraw' and a.review_status<>'published') then raise exception 'Materiał został już oceniony. Odśwież listę.'; end if;
 if p_decision='approve' and not exists(select 1 from public.course_runs where id=a.run_id and status='published') then raise exception 'Najpierw opublikuj edycję szkolenia.'; end if;
 update public.course_materials set review_status=target,reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(btrim(p_note),'') where id=a.id;
 insert into public.academy_audit_events(actor_id,action,course_id,details)
   values(auth.uid(),'RUN_MATERIAL_REVIEWED',a.course_id,jsonb_build_object('version_id',a.version_id,'asset_id',a.id,'run_id',a.run_id,'decision',target,'note',nullif(btrim(p_note),'')));
 if target='published' then
   insert into public.notifications(user_id,type,title_pl,title_en,body_pl,body_en,action_url)
   select reg.user_id,'document_uploaded','Materiały po szkoleniu','Training follow-up materials',
     'Nowy materiał: '||a.filename,'New material: '||a.filename,'/learning/edycje/'||a.run_id::text
     from public.course_run_registrations reg join auth.users u on u.id=reg.user_id
     where reg.run_id=a.run_id and reg.status='confirmed';
 end if;
end;$$;
revoke all on function public.academy_review_run_material(uuid,text,text) from public,anon;
grant execute on function public.academy_review_run_material(uuid,text,text) to authenticated;

-- Pending files in an attended run do not mutate or block an immutable program version.
create or replace function academy_private.require_ready_materials()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status in ('pending_review','published') and old.status is distinct from new.status and exists(
   select 1 from public.course_materials where version_id=new.id and run_id is null and status in ('uploading','quarantined','scanning'))
 then raise exception 'Zaczekaj na weryfikację materiałów lub anuluj niedokończone przesyłanie'; end if;
 return new;
end;$$;

create or replace function academy_private.enforce_stored_material()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.course_materials; v_course uuid; v_run uuid; permitted boolean;
begin
 if new.bucket_id<>'academy-materials' then
   if tg_op='UPDATE' and old.bucket_id='academy-materials' then raise exception 'immutable_material_bucket'; end if;
   return new;
 end if;
 if new.version='1' and not (coalesce(new.metadata,'{}'::jsonb) ? 'size') then return new; end if;
 select course_id,run_id into v_course,v_run from public.course_materials where storage_path=new.name;
 if not found then raise exception 'material_reservation_required'; end if;
 perform 1 from public.courses where id=v_course for update;
 if v_run is not null then perform 1 from public.course_runs where id=v_run for update; end if;
 select * into a from public.course_materials where storage_path=new.name for update;
 if tg_op='UPDATE' and old.bucket_id=new.bucket_id and old.name=new.name and old.version is not distinct from new.version
   and old.metadata is not distinct from new.metadata and old.owner_id is not distinct from new.owner_id and old.owner is not distinct from new.owner then return new; end if;
 if a.status<>'uploading' then raise exception 'immutable_stored_material'; end if;
 if tg_op='UPDATE' and (old.name<>new.name or old.bucket_id<>new.bucket_id) then raise exception 'immutable_material_path'; end if;
 if new.version is null or new.version='1' or (new.metadata->>'size')::bigint is distinct from a.size_bytes
   or new.metadata->>'mimetype' is distinct from a.mime_type
   or coalesce(new.owner_id,new.owner::text) is distinct from a.uploaded_by::text then raise exception 'stored_material_mismatch'; end if;
 if a.run_id is null then
   permitted:=public.academy_can_edit_course_as(a.course_id,a.uploaded_by)
     and exists(select 1 from public.course_versions v join public.courses c on c.id=v.course_id
       where v.id=a.version_id and c.draft_version_id=v.id and c.status<>'archived' and v.status in ('draft','rejected'));
 else
   permitted:=public.academy_can_lead_run_as(a.run_id,a.uploaded_by)
     and exists(select 1 from public.course_runs r join public.courses c on c.id=r.course_id
       where r.id=a.run_id and r.status<>'cancelled' and c.status<>'archived');
 end if;
 if not coalesce(permitted,false) then raise exception 'material_authorization_changed'; end if;
 return new;
end;$$;
-- Run attachments cannot be smuggled into another program version.
create or replace function academy_private.validate_lesson_assets()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; a public.course_materials;
begin
 if jsonb_typeof(new.attachments)<>'array' or jsonb_array_length(new.attachments)>100 then raise exception 'Lekcja może zawierać maksymalnie 100 plików.'; end if;
 for item in select value from jsonb_array_elements(coalesce(new.attachments,'[]'::jsonb)) order by value->>'asset_id',value->>'storage_path' loop
   if item ? 'asset_id' then
     select * into a from public.course_materials where id=(item->>'asset_id')::uuid for update;
     if not found or a.run_id is not null or a.course_id<>new.course_id or a.status<>'ready' or a.storage_path is distinct from (item->>'storage_path')
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

commit;
