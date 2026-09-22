-- Opt-in retention. Keep tombstones and release quota only after Storage confirms deletion.
begin;
create function academy_private.track_material_retention()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.status is distinct from old.status or new.review_status is distinct from old.review_status then
   new.retention_changed_at:=clock_timestamp();
   new.orphaned_since:=null;
 end if;
 if old.purged_at is not null and (new.status<>'rejected' or new.purged_at is null) then raise exception 'purged_material_immutable'; end if;
 return new;
end;$$;
create trigger academy_material_retention_changed before update on public.course_materials
 for each row execute function academy_private.track_material_retention();

create function academy_private.material_has_references(p_asset public.course_materials)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select (p_asset.run_id is not null and p_asset.review_status in ('published','withdrawn'))
 or exists(select 1 from public.course_lessons l where
   l.attachments @> jsonb_build_array(jsonb_build_object('asset_id',p_asset.id::text))
   or l.attachments @> jsonb_build_array(jsonb_build_object('storage_path',p_asset.storage_path)));
$$;
revoke all on function academy_private.material_has_references(public.course_materials) from public,anon,authenticated;

-- Observation is a mutation and therefore runs only in the execution/claim path.
-- Existing READY files get a full grace period from the first observed loss of references.
create function academy_private.observe_material_orphans()
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare candidate record; a public.course_materials; referenced boolean;
begin
 for candidate in select id,course_id,run_id from public.course_materials m
   where m.status='ready' and m.purged_at is null and m.cleanup_token is null
   and ((m.orphaned_since is null and (m.run_id is null or m.review_status='rejected') and not academy_private.material_has_references(m))
     or (m.orphaned_since is not null and academy_private.material_has_references(m)))
   order by m.created_at,m.id limit 100 loop
   perform 1 from public.courses where id=candidate.course_id for update skip locked;
   if not found then continue; end if;
   if candidate.run_id is not null then
     perform 1 from public.course_runs where id=candidate.run_id for update skip locked;
     if not found then continue; end if;
   end if;
   select * into a from public.course_materials where id=candidate.id for update skip locked;
   if not found or a.status<>'ready' or a.purged_at is not null or a.cleanup_token is not null then continue; end if;
   referenced:=academy_private.material_has_references(a);
   if referenced and a.orphaned_since is not null then
     update public.course_materials set orphaned_since=null where id=a.id;
   elsif not referenced and a.orphaned_since is null and (a.run_id is null or a.review_status='rejected') then
     update public.course_materials set orphaned_since=clock_timestamp() where id=a.id;
   end if;
 end loop;
end;$$;
revoke all on function academy_private.observe_material_orphans() from public,anon,authenticated;

create function academy_private.material_cleanup_eligible(p_asset public.course_materials,p_upload_hours integer,p_rejected_days integer)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_asset.purged_at is null and p_upload_hours between 48 and 8760
 and p_rejected_days between 30 and 3650 and not academy_private.material_has_references(p_asset)
 and (
   (p_asset.cleanup_token is not null and p_asset.status='rejected')
   or (p_asset.status='uploading' and p_asset.created_at < now()-make_interval(hours=>p_upload_hours))
   or (p_asset.status='rejected' and p_asset.retention_changed_at < now()-make_interval(days=>p_rejected_days))
   or (p_asset.status='ready' and p_asset.orphaned_since < now()-make_interval(days=>p_rejected_days)
      and (p_asset.run_id is null or p_asset.review_status='rejected'))
 );
$$;
revoke all on function academy_private.material_cleanup_eligible(public.course_materials,integer,integer) from public,anon,authenticated;

