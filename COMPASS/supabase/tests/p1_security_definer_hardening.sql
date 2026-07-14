-- P1 regression suite for the complete application-owned SECURITY DEFINER
-- inventory. Run after a fresh migration replay with `supabase test db`.

set search_path to public, extensions;

begin;

create temp table _tap_results (result text);
grant insert, select on _tap_results to anon, authenticated, service_role;

create temp table _expected_function_security (
  signature text primary key,
  is_definer boolean not null,
  anon_exec boolean not null,
  authenticated_exec boolean not null,
  service_exec boolean not null
);

insert into _expected_function_security values
  ('private.admin_hard_delete_user_impl(uuid)', true, false, false, false),
  ('private.record_lifecycle_event_impl(uuid,text,uuid,jsonb)', true, false, false, false),
  ('private.start_offboarding_for_user_impl(uuid,date,date,uuid)', true, false, false, false),
  ('private.start_onboarding_for_user_impl(uuid,uuid,uuid)', true, false, false, false),
  ('private.sync_profile_directory()', true, false, false, false),
  ('public.admin_hard_delete_user(uuid)', true, false, false, true),
  ('public.admin_revoke_user_sessions(uuid)', true, false, false, true),
  ('public.award_course_points(uuid)', true, false, true, false),
  ('public.award_first_publish_bonus(uuid)', true, false, true, false),
  ('public.can_propose_bonus_for(uuid)', false, false, true, true),
  ('public.create_broadcast_conversation(uuid,text,uuid[])', true, false, true, false),
  ('public.create_direct_conversation(uuid,uuid)', true, false, true, false),
  ('public.get_quiz_for_attempt(uuid)', true, false, true, false),
  ('public.handle_new_user()', true, false, false, false),
  ('public.has_hr_zone_access()', false, false, true, true),
  ('public.has_lifecycle_access()', false, false, true, true),
  ('public.is_admin()', false, false, true, true),
  ('public.is_buddy_of(uuid)', true, false, true, true),
  ('public.is_conversation_member(uuid)', true, false, true, true),
  ('public.is_finanse_or_admin()', false, false, true, true),
  ('public.is_inbox_handler()', false, false, true, true),
  ('public.is_internal_or_admin()', true, false, true, true),
  ('public.is_manager()', false, false, true, true),
  ('public.is_manager_of(uuid)', true, false, true, true),
  ('public.is_talent_community()', false, false, true, true),
  ('public.is_trainer_or_admin()', false, false, true, true),
  ('public.log_rate_change()', true, false, false, false),
  ('public.match_courses(vector,double precision,integer)', false, false, true, true),
  ('public.record_lifecycle_event(uuid,text,uuid,jsonb)', true, false, false, true),
  ('public.resolve_role_default(user_role,text)', false, false, true, true),
  ('public.start_offboarding_for_user(uuid,date,date,uuid)', true, false, false, true),
  ('public.start_onboarding_for_user(uuid,uuid,uuid)', true, false, false, true),
  ('public.submit_quiz_attempt(uuid,jsonb)', true, false, true, false),
  ('public.sync_conversation_ticket()', true, false, false, false),
  ('public.sync_exit_case_contractor()', true, false, false, false),
  ('public.sync_exit_case_employee()', true, false, false, false),
  ('public.sync_onboarding_case_contractor()', true, false, false, false),
  ('public.sync_onboarding_case_employee()', true, false, false, false),
  ('public.sync_profile_to_candidate()', false, false, false, false),
  ('public.sync_task_ticket()', true, false, false, false),
  ('public.sync_user_role(uuid,text,boolean)', true, false, false, true),
  ('public.update_loyalty_points()', true, false, false, false);

insert into auth.users (id, email, encrypted_password, instance_id, aud, role)
values
  (
    '71500000-0000-0000-0000-000000000001',
    'secdef-admin@example.invalid', '',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  ),
  (
    '71500000-0000-0000-0000-000000000002',
    'secdef-tcm@example.invalid', '',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  ),
  (
    '71500000-0000-0000-0000-000000000003',
    'secdef-manager@example.invalid', '',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  ),
  (
    '71500000-0000-0000-0000-000000000004',
    'secdef-target@example.invalid', '',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  ),
  (
    '71500000-0000-0000-0000-000000000005',
    'secdef-outsider@example.invalid', '',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  )
on conflict (id) do nothing;

update public.profiles
set role = case id
  when '71500000-0000-0000-0000-000000000001'::uuid then 'admin'::public.user_role
  when '71500000-0000-0000-0000-000000000002'::uuid then 'talent_community'::public.user_role
  when '71500000-0000-0000-0000-000000000003'::uuid then 'manager'::public.user_role
  else 'internal'::public.user_role
