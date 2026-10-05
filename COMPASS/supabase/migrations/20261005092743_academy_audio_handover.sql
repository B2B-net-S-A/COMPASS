begin;
create or replace function public.academy_reserve_material(p_course_id uuid,p_filename text,p_mime_type text,p_size_bytes bigint,p_file_modified_at bigint default 0,p_lesson_id uuid default null)
returns public.course_materials language plpgsql security definer set search_path=public,pg_temp as $$
declare v_version uuid; v_asset public.course_materials; v_limit bigint; v_id uuid:=gen_random_uuid();
begin
 if not public.academy_can_manage_course(p_course_id) then raise exception 'Brak uprawnień do dodawania materiałów'; end if;
 select draft_version_id into v_version from public.courses where id=p_course_id for update;
 perform 1 from public.course_versions where id=v_version for update;
 if v_version is null or not public.academy_can_edit_version(v_version) then raise exception 'Materiały można dodawać wyłącznie do wersji roboczej'; end if;
 if p_lesson_id is null or not exists(select 1 from public.course_lessons where id=p_lesson_id and course_id=p_course_id and version_id=v_version) then raise exception 'Nieprawidłowa lekcja'; end if;
 if p_mime_type not in ('application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.wordprocessingml.document','video/mp4','audio/mpeg','audio/mp4','text/vtt') then raise exception 'Niedozwolony typ pliku'; end if;
 v_limit:=case when p_mime_type='video/mp4' then 1073741824 when p_mime_type in ('audio/mpeg','audio/mp4') then 536870912 else 52428800 end;
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

create or replace function public.academy_reserve_run_material(p_run_id uuid,p_filename text,p_mime_type text,p_size_bytes bigint,p_file_modified_at bigint default 0)
returns public.course_materials language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.course_runs; a public.course_materials; v_id uuid:=gen_random_uuid(); v_course uuid; v_limit bigint;
begin
 select course_id into v_course from public.course_runs where id=p_run_id;
 perform 1 from public.courses where id=v_course and status<>'archived' for update;
 if not found or not public.academy_can_manage_run(p_run_id) then raise exception 'Brak uprawnień do materiałów edycji'; end if;
 select * into r from public.course_runs where id=p_run_id for update;
 if r.status='cancelled' then raise exception 'Edycja jest odwołana.'; end if;
 if p_mime_type not in ('application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.wordprocessingml.document','video/mp4','audio/mpeg','audio/mp4','text/vtt') then raise exception 'Niedozwolony typ pliku'; end if;
 v_limit:=case when p_mime_type='video/mp4' then 1073741824 when p_mime_type in ('audio/mpeg','audio/mp4') then 536870912 else 52428800 end;
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
update storage.buckets set allowed_mime_types=array['application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.wordprocessingml.document','video/mp4','audio/mpeg','audio/mp4','text/vtt'] where id='academy-materials';

