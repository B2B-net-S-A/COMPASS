# SECURITY DEFINER inventory

Snapshot source: fresh PostgreSQL 17/Supabase replay through
`20260714105543_security_definer_hardening.sql`. The inventory covers every
application-owned function that was `SECURITY DEFINER` in the reproducible
`public` or `private` schema before hardening.

Result:

- 42 functions classified;
- 12 unnecessary definers converted to `SECURITY INVOKER`;
- 30 retained definers, all with an empty search path or trusted schemas plus
  explicit `pg_temp` last;
- no function is executable by `anon` or implicit `PUBLIC`;
- private implementations and trigger-only functions are owner-only;
- exposed service operations validate the `service_role` JWT internally;
- cross-user RPCs validate caller identity or an explicit role relationship.

Supabase/platform-owned functions in `net`, `extensions`, `auth`, `storage`,
`realtime`, `vault`, `graphql*` and `supabase_functions` are intentionally out
of scope; application migrations do not own their lifecycle or ACL.

| Function | Final mode | Explicit callers | Classification / internal guard |
|---|---|---|---|
| `private.admin_hard_delete_user_impl(uuid)` | Definer | owner only | Private destructive implementation; reachable only through service wrapper. |
| `private.record_lifecycle_event_impl(uuid,text,uuid,jsonb)` | Definer | owner only | Private append-only writer; validates actor is admin/TCM. |
| `private.start_offboarding_for_user_impl(uuid,date,date,uuid)` | Definer | owner only | Private transactional HR writer; wrapper validates service JWT and actor role. |
| `private.start_onboarding_for_user_impl(uuid,uuid,uuid)` | Definer | owner only | Private transactional HR writer; wrapper validates service JWT and actor role. |
| `private.sync_profile_directory()` | Definer | owner only | Trigger must maintain the safe directory despite caller RLS. |
| `public.admin_hard_delete_user(uuid)` | Definer | service | Service JWT guard; destructive implementation remains private. |
| `public.admin_revoke_user_sessions(uuid)` | Definer | service | Service JWT guard; requires auth-schema writes. |
| `public.award_course_points(uuid)` | Definer | authenticated | Caller must own enrollment or be admin; atomic protected loyalty write. |
| `public.award_first_publish_bonus(uuid)` | Definer | authenticated | Admin guard and published-course check; atomic protected loyalty write. |
| `public.can_propose_bonus_for(uuid)` | Invoker | authenticated, service | Pure alias over guarded role/relationship helpers. |
| `public.create_broadcast_conversation(uuid,text,uuid[])` | Definer | authenticated | Caller ID must match owner and current profile must be admin. |
| `public.create_direct_conversation(uuid,uuid)` | Definer | authenticated | Caller ID equality, target validation and consultant-to-consultant rule. |
| `public.get_quiz_for_attempt(uuid)` | Definer | authenticated | Enrollment/author/admin matrix; bypass needed to hide answer metadata. |
| `public.handle_new_user()` | Definer | owner only | Auth trigger writes a profile; no direct RPC access. |
| `public.has_hr_zone_access()` | Invoker | authenticated, service | Pure alias over `is_internal_or_admin()`. |
| `public.has_lifecycle_access()` | Invoker | authenticated, service | Reads only the caller's own profile role. |
| `public.is_admin()` | Invoker | authenticated, service | Reads only the caller's own profile role. |
| `public.is_buddy_of(uuid)` | Definer | authenticated, service | Cross-user relationship lookup used by RLS. |
| `public.is_conversation_member(uuid)` | Definer | authenticated, service | Breaks recursive RLS on conversation membership; scoped to `auth.uid()`. |
| `public.is_finanse_or_admin()` | Invoker | authenticated, service | Reads only the caller's own profile role. |
| `public.is_inbox_handler()` | Invoker | authenticated, service | Reads only the caller's own profile handler flag/role. |
| `public.is_internal_or_admin()` | Definer | authenticated, service | Required to break recursion in `profiles` team RLS. |
| `public.is_manager()` | Invoker | authenticated, service | Reads only the caller's own profile role. |
| `public.is_manager_of(uuid)` | Definer | authenticated, service | Cross-user direct-report lookup used by RLS. |
| `public.is_talent_community()` | Invoker | authenticated, service | Reads only the caller's own profile role. |
| `public.is_trainer_or_admin()` | Invoker | authenticated, service | Deprecated compatibility alias over `is_admin()`. |
| `public.log_rate_change()` | Definer | owner only | Audit trigger on archived market rates; path fixed to `compass_legacy`. |
| `public.match_courses(vector,double precision,integer)` | Invoker | authenticated, service | Published-course read already enforced by RLS. |
| `public.record_lifecycle_event(uuid,text,uuid,jsonb)` | Definer | service | Service JWT guard; private implementation validates admin/TCM actor. |
| `public.resolve_role_default(user_role,text)` | Invoker | authenticated, service | Read-only defaults table already protected by RLS. |
| `public.start_offboarding_for_user(uuid,date,date,uuid)` | Definer | service | Service JWT plus admin/TCM actor guard. |
| `public.start_onboarding_for_user(uuid,uuid,uuid)` | Definer | service | Service JWT plus admin/TCM actor guard. |
| `public.submit_quiz_attempt(uuid,jsonb)` | Definer | authenticated | Uses `auth.uid()`, own enrollment, hidden answers and atomic scoring. |
| `public.sync_conversation_ticket()` | Definer | owner only | Mirror trigger bypasses target-table RLS; exception-safe. |
| `public.sync_exit_case_contractor()` | Definer | owner only | Mirror trigger bypasses target-table RLS; exception-safe. |
| `public.sync_exit_case_employee()` | Definer | owner only | Mirror trigger bypasses target-table RLS; exception-safe. |
| `public.sync_onboarding_case_contractor()` | Definer | owner only | Mirror trigger bypasses target-table RLS; exception-safe. |
| `public.sync_onboarding_case_employee()` | Definer | owner only | Mirror trigger bypasses target-table RLS; exception-safe. |
| `public.sync_profile_to_candidate()` | Invoker | owner only | Unattached legacy ATS trigger; no elevated rights retained. |
| `public.sync_task_ticket()` | Definer | owner only | Mirror trigger bypasses target-table RLS; exception-safe. |
| `public.sync_user_role(uuid,text,boolean)` | Definer | service | Service JWT, target-profile email match; server verifies user before RPC. |
| `public.update_loyalty_points()` | Definer | owner only | Trigger updates protected profile totals; no direct RPC access. |

The executable matrix and all negative scenarios are enforced by
`supabase/tests/p1_security_definer_hardening.sql`; adding a new application
definer without updating the inventory fails the test.
