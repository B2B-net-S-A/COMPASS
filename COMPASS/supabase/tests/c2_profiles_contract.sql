begin;

create temporary table _tap_results (result text) on commit drop;
grant insert, select on _tap_results to authenticated;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

insert into auth.users (
  id,
  email,
  encrypted_password,
  instance_id,
  aud,
  role
)
values
  (
    '71400000-0000-0000-0000-000000000001',
    'c2-profile-owner@example.invalid',
    '',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated'
  ),
  (
    '71400000-0000-0000-0000-000000000002',
    'c2-profile-other@example.invalid',
    '',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated'
  )
on conflict (id) do nothing;

update public.profiles
set full_name = case id
  when '71400000-0000-0000-0000-000000000001'::uuid then 'C2 Owner'
  else 'C2 Other'
end
where id in (
  '71400000-0000-0000-0000-000000000001'::uuid,
  '71400000-0000-0000-0000-000000000002'::uuid
);

insert into _tap_results values (plan(15));

insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
        and policyname = 'profiles_select_self_c2'
        and cmd = 'SELECT'
    ),
    1,
    'C2.1: profiles has exactly the self-only SELECT policy'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
    ),
    1,
    'C2.2: profiles has no additive legacy policies'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
        and policyname = 'profiles_select_authenticated_p0'
    ),
    0,
    'C2.3: temporary P0 authenticated-wide policy is removed'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
        and policyname = 'profiles_select_team_for_internal_admin'
    ),
    0,
    'C2.4: legacy HR-zone cross-user policy is removed'
  )
);
insert into _tap_results values (
  ok(
    has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
    'C2.5: authenticated keeps SELECT for the self-only RLS policy'
  )
);
insert into _tap_results values (
  ok(
    not has_table_privilege('authenticated', 'public.profiles', 'INSERT')
    and not has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
    'C2.6: authenticated has no direct profiles mutation privilege'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name = 'profiles'
        and grantee in ('PUBLIC', 'anon')
    ),
    0,
    'C2.7: anon and PUBLIC have no profiles table privileges'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from information_schema.column_privileges
      where table_schema = 'public'
        and table_name = 'profiles'
        and grantee = 'authenticated'
        and privilege_type in ('INSERT', 'UPDATE', 'REFERENCES')
    ),
    0,
    'C2.8: authenticated has no additive column-level mutation grants'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from information_schema.column_privileges
      where table_schema = 'public'
        and table_name = 'profiles'
        and grantee in ('PUBLIC', 'anon')
    ),
    0,
    'C2.9: anon and PUBLIC have no profiles column privileges'
  )
);
insert into _tap_results values (
  ok(
    has_table_privilege('service_role', 'public.profiles', 'SELECT')
    and has_table_privilege('service_role', 'public.profiles', 'INSERT')
    and has_table_privilege('service_role', 'public.profiles', 'UPDATE')
    and has_table_privilege('service_role', 'public.profiles', 'DELETE'),
    'C2.10: service role keeps the guarded profiles capability'
  )
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"71400000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from public.profiles
      where id = '71400000-0000-0000-0000-000000000001'
    ),
    1,
    'C2.11: authenticated user can read own profile'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from public.profiles
      where id = '71400000-0000-0000-0000-000000000002'
    ),
    0,
    'C2.12: authenticated user cannot read another profile'
  )
);
insert into _tap_results values (
  throws_ok(
    $$update public.profiles
      set bio = 'direct client mutation'
      where id = '71400000-0000-0000-0000-000000000001'$$,
    '42501',
    null,
    'C2.13: authenticated direct UPDATE is rejected'
  )
);
insert into _tap_results values (
  throws_ok(
    $$insert into public.profiles (id, email, role)
      values (
        '71400000-0000-0000-0000-000000000099',
        'c2-forged@example.invalid',
        'admin'
      )$$,
    '42501',
    null,
    'C2.14: authenticated direct INSERT is rejected'
  )
);
insert into _tap_results values (
  throws_ok(
    $$delete from public.profiles
      where id = '71400000-0000-0000-0000-000000000001'$$,
    '42501',
    null,
    'C2.15: authenticated direct DELETE is rejected'
  )
);

reset role;
insert into _tap_results select * from finish();
select result from _tap_results;
rollback;
