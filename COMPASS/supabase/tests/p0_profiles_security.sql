-- COMPASS P0 regression suite: profiles, privileged RPCs, calendar feeds
-- and chat attachments. Run with `supabase test db` after a fresh reset.

set search_path to public, extensions;

begin;

create temp table _tap_results (result text);
grant insert, select on _tap_results to anon, authenticated;

insert into auth.users (
  id,
  email,
  encrypted_password,
  instance_id,
  aud,
  role
)
values (
  '71300000-0000-0000-0000-000000000001',
  'p0-profile-test@example.invalid',
  '',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated'
)
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role)
values (
  '71300000-0000-0000-0000-000000000001',
  'p0-profile-test@example.invalid',
  'P0 Profile Test',
  'consultant'
)
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    bio = null;

insert into _tap_results values (plan(35));

insert into _tap_results values (
  has_table('public', 'profile_directory', 'P0.1: safe profile directory exists')
);
insert into _tap_results values (
  has_table('public', 'calendar_feed_tokens', 'P0.2: hash-only calendar token table exists')
);
insert into _tap_results values (
  has_column('public', 'messages', 'attachment_path', 'P0.3: messages store attachment path')
);
insert into _tap_results values (
  has_column('public', 'messages', 'attachment_name', 'P0.4: messages store attachment name')
);
insert into _tap_results values (
  has_column('public', 'messages', 'attachment_mime', 'P0.5: messages store attachment MIME')
);
insert into _tap_results values (
  has_column('public', 'messages', 'attachment_size', 'P0.6: messages store attachment size')
);
insert into _tap_results values (
  is(
    (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
    true,
    'P0.7: profiles has RLS enabled'
  )
);
insert into _tap_results values (
  ok(
    not has_table_privilege('anon', 'public.profiles', 'SELECT'),
    'P0.8: anonymous role cannot select profiles'
  )
);
insert into _tap_results values (
  ok(
    has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
    'P0.9: authenticated compatibility read remains during expand phase'
  )
);
insert into _tap_results values (
  ok(
    has_table_privilege('authenticated', 'public.profile_directory', 'SELECT'),
    'P0.10: authenticated role can read safe directory'
  )
);
insert into _tap_results values (
  ok(
    not has_table_privilege('anon', 'public.profile_directory', 'SELECT'),
    'P0.11: anonymous role cannot read safe directory'
  )
);
insert into _tap_results values (
  ok(
    not has_table_privilege('authenticated', 'public.profile_directory', 'INSERT')
    and not has_table_privilege('authenticated', 'public.profile_directory', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.profile_directory', 'DELETE'),
    'P0.12: authenticated role cannot write safe directory'
  )
);
insert into _tap_results values (
  ok(
    not has_table_privilege('authenticated', 'public.calendar_feed_tokens', 'SELECT')
    and not has_table_privilege('authenticated', 'public.calendar_feed_tokens', 'INSERT')
    and not has_table_privilege('authenticated', 'public.calendar_feed_tokens', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.calendar_feed_tokens', 'DELETE'),
    'P0.13: authenticated role has no direct calendar-token access'
  )
);
insert into _tap_results values (
  ok(
    not has_table_privilege('anon', 'public.calendar_feed_tokens', 'SELECT')
    and not has_table_privilege('anon', 'public.calendar_feed_tokens', 'INSERT')
    and not has_table_privilege('anon', 'public.calendar_feed_tokens', 'UPDATE')
    and not has_table_privilege('anon', 'public.calendar_feed_tokens', 'DELETE'),
    'P0.14: anonymous role has no direct calendar-token access'
  )
);
insert into _tap_results values (
  ok(
    has_table_privilege('service_role', 'public.calendar_feed_tokens', 'SELECT')
    and has_table_privilege('service_role', 'public.calendar_feed_tokens', 'INSERT')
    and has_table_privilege('service_role', 'public.calendar_feed_tokens', 'UPDATE')
    and has_table_privilege('service_role', 'public.calendar_feed_tokens', 'DELETE'),
    'P0.15: service role owns calendar-token lifecycle'
  )
);
insert into _tap_results values (
  ok(
    not has_function_privilege('authenticated', 'public.admin_hard_delete_user(uuid)', 'EXECUTE'),
    'P0.16: authenticated cannot execute hard delete RPC'
  )
);
insert into _tap_results values (
  ok(
    not has_function_privilege('authenticated', 'public.start_onboarding_for_user(uuid,uuid,uuid)', 'EXECUTE'),
    'P0.17: authenticated cannot execute onboarding RPC'
  )
);
insert into _tap_results values (
  ok(
    not has_function_privilege('authenticated', 'public.start_offboarding_for_user(uuid,date,date,uuid)', 'EXECUTE'),
    'P0.18: authenticated cannot execute offboarding RPC'
  )
);
insert into _tap_results values (
  ok(
    not has_function_privilege('anon', 'public.admin_hard_delete_user(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.start_onboarding_for_user(uuid,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.start_offboarding_for_user(uuid,date,date,uuid)', 'EXECUTE'),
    'P0.19: anonymous cannot execute any privileged RPC'
  )
);
insert into _tap_results values (
  ok(
    has_function_privilege('service_role', 'public.admin_hard_delete_user(uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.start_onboarding_for_user(uuid,uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.start_offboarding_for_user(uuid,date,date,uuid)', 'EXECUTE'),
    'P0.20: service role can execute guarded RPC wrappers'
  )
);
insert into _tap_results values (
  has_trigger(
    'public',
    'profiles',
    'trg_profiles_block_self_privilege_changes',
    'P0.21: self-service privilege trigger exists'
  )
);
insert into _tap_results values (
  is(
    (select public from storage.buckets where id = 'chat-attachments'),
    false,
    'P0.22: chat attachment bucket is private'
  )
);
insert into _tap_results values (
  is(
    (select file_size_limit from storage.buckets where id = 'chat-attachments'),
    10485760::bigint,
    'P0.23: chat attachment bucket enforces 10 MB limit'
  )
);
insert into _tap_results values (
  is(
    (select allowed_mime_types::text from storage.buckets where id = 'chat-attachments'),
    '{image/jpeg,image/png,image/webp,application/pdf,text/plain}',
    'P0.24: chat attachment bucket has exact MIME allowlist'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and (
          coalesce(qual, '') ilike '%chat-attachments%'
          or coalesce(with_check, '') ilike '%chat-attachments%'
        )
    ),
    0,
    'P0.25: clients have no direct chat attachment Storage policy'
  )
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"71300000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into _tap_results values (
  lives_ok(
    $$update public.profiles
      set bio = 'Allowed personal profile change'
      where id = '71300000-0000-0000-0000-000000000001'$$,
    'P0.26: authenticated user can still update an allowed personal field'
  )
);
insert into _tap_results values (
  throws_ok(
    $$update public.profiles
      set role = 'admin'
      where id = '71300000-0000-0000-0000-000000000001'$$,
    '42501',
    null,
    'P0.27: authenticated user cannot promote own role'
  )
);
insert into _tap_results values (
  throws_ok(
    $$update public.profiles
      set employment_status = 'exited'
      where id = '71300000-0000-0000-0000-000000000001'$$,
    '42501',
    null,
    'P0.28: authenticated user cannot change own HR status'
  )
);
insert into _tap_results values (
  throws_ok(
    $$update public.profiles
      set avatar_url = 'https://attacker.invalid/avatar.png'
      where id = '71300000-0000-0000-0000-000000000001'$$,
    '42501',
    null,
    'P0.28a: authenticated user cannot bypass the avatar upload action'
  )
);
insert into _tap_results values (
  throws_ok(
    $$update public.profiles
      set current_status = 'privileged-status'
      where id = '71300000-0000-0000-0000-000000000001'$$,
    '42501',
    null,
    'P0.28b: authenticated user cannot change own system status'
  )
);
insert into _tap_results values (
  throws_ok(
    $$update public.profiles
      set learning_streak_current = 999
      where id = '71300000-0000-0000-0000-000000000001'$$,
    '42501',
    null,
    'P0.28c: authenticated user cannot forge a learning streak'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from public.profile_directory
      where id = '71300000-0000-0000-0000-000000000001'
    ),
    1,
    'P0.29: safe directory exposes the synchronized fixture'
  )
);
insert into _tap_results values (
  throws_ok(
    $$insert into public.calendar_feed_tokens (user_id, token_hash)
      values (
        '71300000-0000-0000-0000-000000000001',
        repeat('a', 64)
      )$$,
    '42501',
    null,
    'P0.30: authenticated user cannot insert a calendar token directly'
  )
);
insert into _tap_results values (
  throws_ok(
    $$update public.profile_directory
      set full_name = 'Tampered'
      where id = '71300000-0000-0000-0000-000000000001'$$,
    '42501',
    null,
    'P0.31: authenticated user cannot tamper with safe directory'
  )
);

reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
insert into _tap_results values (
  throws_ok(
    $$select count(*) from public.profiles$$,
    '42501',
    null,
    'P0.32: anonymous profile enumeration is rejected'
  )
);

insert into _tap_results select * from finish();
reset role;
select result from _tap_results;
rollback;
