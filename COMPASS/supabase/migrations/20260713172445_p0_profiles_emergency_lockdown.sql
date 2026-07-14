-- COMPASS P0 / C0: emergency profile and privileged-RPC lockdown.
--
-- This migration is deliberately backward-compatible with the current app:
-- authenticated users temporarily keep read access to all profiles while the
-- application is moved to profile_directory. Anonymous access is removed now.

begin;

-- -------------------------------------------------------------------------
-- 1. profiles: remove anonymous reads, retain authenticated compatibility.
-- -------------------------------------------------------------------------

drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "profiles_select_authenticated_p0" on public.profiles;

create policy "profiles_select_authenticated_p0"
on public.profiles
for select
to authenticated
using ((select auth.uid()) is not null);

revoke all privileges on table public.profiles from anon;
-- Profile rows are provisioned by the auth.users trigger. Keeping the legacy
-- self-INSERT policy would let an authenticated auth user without a profile
-- choose privileged values (including role='admin') for their first row.
drop policy if exists "Users can insert their own profile." on public.profiles;
revoke insert, delete on table public.profiles from authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

comment on policy "profiles_select_authenticated_p0" on public.profiles is
  'Temporary C0 compatibility policy. Remove in C2 after all cross-user reads use profile_directory or guarded server actions.';

-- Auth signup is the only profile provisioning path. Do not copy avatar or
-- consent flags from user-editable raw_user_meta_data: avatars go through the
-- validated upload action and legally relevant consent lives in the append-
-- only um_user_consents ledger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    left(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 200)
  );
  return new;
end;
$function$;

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- 2. Defense in depth: an authenticated user cannot change privileged fields
--    on their own row even if an application validator is bypassed.
-- -------------------------------------------------------------------------

create or replace function public.block_self_service_profile_privilege_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
  protected_columns constant text[] := array[
    'id',
    'email',
    'created_at',
    'role',
    'avatar_url',
    'avatar_source',
    'cv_url',
    'embedding',
    'gdpr_consent',
    'current_status',
    'default_location',
    'experience_level',
    'profile_completion_percent',
    'project_sentiment',
    'verifier_status',
    'ambassador_status',
    'sales_support_status',
    'onboarding_completed',
    'onboarding_tour_done',
    'learning_streak_current',
    'learning_streak_longest',
    'learning_streak_last_date',
    'employment_status',
    'employment_type',
    'hired_at',
    'termination_date',
    'manager_id',
    'manager_email',
    'buddy_id',
    'department',
    'job_title',
    'fte_status',
    'max_monthly_hours',
    'annual_leave_days',
    'work_start_date',
    'leave_entitlement_days',
    'leave_carried_over_days',
    'leave_used_initial_days',
    'desired_rate_min',
    'desired_rate_max',
    'loyalty_points',
    'loyalty_tier',
    'loyalty_joined_at',
    'admin_notes',
    'is_external',
    'external_notes',
    'is_inbox_handler',
    'm365_synced_at'
  ];
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
     and (select auth.uid()) = old.id
     and exists (
       select 1
       from unnest(protected_columns) as protected_column
       where new_row -> protected_column is distinct from old_row -> protected_column
     )
  then
    raise exception 'privileged profile fields require an authorized server action'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function public.block_self_service_profile_privilege_changes()
  from public, anon, authenticated;

drop trigger if exists trg_profiles_block_self_privilege_changes on public.profiles;
create trigger trg_profiles_block_self_privilege_changes
before update on public.profiles
for each row
execute function public.block_self_service_profile_privilege_changes();

-- -------------------------------------------------------------------------
-- 3. Move the old privileged implementations behind service-role-only
--    wrappers. The JWT-role check remains inside each public entry point, so
--    a future accidental GRANT cannot turn these SECURITY DEFINER functions
--    into client-callable APIs.
-- -------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

alter function public.admin_hard_delete_user(uuid) set schema private;
alter function private.admin_hard_delete_user(uuid)
  rename to admin_hard_delete_user_impl;

alter function public.start_onboarding_for_user(uuid, uuid, uuid)
  set schema private;
alter function private.start_onboarding_for_user(uuid, uuid, uuid)
  rename to start_onboarding_for_user_impl;

alter function public.start_offboarding_for_user(uuid, date, date, uuid)
  set schema private;
alter function private.start_offboarding_for_user(uuid, date, date, uuid)
  rename to start_offboarding_for_user_impl;

revoke all on function private.admin_hard_delete_user_impl(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.start_onboarding_for_user_impl(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.start_offboarding_for_user_impl(uuid, date, date, uuid)
  from public, anon, authenticated, service_role;

create function public.admin_hard_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  perform private.admin_hard_delete_user_impl(p_user_id);
end;
$function$;

create function public.start_onboarding_for_user(
  p_user_id uuid,
  p_template_id uuid default null,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  return private.start_onboarding_for_user_impl(
    p_user_id,
    p_template_id,
    p_actor_id
  );
end;
$function$;

create function public.start_offboarding_for_user(
  p_user_id uuid,
  p_termination_date date,
  p_scheduled_for date default null,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  return private.start_offboarding_for_user_impl(
    p_user_id,
    p_termination_date,
    p_scheduled_for,
    p_actor_id
  );
end;
$function$;

revoke all on function public.admin_hard_delete_user(uuid)
  from public, anon, authenticated;
revoke all on function public.start_onboarding_for_user(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.start_offboarding_for_user(uuid, date, date, uuid)
  from public, anon, authenticated;

grant execute on function public.admin_hard_delete_user(uuid) to service_role;
grant execute on function public.start_onboarding_for_user(uuid, uuid, uuid)
  to service_role;
grant execute on function public.start_offboarding_for_user(uuid, date, date, uuid)
  to service_role;

comment on function public.admin_hard_delete_user(uuid) is
  'C0 service-role-only wrapper. The implementation is in the unexposed private schema.';
comment on function public.start_onboarding_for_user(uuid, uuid, uuid) is
  'C0 service-role-only wrapper. The implementation is in the unexposed private schema.';
comment on function public.start_offboarding_for_user(uuid, date, date, uuid) is
  'C0 service-role-only wrapper. The implementation is in the unexposed private schema.';

commit;
