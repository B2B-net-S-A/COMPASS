-- P1 regression suite: lifecycle_events is readable through RLS but runtime
-- writes are possible only through the guarded service-role RPC.

set search_path to public, extensions;

begin;

create temp table _tap_results (result text);
grant insert, select on _tap_results to anon, authenticated, service_role;

insert into auth.users (id, email, encrypted_password, instance_id, aud, role)
values
  (
    '71400000-0000-0000-0000-000000000001',
    'p1-lifecycle-admin@example.invalid',
    '',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated'
  ),
  (
    '71400000-0000-0000-0000-000000000002',
    'p1-lifecycle-user@example.invalid',
    '',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated'
  ),
  (
    '71400000-0000-0000-0000-000000000003',
    'p1-lifecycle-target@example.invalid',
    '',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated'
  )
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role)
values
  (
    '71400000-0000-0000-0000-000000000001',
    'p1-lifecycle-admin@example.invalid',
    'P1 Lifecycle Admin',
    'admin'
  ),
  (
    '71400000-0000-0000-0000-000000000002',
    'p1-lifecycle-user@example.invalid',
    'P1 Lifecycle User',
    'internal'
  ),
  (
    '71400000-0000-0000-0000-000000000003',
    'p1-lifecycle-target@example.invalid',
    'P1 Lifecycle Target',
    'internal'
  )
on conflict (id) do update
set email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role;

insert into _tap_results values (plan(21));

insert into _tap_results values (
  is(
    (select relrowsecurity from pg_class where oid = 'public.lifecycle_events'::regclass),
    true,
    'P1.1: lifecycle_events keeps RLS enabled'
  )
);
insert into _tap_results values (
  ok(
    not has_table_privilege('anon', 'public.lifecycle_events', 'SELECT'),
    'P1.2: anonymous clients cannot read the employee timeline'
  )
);
insert into _tap_results values (
  ok(
    has_table_privilege('authenticated', 'public.lifecycle_events', 'SELECT'),
    'P1.3: authenticated users retain RLS-scoped timeline reads'
  )
);
insert into _tap_results values (
  ok(
    not has_table_privilege('anon', 'public.lifecycle_events', 'INSERT'),
    'P1.4: anonymous clients have no direct INSERT grant'
  )
);
insert into _tap_results values (
  ok(
    not has_table_privilege('authenticated', 'public.lifecycle_events', 'INSERT'),
    'P1.5: authenticated clients have no direct INSERT grant'
  )
);
insert into _tap_results values (
  ok(
    not has_table_privilege('service_role', 'public.lifecycle_events', 'INSERT'),
    'P1.6: service clients cannot bypass the dedicated RPC with direct INSERT'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from pg_policies
      where schemaname = 'public'
        and tablename = 'lifecycle_events'
        and cmd = 'INSERT'
    ),
    0,
    'P1.7: lifecycle_events has no client INSERT policy'
  )
);
insert into _tap_results values (
  ok(
    not has_function_privilege(
      'anon',
      'public.record_lifecycle_event(uuid,text,uuid,jsonb)',
      'EXECUTE'
    ),
    'P1.8: anonymous clients cannot execute the writer RPC'
  )
);
insert into _tap_results values (
  ok(
    not has_function_privilege(
      'authenticated',
      'public.record_lifecycle_event(uuid,text,uuid,jsonb)',
      'EXECUTE'
    ),
    'P1.9: authenticated clients cannot execute the writer RPC'
  )
);
insert into _tap_results values (
  ok(
    has_function_privilege(
      'service_role',
      'public.record_lifecycle_event(uuid,text,uuid,jsonb)',
      'EXECUTE'
    ),
    'P1.10: service role can execute the guarded writer RPC'
  )
);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
insert into _tap_results values (
  throws_ok(
    $$insert into public.lifecycle_events (user_id, event_type)
      values ('71400000-0000-0000-0000-000000000003', 'hired')$$,
    '42501',
    null,
    'P1.11: anonymous direct INSERT is rejected'
  )
);

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"71400000-0000-0000-0000-000000000002","role":"authenticated"}';
insert into _tap_results values (
  throws_ok(
    $$insert into public.lifecycle_events (user_id, event_type, created_by)
      values (
        '71400000-0000-0000-0000-000000000002',
        'hired',
        '71400000-0000-0000-0000-000000000002'
      )$$,
    '42501',
    null,
    'P1.12: authenticated user cannot forge an event for self'
  )
);
insert into _tap_results values (
  throws_ok(
    $$insert into public.lifecycle_events (user_id, event_type, created_by)
      values (
        '71400000-0000-0000-0000-000000000003',
        'role_changed',
        '71400000-0000-0000-0000-000000000002'
      )$$,
    '42501',
    null,
    'P1.13: authenticated user cannot forge a cross-user event'
  )
);
insert into _tap_results values (
  throws_ok(
    $$select public.record_lifecycle_event(
      '71400000-0000-0000-0000-000000000003',
      'role_changed',
      '71400000-0000-0000-0000-000000000001',
      '{"forged":true}'::jsonb
    )$$,
    '42501',
    null,
    'P1.14: authenticated user cannot impersonate an admin through the RPC'
  )
);

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"71400000-0000-0000-0000-000000000001","role":"authenticated"}';
insert into _tap_results values (
  throws_ok(
    $$select public.record_lifecycle_event(
      '71400000-0000-0000-0000-000000000003',
      'role_changed',
      '71400000-0000-0000-0000-000000000001',
      '{"browser_admin":true}'::jsonb
    )$$,
    '42501',
    null,
    'P1.15: an authenticated admin browser must still use a guarded server action'
  )
);

