-- P1: lifecycle_events is an audit timeline, not a client-writable table.
--
-- The original Phase 22 policy allowed every authenticated browser session to
-- forge events for any employee.  Keep reads under the existing owner/team/HR
-- policy, but route every runtime write through a service-role-only RPC.  The
-- public function is only the PostgREST entry point; the implementation stays
-- in the unexposed private schema and independently validates the actor.

begin;

drop policy if exists "lifecycle_events_insert_authenticated"
  on public.lifecycle_events;

revoke all privileges on table public.lifecycle_events
  from public, anon, authenticated, service_role;
grant select on table public.lifecycle_events to authenticated, service_role;

create or replace function private.record_lifecycle_event_impl(
  p_user_id uuid,
  p_event_type text,
  p_actor_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_event_id uuid;
begin
  if p_user_id is null or p_actor_id is null then
    raise exception 'target and actor are required'
      using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'lifecycle event metadata must be a JSON object'
      using errcode = '22023';
  end if;

  select p.role::text
    into v_actor_role
    from public.profiles as p
   where p.id = p_actor_id;

  if v_actor_role is null
     or v_actor_role not in ('admin', 'talent_community')
  then
    raise exception 'lifecycle manager actor required'
      using errcode = '42501';
  end if;

  insert into public.lifecycle_events (
    user_id,
    event_type,
    metadata,
    created_by
  )
  values (
    p_user_id,
    p_event_type,
    coalesce(p_metadata, '{}'::jsonb),
    p_actor_id
  )
  returning id into v_event_id;

  return v_event_id;
end;
$function$;

revoke all on function private.record_lifecycle_event_impl(uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.record_lifecycle_event(
  p_user_id uuid,
  p_event_type text,
  p_actor_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required'
      using errcode = '42501';
  end if;

  return private.record_lifecycle_event_impl(
    p_user_id,
    p_event_type,
    p_actor_id,
    p_metadata
  );
end;
$function$;

revoke all on function public.record_lifecycle_event(uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_lifecycle_event(uuid, text, uuid, jsonb)
  to service_role;

comment on table public.lifecycle_events is
  'Immutable employee lifecycle timeline. Runtime INSERT is allowed only through guarded service-role RPCs; clients have read-only RLS access.';
comment on function private.record_lifecycle_event_impl(uuid, text, uuid, jsonb) is
  'Unexposed lifecycle event writer. Requires an admin or talent_community actor and is callable only by its guarded owner wrapper.';
comment on function public.record_lifecycle_event(uuid, text, uuid, jsonb) is
  'Service-role-only lifecycle event writer used by guarded server actions. Rejects client JWTs and validates the actor in the private implementation.';

commit;