create function public.academy_material_cleanup_report(p_upload_hours integer default 48,p_rejected_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if p_upload_hours is null or p_upload_hours not between 48 and 8760
 or p_rejected_days is null or p_rejected_days not between 30 and 3650 then raise exception 'invalid_retention_policy'; end if;
 return (select jsonb_build_object(
   'eligible',count(*) filter(where academy_private.material_cleanup_eligible(a,p_upload_hours,p_rejected_days)),
   'bytes',coalesce(sum(size_bytes) filter(where academy_private.material_cleanup_eligible(a,p_upload_hours,p_rejected_days)),0),
   'failed',count(*) filter(where purged_at is null and cleanup_attempts>=5 and cleanup_token is not null),
   'purged',count(*) filter(where purged_at is not null))
 from public.course_materials a);
end;$$;
revoke all on function public.academy_material_cleanup_report(integer,integer) from public,anon,authenticated;
grant execute on function public.academy_material_cleanup_report(integer,integer) to service_role;

create function public.academy_claim_material_cleanup(p_upload_hours integer default 48,p_rejected_days integer default 30)
returns setof public.course_materials language plpgsql security definer set search_path=public,pg_temp as $$
declare candidate record; a public.course_materials;
begin
 if p_upload_hours is null or p_upload_hours not between 48 and 8760
 or p_rejected_days is null or p_rejected_days not between 30 and 3650 then raise exception 'invalid_retention_policy'; end if;
 perform academy_private.observe_material_orphans();
 -- Same lock order as uploader finalization and moderation.
 for candidate in select id,course_id,run_id from public.course_materials m
   where m.purged_at is null and m.cleanup_attempts<5
   and (m.cleanup_claimed_at is null or m.cleanup_claimed_at<now()-interval '15 minutes')
   and academy_private.material_cleanup_eligible(m,p_upload_hours,p_rejected_days)
   order by created_at,id limit 50 loop
   perform 1 from public.courses where id=candidate.course_id for update skip locked;
   if not found then continue; end if;
   if candidate.run_id is not null then
     perform 1 from public.course_runs where id=candidate.run_id for update skip locked;
     if not found then continue; end if;
   end if;
   select * into a from public.course_materials where id=candidate.id for update skip locked;
   if not found or a.cleanup_attempts>=5 or (a.cleanup_claimed_at is not null and a.cleanup_claimed_at>=now()-interval '15 minutes')
      or not academy_private.material_cleanup_eligible(a,p_upload_hours,p_rejected_days) then continue; end if;
   -- Keep quota charged until ACK; no caller may attach, rescan or finish this asset.
   update public.course_materials set status='rejected',scan_error='retention_cleanup',
     cleanup_claimed_at=clock_timestamp(),cleanup_token=gen_random_uuid(),
     cleanup_attempts=cleanup_attempts+1,cleanup_error=null
     where id=a.id returning * into a;
   insert into public.academy_audit_events(action,course_id,details)
     values('MATERIAL_CLEANUP_CLAIMED',a.course_id,jsonb_build_object('asset_id',a.id,'attempt',a.cleanup_attempts));
   return next a;
   return;
 end loop;
end;$$;
revoke all on function public.academy_claim_material_cleanup(integer,integer) from public,anon,authenticated;
grant execute on function public.academy_claim_material_cleanup(integer,integer) to service_role;

create function public.academy_finish_material_cleanup(p_asset_id uuid,p_token uuid,p_error text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.course_materials; v_course uuid; v_run uuid;
begin
 select course_id,run_id into v_course,v_run from public.course_materials where id=p_asset_id;
 perform 1 from public.courses where id=v_course for update;
 if v_run is not null then perform 1 from public.course_runs where id=v_run for update; end if;
 select * into a from public.course_materials where id=p_asset_id for update;
 if not found or a.purged_at is not null or a.cleanup_token is distinct from p_token or p_token is null then return false; end if;
 if a.status<>'rejected' or academy_private.material_has_references(a) then raise exception 'material_cleanup_reference_conflict'; end if;
 if p_error is not null then
   update public.course_materials set cleanup_error='storage_delete_failed' where id=a.id;
   return true;
 end if;
 if exists(select 1 from storage.objects where bucket_id='academy-materials' and name=a.storage_path) then raise exception 'material_cleanup_not_confirmed'; end if;
 perform pg_advisory_xact_lock(hashtextextended('academy-material:'||a.uploaded_by::text,0));
 update public.course_materials set purged_at=clock_timestamp(),cleanup_error=null,cleanup_token=null,cleanup_claimed_at=null where id=a.id;
 insert into public.academy_audit_events(action,course_id,details)
   values('MATERIAL_PURGED',a.course_id,jsonb_build_object('asset_id',a.id,'released_bytes',a.size_bytes));
 return true;
end;$$;
revoke all on function public.academy_finish_material_cleanup(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.academy_finish_material_cleanup(uuid,uuid,text) to service_role;

create function public.academy_retry_material_cleanup(p_asset_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.academy_can_access() or not public.is_admin() then raise exception 'admin_required'; end if;
 update public.course_materials set cleanup_attempts=0,cleanup_claimed_at=null,cleanup_error=null
 where id=p_asset_id and purged_at is null and cleanup_attempts>=5 and cleanup_token is not null
   and cleanup_claimed_at<now()-interval '15 minutes';
 if not found then raise exception 'material_not_waiting_for_retry'; end if;
 insert into public.academy_audit_events(actor_id,action,details)
   values(auth.uid(),'MATERIAL_CLEANUP_RETRIED',jsonb_build_object('asset_id',p_asset_id));
end;$$;
revoke all on function public.academy_retry_material_cleanup(uuid) from public,anon;
grant execute on function public.academy_retry_material_cleanup(uuid) to authenticated;
commit;