reset role;
set local role service_role;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}';
insert into _tap_results values (
  throws_ok(
    $$insert into public.lifecycle_events (user_id, event_type, created_by)
      values (
        '71400000-0000-0000-0000-000000000003',
        'hired',
        '71400000-0000-0000-0000-000000000001'
      )$$,
    '42501',
    null,
    'P1.16: service role direct INSERT is rejected'
  )
);
insert into _tap_results values (
  throws_ok(
    $$select public.record_lifecycle_event(
      '71400000-0000-0000-0000-000000000003',
      'role_changed',
      '71400000-0000-0000-0000-000000000002',
      '{}'::jsonb
    )$$,
    '42501',
    null,
    'P1.17: RPC rejects a non-lifecycle actor even for service role'
  )
);
insert into _tap_results values (
  throws_ok(
    $$select public.record_lifecycle_event(
      '71400000-0000-0000-0000-000000000003',
      'role_changed',
      '71400000-0000-0000-0000-000000000001',
      '["not-an-object"]'::jsonb
    )$$,
    '22023',
    null,
    'P1.18: RPC rejects non-object metadata'
  )
);
insert into _tap_results values (
  lives_ok(
    $$select public.record_lifecycle_event(
      '71400000-0000-0000-0000-000000000003',
      'role_changed',
      '71400000-0000-0000-0000-000000000001',
      '{"new_role":"manager","source":"pgtap"}'::jsonb
    )$$,
    'P1.19: guarded RPC records an authorized lifecycle event'
  )
);
insert into _tap_results values (
  is(
    (
      select created_by
      from public.lifecycle_events
      where user_id = '71400000-0000-0000-0000-000000000003'
        and event_type = 'role_changed'
        and metadata ->> 'source' = 'pgtap'
    ),
    '71400000-0000-0000-0000-000000000001'::uuid,
    'P1.20: RPC binds the authorized actor to the event'
  )
);
insert into _tap_results values (
  throws_ok(
    $$update public.lifecycle_events
      set metadata = '{"tampered":true}'::jsonb
      where user_id = '71400000-0000-0000-0000-000000000003'
        and metadata ->> 'source' = 'pgtap'$$,
    '42501',
    null,
    'P1.21: recorded events remain immutable to service clients'
  )
);

reset role;
insert into _tap_results select * from finish();
select result from _tap_results;
rollback;
