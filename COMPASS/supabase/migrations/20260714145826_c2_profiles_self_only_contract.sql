-- C2 contract: profiles is private to its owner for authenticated clients.
-- Any cross-user read or mutation must go through a guarded server-only
-- service-role action. profile_directory remains the client-safe directory.

begin;

alter table public.profiles enable row level security;

-- Remove every policy known from the expand phase and the legacy schema.
drop policy if exists "profiles_select_authenticated_p0" on public.profiles;
drop policy if exists "profiles_select_team_for_internal_admin" on public.profiles;
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Users can insert their own profile." on public.profiles;
drop policy if exists "Users can update own profile." on public.profiles;

-- Fail closed when production drift contains an unreviewed profiles policy.
-- Silently keeping such a policy could make the new self-only policy additive
-- and leave cross-user access open because permissive policies are OR-ed.
do $$
declare
  remaining_policies text;
begin
  select string_agg(policyname, ', ' order by policyname)
    into remaining_policies
    from pg_policies
   where schemaname = 'public'
     and tablename = 'profiles';

  if remaining_policies is not null then
    raise exception 'C2 profiles contract blocked by unexpected policies: %', remaining_policies
      using errcode = '42501';
  end if;
end;
$$;

create policy "profiles_select_self_c2"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = id
);

-- Grants and RLS are separate boundaries. Keep SELECT so PostgREST can apply
-- the self policy, but remove every direct client mutation privilege.
revoke all privileges on table public.profiles from public, anon;
revoke all privileges on table public.profiles from authenticated;

-- Table-level REVOKE does not remove grants made directly on individual
-- columns. Clear those too so production ACL drift cannot retain a write path.
do $$
declare
  profile_columns text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum)
    into profile_columns
    from pg_attribute
   where attrelid = 'public.profiles'::regclass
     and attnum > 0
     and not attisdropped;

  if profile_columns is not null then
    execute format(
      'revoke all privileges (%s) on table public.profiles from public, anon, authenticated',
      profile_columns
    );
  end if;
end;
$$;

grant select on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

-- Assert the exact client ACL contract after cleanup. RLS cannot compensate
-- for an unexpected grant when future policies/functions evolve.
do $$
begin
  if exists (
    select 1
      from information_schema.table_privileges
     where table_schema = 'public'
       and table_name = 'profiles'
       and (
         grantee in ('PUBLIC', 'anon')
         or (grantee = 'authenticated' and privilege_type <> 'SELECT')
       )
  ) or exists (
    select 1
      from information_schema.column_privileges
     where table_schema = 'public'
       and table_name = 'profiles'
       and (
         grantee in ('PUBLIC', 'anon')
         or (
           grantee = 'authenticated'
           and privilege_type in ('INSERT', 'UPDATE', 'REFERENCES')
         )
       )
  ) then
    raise exception 'C2 profiles contract blocked by unexpected client ACL'
      using errcode = '42501';
  end if;
end;
$$;

comment on policy "profiles_select_self_c2" on public.profiles is
  'C2 contract: authenticated clients read only their own profile. Cross-user access uses guarded server-only actions.';

commit;
