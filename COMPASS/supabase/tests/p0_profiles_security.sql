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
  role,
  raw_user_meta_data
)
values (
  '71300000-0000-0000-0000-000000000001',
  'p0-profile-test@example.invalid',
  '',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  '{"full_name":"P0 Profile Test","avatar_url":"https://attacker.invalid/avatar.svg","gdpr_consent":true}'::jsonb
)
on conflict (id) do nothing;

insert into auth.users (
  id,
  email,
  encrypted_password,
  instance_id,
  aud,
  role
)
values (
  '71300000-0000-0000-0000-000000000002',
  'p0-admin-test@example.invalid',
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

update public.profiles
set role = 'admin'
where id = '71300000-0000-0000-0000-000000000002';

insert into public.conversations (id, type, owner_id)
values (
  '71300000-0000-0000-0000-000000000010',
  'direct',
  null
)
on conflict (id) do nothing;

insert into public.conversation_participants (conversation_id, user_id, role)
values
  (
    '71300000-0000-0000-0000-000000000010',
    '71300000-0000-0000-0000-000000000001',
    'member'
  ),
  (
    '71300000-0000-0000-0000-000000000010',
    '71300000-0000-0000-0000-000000000002',
    'member'
  )
on conflict (conversation_id, user_id) do nothing;

insert into _tap_results values (plan(52));

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
insert into _tap_results values (
  ok(
    not has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
    'P0.25a: authenticated cannot provision a profile with a chosen role'
  )
);
insert into _tap_results values (
  ok(
    not has_table_privilege('authenticated', 'public.conversations', 'INSERT')
    and not has_table_privilege('authenticated', 'public.conversation_participants', 'INSERT'),
    'P0.25b: conversation membership can only be created by guarded RPCs'
  )
);
insert into _tap_results values (
  ok(
    has_column_privilege('authenticated', 'public.conversations', 'last_message_at', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.conversations', 'owner_id', 'UPDATE')
    and has_column_privilege('authenticated', 'public.conversation_participants', 'last_read_at', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.conversation_participants', 'role', 'UPDATE'),
    'P0.25c: communicator UPDATE grants are column-scoped'
  )
);
insert into _tap_results values (
  ok(
    not has_function_privilege('anon', 'public.create_direct_conversation(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.create_broadcast_conversation(uuid,text,uuid[])', 'EXECUTE'),
    'P0.25d: anonymous cannot execute communicator SECURITY DEFINER RPCs'
  )
);
insert into _tap_results values (
  ok(
    has_function_privilege('authenticated', 'public.create_direct_conversation(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.create_broadcast_conversation(uuid,text,uuid[])', 'EXECUTE'),
    'P0.25e: authenticated users reach the internally guarded communicator RPCs'
  )
);
insert into _tap_results values (
  ok(
    (
      select avatar_url is null and coalesce(gdpr_consent, false) = false
      from public.profiles
      where id = '71300000-0000-0000-0000-000000000001'
    ),
    'P0.25f: auth metadata cannot provision avatar or consent state'
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
  throws_ok(
    $$update public.profiles
      set created_at = now() - interval '10 years'
      where id = '71300000-0000-0000-0000-000000000001'$$,
    '42501',
    null,
    'P0.28d: authenticated user cannot rewrite profile creation time'
  )
);
insert into _tap_results values (
  throws_ok(
    $$update public.profiles
      set default_location = 'forged-system-location'
      where id = '71300000-0000-0000-0000-000000000001'$$,
    '42501',
    null,
    'P0.28e: authenticated user cannot rewrite a system default'
  )
);
insert into _tap_results values (
  throws_ok(
    $$insert into public.profiles (id, email, role)
      values (
        '71300000-0000-0000-0000-000000000099',
        'forged-admin@example.invalid',
        'admin'
      )$$,
    '42501',
    null,
    'P0.28g: authenticated orphan cannot insert an admin profile'
  )
);
insert into _tap_results values (
  throws_ok(
    $$insert into public.conversation_participants (conversation_id, user_id, role)
      values (
        '71300000-0000-0000-0000-000000000010',
        '71300000-0000-0000-0000-000000000001',
        'admin'
      )$$,
    '42501',
    null,
    'P0.28h: client cannot manufacture conversation membership'
  )
);
insert into _tap_results values (
  throws_ok(
    $$update public.conversation_participants
      set role = 'admin'
      where conversation_id = '71300000-0000-0000-0000-000000000010'
        and user_id = '71300000-0000-0000-0000-000000000001'$$,
    '42501',
    null,
    'P0.28i: participant cannot promote its conversation role'
  )
);
insert into _tap_results values (
  throws_ok(
    $$update public.conversations
      set owner_id = '71300000-0000-0000-0000-000000000001'
      where id = '71300000-0000-0000-0000-000000000010'$$,
    '42501',
    null,
    'P0.28j: participant cannot take ownership of a conversation'
  )
);
insert into _tap_results values (
  throws_ok(
    $$insert into public.messages (conversation_id, sender_id, content, type)
      values (
        '71300000-0000-0000-0000-000000000010',
        '71300000-0000-0000-0000-000000000002',
        'spoofed sender',
        'text'
      )$$,
    '42501',
    null,
    'P0.28k: participant cannot spoof another message sender'
  )
);
insert into _tap_results values (
  throws_ok(
    $$select public.create_direct_conversation(
      '71300000-0000-0000-0000-000000000002',
      '71300000-0000-0000-0000-000000000001'
    )$$,
    '42501',
    null,
    'P0.28l: direct conversation RPC binds the caller identity'
  )
);
insert into _tap_results values (
  throws_ok(
    $$select public.create_broadcast_conversation(
      '71300000-0000-0000-0000-000000000001',
      'forged broadcast',
      array['71300000-0000-0000-0000-000000000002'::uuid]
    )$$,
    '42501',
    null,
    'P0.28m: non-admin cannot create a broadcast via direct RPC'
  )
);
insert into _tap_results values (
  lives_ok(
    $$select public.create_direct_conversation(
      '71300000-0000-0000-0000-000000000001',
      '71300000-0000-0000-0000-000000000002'
    )$$,
    'P0.28n: guarded direct conversation RPC still works for its caller'
  )
);
insert into _tap_results values (
  throws_ok(
    $$insert into public.messages (
        conversation_id,
        sender_id,
        content,
        type,
        attachment_path,
        attachment_name,
        attachment_mime,
        attachment_size
      ) values (
        '71300000-0000-0000-0000-000000000010',
        '71300000-0000-0000-0000-000000000001',
        'unsafe attachment',
        'file',
        '71300000-0000-0000-0000-000000000010/71300000-0000-0000-0000-000000000001/71300000-0000-0000-0000-000000000020.svg',
        'payload.svg',
        'image/png',
        100
      )$$,
    '23514',
    null,
    'P0.28o: unsafe attachment extensions are rejected in the database'
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