end,
manager_id = case
  when id = '71500000-0000-0000-0000-000000000004'::uuid
    then '71500000-0000-0000-0000-000000000003'::uuid
  else null
end
where id between
  '71500000-0000-0000-0000-000000000001'::uuid and
  '71500000-0000-0000-0000-000000000005'::uuid;

insert into _tap_results values (plan(32));

insert into _tap_results values (
  is(
    (select count(*)::integer from _expected_function_security),
    42,
    'SD.1: inventory classifies all 42 application functions'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from _expected_function_security
      where to_regprocedure(signature) is null
    ),
    0,
    'SD.2: every classified function exists after fresh replay'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from _expected_function_security e
      join pg_proc p on p.oid = to_regprocedure(e.signature)
      where p.prosecdef is distinct from e.is_definer
    ),
    0,
    'SD.3: every function has its classified invoker/definer mode'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where p.prosecdef
        and n.nspname in ('public', 'private')
        and not exists (
          select 1
          from _expected_function_security e
          where to_regprocedure(e.signature) = p.oid
        )
    ),
    0,
    'SD.4: no application SECURITY DEFINER is missing from inventory'
  )
);
insert into _tap_results values (
  is(
    (select count(*)::integer from _expected_function_security where is_definer),
    30,
    'SD.5: only 30 functions retain definer rights'
  )
);
insert into _tap_results values (
  is(
    (select count(*)::integer from _expected_function_security where not is_definer),
    12,
    'SD.6: 12 unnecessary definers are now invokers'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from _expected_function_security e
      join pg_proc p on p.oid = to_regprocedure(e.signature)
      where e.is_definer
        and not (
          coalesce(array_to_string(p.proconfig, ';'), '') = 'search_path=""'
          or coalesce(array_to_string(p.proconfig, ';'), '')
             ~ '^search_path=pg_catalog, .*pg_temp$'
        )
    ),
    0,
    'SD.7: every retained definer pins a safe search_path'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from _expected_function_security e
      join pg_proc p on p.oid = to_regprocedure(e.signature)
      where has_function_privilege('anon', p.oid, 'EXECUTE') <> e.anon_exec
         or has_function_privilege('authenticated', p.oid, 'EXECUTE') <> e.authenticated_exec
         or has_function_privilege('service_role', p.oid, 'EXECUTE') <> e.service_exec
    ),
    0,
    'SD.8: explicit anon/authenticated/service ACL matches inventory'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from _expected_function_security e
      join pg_proc p on p.oid = to_regprocedure(e.signature)
      where has_function_privilege('anon', p.oid, 'EXECUTE')
    ),
    0,
    'SD.9: anon cannot execute any classified function'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from _expected_function_security e
      join pg_proc p on p.oid = to_regprocedure(e.signature)
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private'
        and (
          has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('service_role', p.oid, 'EXECUTE')
        )
    ),
    0,
    'SD.10: private implementations are owner-only'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from _expected_function_security e
      join pg_proc p on p.oid = to_regprocedure(e.signature)
      where pg_get_function_result(p.oid) = 'trigger'
        and (
          has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('service_role', p.oid, 'EXECUTE')
        )
    ),
    0,
    'SD.11: trigger-only functions have no client EXECUTE grant'
  )
);
insert into _tap_results values (
  is(
    (
      select count(*)::integer
      from public.profile_directory
      where id between
        '71500000-0000-0000-0000-000000000001'::uuid and
        '71500000-0000-0000-0000-000000000005'::uuid
    ),
    5,
    'SD.12: owner-only profile-directory trigger still executes'
  )
);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
insert into _tap_results values (
  throws_ok(
    $$select public.is_admin()$$,
    '42501', null,
    'SD.13: anon cannot call even a read-only role helper'
  )
);

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"71500000-0000-0000-0000-000000000003","email":"secdef-manager@example.invalid","role":"authenticated"}';
insert into _tap_results values (
  throws_ok(
    $$select public.admin_revoke_user_sessions('71500000-0000-0000-0000-000000000004')$$,
    '42501', null,
    'SD.14: authenticated cannot execute session revocation'
  )
);
insert into _tap_results values (
  throws_ok(
    $$select public.sync_user_role(
      '71500000-0000-0000-0000-000000000003',
      'secdef-manager@example.invalid', true
    )$$,
    '42501', null,
    'SD.15: authenticated cannot self-promote through role sync'
  )
);
insert into _tap_results values (
  throws_ok(
    $$select public.start_onboarding_for_user(
      '71500000-0000-0000-0000-000000000004', null,
      '71500000-0000-0000-0000-000000000003'
    )$$,
    '42501', null,
    'SD.16: authenticated cannot start cross-user onboarding'
  )
);
insert into _tap_results values (
  throws_ok(
    $$select public.award_first_publish_bonus(
      '71500000-0000-0000-0000-000000000099'
    )$$,
    '42501', null,
    'SD.17: non-admin cannot award a publication bonus'
  )
);
insert into _tap_results values (
  is(
    public.is_manager_of('71500000-0000-0000-0000-000000000004'),
    true,
    'SD.18: manager relationship helper accepts a direct report'
  )
);
insert into _tap_results values (
  is(
    public.is_manager_of('71500000-0000-0000-0000-000000000005'),
    false,
    'SD.19: cross-user helper denies a non-report'
  )
);
insert into _tap_results values (
  is(
    public.has_lifecycle_access(),
    false,
    'SD.20: manager does not inherit lifecycle-manager access'
  )
);
insert into _tap_results values (
  is(
    public.is_admin(),
    false,
    'SD.21: invoker role helper remains fail-closed for non-admin'
  )
);

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"71500000-0000-0000-0000-000000000002","email":"secdef-tcm@example.invalid","role":"authenticated"}';
insert into _tap_results values (
  is(
    public.has_lifecycle_access(),
    true,
    'SD.22: TCM retains lifecycle access after invoker conversion'
  )
);

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"71500000-0000-0000-0000-000000000001","email":"secdef-admin@example.invalid","role":"authenticated"}';
insert into _tap_results values (
  is(
    public.is_admin(),
    true,
    'SD.23: admin helper still works as invoker under profiles RLS'
  )
);

reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
insert into _tap_results values (
  throws_ok(
    $$select public.sync_user_role(
      '71500000-0000-0000-0000-000000000003',
      'attacker@example.invalid', false
    )$$,
    '42501', null,
    'SD.24: service role cannot sync with an unverified target email'
  )
);
insert into _tap_results values (
  is(
    public.sync_user_role(
      '71500000-0000-0000-0000-000000000003',
      'secdef-manager@example.invalid', false
    )::text,
    'manager',
    'SD.25: service role preserves a verified manager role'
  )
);
insert into _tap_results values (
  is(
    public.sync_user_role(
      '71500000-0000-0000-0000-000000000005',
      'secdef-outsider@example.invalid', true
    )::text,
    'admin',
    'SD.26: guarded service layer can apply verified super-admin input'
  )
);
insert into _tap_results values (
  throws_ok(
    $$select public.start_onboarding_for_user(
      '71500000-0000-0000-0000-000000000004', null,
      '71500000-0000-0000-0000-000000000003'
    )$$,
    '42501', null,
    'SD.27: service call still requires a lifecycle-manager actor'
  )
);
insert into _tap_results values (
  throws_ok(
    $$select public.start_offboarding_for_user(
      '71500000-0000-0000-0000-000000000004', current_date, null,
      '71500000-0000-0000-0000-000000000003'
    )$$,
    '42501', null,
    'SD.28: cross-user offboarding rejects a non-lifecycle actor'
  )
);
insert into _tap_results values (
  lives_ok(
    $$select public.admin_revoke_user_sessions(
      '71500000-0000-0000-0000-000000000004'
    )$$,
    'SD.29: service role can revoke sessions through guarded RPC'
  )
);

-- Simulate a future accidental broad GRANT and prove the in-function guard
-- still rejects browser JWTs. The transaction rolls back these temporary ACLs.
reset role;
grant execute on function public.admin_revoke_user_sessions(uuid) to authenticated;
grant execute on function public.sync_user_role(uuid, text, boolean) to authenticated;
grant execute on function public.start_onboarding_for_user(uuid, uuid, uuid) to authenticated;

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"71500000-0000-0000-0000-000000000003","email":"secdef-manager@example.invalid","role":"authenticated"}';
insert into _tap_results values (
  throws_ok(
    $$select public.admin_revoke_user_sessions(
      '71500000-0000-0000-0000-000000000004'
    )$$,
    '42501', null,
    'SD.30: session RPC guard survives an accidental authenticated GRANT'
  )
);
insert into _tap_results values (
  throws_ok(
    $$select public.sync_user_role(
      '71500000-0000-0000-0000-000000000003',
      'secdef-manager@example.invalid', true
    )$$,
    '42501', null,
    'SD.31: role-sync guard survives an accidental authenticated GRANT'
  )
);
insert into _tap_results values (
  throws_ok(
    $$select public.start_onboarding_for_user(
      '71500000-0000-0000-0000-000000000004', null,
      '71500000-0000-0000-0000-000000000003'
    )$$,
    '42501', null,
    'SD.32: lifecycle RPC guard survives an accidental authenticated GRANT'
  )
);

reset role;
select result from _tap_results;
select * from finish();

rollback;