-- Internal contractual delivery evidence is never a learner attachment.
create table public.academy_handovers (
 id uuid primary key default gen_random_uuid(),
 course_id uuid not null references public.courses(id),
 version_id uuid not null references public.course_versions(id),
 run_id uuid references public.course_runs(id),
 material_ids jsonb not null default '{}'::jsonb,
 source_url text,
 rights_url text,
 rights_signed_on date,
 status text not null default 'draft' check(status in ('draft','submitted','rejected','accepted')),
 contributors uuid[] not null,
 submitted_by uuid references public.profiles(id), submitted_at timestamptz,
 reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
 review_note text check(length(review_note)<=2000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(jsonb_typeof(material_ids)='object'),
 check(length(source_url)<=2048 and length(rights_url)<=2048)
);
create unique index academy_handovers_active_scope on public.academy_handovers(version_id,coalesce(run_id,version_id)) where status in ('draft','submitted','rejected');
create index academy_handovers_scope on public.academy_handovers(version_id,run_id,created_at desc);
alter table public.academy_handovers enable row level security;
revoke all on public.academy_handovers from anon,authenticated;
grant select on public.academy_handovers to authenticated;
grant all on public.academy_handovers to service_role;
create policy academy_handover_staff_read on public.academy_handovers for select to authenticated using(
 public.academy_can_access() and case when run_id is null then public.academy_can_manage_course(course_id) else public.academy_can_manage_run(run_id) end
);

create function academy_private.handover_link_valid(p_url text) returns boolean language sql immutable set search_path=public,pg_temp as $$
 select p_url is not null and length(p_url)<=2048 and p_url ~ '^https://([a-zA-Z0-9-]+[.])*sharepoint[.]com/[^?#[:space:]@]*$'
 or p_url is not null and length(p_url)<=2048 and p_url ~ '^https://(onedrive[.]live[.]com|drive[.]google[.]com)/[^?#[:space:]@]*$';
$$;
revoke all on function academy_private.handover_link_valid(text) from public,anon,authenticated;

create function academy_private.validate_handover(p_course uuid,p_version uuid,p_run uuid,p_items jsonb,p_complete boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare category text; item jsonb; a public.course_materials; v_count integer:=0;
begin
 if jsonb_typeof(p_items) is distinct from 'object' or p_items - array['presentation','participant_materials','exercises','modular_video','audio'] <> '{}'::jsonb then raise exception 'Nieprawidłowa lista pakietu'; end if;
 foreach category in array array['presentation','participant_materials','exercises','modular_video','audio'] loop
  if jsonb_typeof(coalesce(p_items->category,'[]'::jsonb))<>'array' then raise exception 'Nieprawidłowa lista plików'; end if;
  if p_complete and jsonb_array_length(coalesce(p_items->category,'[]'::jsonb))=0 then raise exception 'Pakiet musi zawierać wszystkie pięć kategorii'; end if;
  for item in select value from jsonb_array_elements(coalesce(p_items->category,'[]'::jsonb)) loop
   v_count:=v_count+1; if v_count>100 then raise exception 'Za dużo plików w pakiecie'; end if;
   select * into a from public.course_materials where id=(item#>>'{}')::uuid for share;
   if not found or a.course_id<>p_course or a.status<>'ready' or a.purged_at is not null or
      (p_run is not null and a.run_id is distinct from p_run) or
      (p_run is null and (a.run_id is not null or not exists(select 1 from public.course_lessons l where l.version_id=p_version and l.attachments @> jsonb_build_array(jsonb_build_object('asset_id',a.id::text)))))
      then raise exception 'Pakiet zawiera niedostępny lub niesprawdzony plik'; end if;
   if (category='modular_video' and a.mime_type<>'video/mp4') or (category='audio' and a.mime_type not in ('audio/mpeg','audio/mp4')) or (category in ('presentation','participant_materials','exercises') and a.mime_type not in ('application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.wordprocessingml.document')) then raise exception 'Typ pliku nie pasuje do kategorii'; end if;
  end loop;
 end loop;
end;$$;
revoke all on function academy_private.validate_handover(uuid,uuid,uuid,jsonb,boolean) from public,anon,authenticated;

create function public.academy_save_handover(p_version_id uuid,p_run_id uuid,p_id uuid,p_items jsonb,p_source_url text,p_rights_url text,p_rights_signed_on date,p_submit boolean default false)
returns public.academy_handovers language plpgsql security definer set search_path=public,pg_temp as $$
declare v_course uuid; h public.academy_handovers;
begin
 if p_submit is null then raise exception 'Nieprawidłowa decyzja o wysłaniu pakietu'; end if;
 select course_id into v_course from public.course_versions where id=p_version_id;
 perform 1 from public.courses where id=v_course and status<>'archived' for update;
 if not found or not public.academy_can_access() or not (case when p_run_id is null then public.academy_can_manage_course(v_course) else public.academy_can_manage_run(p_run_id) end) then raise exception 'Brak uprawnień do pakietu'; end if;
 if p_run_id is not null and not exists(select 1 from public.course_runs where id=p_run_id and course_id=v_course and version_id=p_version_id and status<>'cancelled') then raise exception 'Nieprawidłowa edycja'; end if;
 if p_source_url is not null and not academy_private.handover_link_valid(p_source_url) or p_rights_url is not null and not academy_private.handover_link_valid(p_rights_url) then raise exception 'Podaj firmowy link HTTPS do SharePoint, OneDrive lub Google Drive, bez parametrów, fragmentu i danych logowania'; end if;
 if p_rights_signed_on>current_date then raise exception 'Data przekazania praw nie może być w przyszłości'; end if;
 if p_submit and (p_source_url is null or p_rights_url is null or p_rights_signed_on is null) then raise exception 'Uzupełnij źródła montażowe i dowód przekazania praw'; end if;
 perform academy_private.validate_handover(v_course,p_version_id,p_run_id,p_items,p_submit);
 if p_id is null and exists(select 1 from public.academy_handovers where version_id=p_version_id and run_id is not distinct from p_run_id and status in ('draft','submitted','rejected')) then raise exception 'Pakiet tej wersji już istnieje. Odśwież widok przed zapisaniem'; end if;
 if p_id is null then
  insert into public.academy_handovers(course_id,version_id,run_id,contributors) values(v_course,p_version_id,p_run_id,array[auth.uid()]) returning * into h;
 else
  select * into h from public.academy_handovers where id=p_id for update;
  if not found or h.version_id<>p_version_id or h.run_id is distinct from p_run_id or h.status not in ('draft','rejected') then raise exception 'Pakiet nie jest edytowalny'; end if;
 end if;
 update public.academy_handovers set material_ids=p_items,source_url=p_source_url,rights_url=p_rights_url,rights_signed_on=p_rights_signed_on,
 status=case when p_submit then 'submitted' else 'draft' end, contributors=case when auth.uid()=any(contributors) then contributors else contributors||auth.uid() end,
 submitted_by=case when p_submit then auth.uid() else null end,submitted_at=case when p_submit then now() else null end,reviewed_by=null,reviewed_at=null,review_note=null,updated_at=clock_timestamp()
 where id=h.id returning * into h;
 insert into public.academy_audit_events(actor_id,action,course_id,details) values(auth.uid(),case when p_submit then 'HANDOVER_SUBMITTED' else 'HANDOVER_SAVED' end,v_course,to_jsonb(h));
 return h;
end;$$;
revoke all on function public.academy_save_handover(uuid,uuid,uuid,jsonb,text,text,date,boolean) from public,anon;
grant execute on function public.academy_save_handover(uuid,uuid,uuid,jsonb,text,text,date,boolean) to authenticated;

create function public.academy_review_handover(p_id uuid,p_accept boolean,p_note text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare h public.academy_handovers;
begin
 if not public.academy_can_access() or not public.is_admin() then raise exception 'admin_required'; end if;
 if p_accept is null then raise exception 'Nieprawidłowa decyzja o odbiorze pakietu'; end if;
 select * into h from public.academy_handovers where id=p_id for update;
 if not found or h.status<>'submitted' or exists(select 1 from public.courses where id=h.course_id and status='archived') or exists(select 1 from public.course_runs where id=h.run_id and status='cancelled') then raise exception 'Pakiet nie oczekuje na odbiór'; end if;
 if auth.uid()=any(h.contributors) or not public.academy_can_review_version(h.version_id) or exists(select 1 from public.course_materials a where a.uploaded_by=auth.uid() and exists(select 1 from jsonb_each(h.material_ids) c, jsonb_array_elements_text(c.value) i where i.value=a.id::text)) then raise exception 'independent_admin_review_required'; end if;
 if length(p_note)>2000 or not p_accept and nullif(btrim(p_note),'') is null then raise exception 'Podaj powód odrzucenia (maks. 2000 znaków)'; end if;
 if p_accept then
  perform academy_private.validate_handover(h.course_id,h.version_id,h.run_id,h.material_ids,true);
  if h.run_id is not null and exists(select 1 from public.course_materials a where a.review_status is distinct from 'published' and exists(select 1 from jsonb_each(h.material_ids) c, jsonb_array_elements_text(c.value) i where i.value=a.id::text)) then raise exception 'Najpierw zatwierdź materiały edycji'; end if;
 end if;
 update public.academy_handovers set status=case when p_accept then 'accepted' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(btrim(p_note),''),updated_at=clock_timestamp() where id=h.id returning * into h;
 insert into public.academy_audit_events(actor_id,action,course_id,details) values(auth.uid(),case when p_accept then 'HANDOVER_ACCEPTED' else 'HANDOVER_REJECTED' end,h.course_id,to_jsonb(h));
end;$$;
revoke all on function public.academy_review_handover(uuid,boolean,text) from public,anon;
grant execute on function public.academy_review_handover(uuid,boolean,text) to authenticated;
commit;
