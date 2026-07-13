-- pgTAP regression suite for the historical migration reconciliation.
-- This suite is intentionally fixture-free and safe to run after every fresh
-- `supabase db reset`. It verifies the schema gaps that originally made a
-- repository-only rebuild fail.

BEGIN;
SELECT plan(23);

SELECT has_table('public', 'conversations',
  'communicator base table is reproducible from migrations');
SELECT has_table('public', 'conversation_participants',
  'communicator participants table is reproducible from migrations');
SELECT has_table('public', 'messages',
  'communicator messages table is reproducible from migrations');

SELECT has_column('public', 'profiles', 'current_status',
  'profiles.current_status exists before availability constraints');
SELECT has_column('compass_legacy', 'candidates', 'current_status',
  'archived candidates.current_status survived availability and ATS archival');

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_ts_config cfg
    JOIN pg_catalog.pg_namespace ns ON ns.oid = cfg.cfgnamespace
    WHERE ns.nspname = 'public' AND cfg.cfgname = 'polish'
  ),
  'deterministic public.polish text-search configuration exists'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_catalog.pg_class
   WHERE oid = 'public.conversations'::regclass),
  'RLS is enabled on conversations'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_catalog.pg_class
   WHERE oid = 'public.conversation_participants'::regclass),
  'RLS is enabled on conversation_participants'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_catalog.pg_class
   WHERE oid = 'public.messages'::regclass),
  'RLS is enabled on messages'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_catalog.pg_class
   WHERE oid = 'compass_legacy.candidates'::regclass),
  'RLS remains enabled on the archived candidates table'
);

SELECT is(
  (SELECT count(*) FROM auth.users),
  0::bigint,
  'migration replay never creates an application user'
);

SELECT is(
  (SELECT count(*) FROM public.admin_access_list),
  0::bigint,
  'migration replay never seeds a hardcoded administrator identity'
);

SELECT is(
  (SELECT count(*)
   FROM pg_catalog.pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'admin_access_list'
     AND 'authenticated' = ANY(roles)
     AND COALESCE(qual, '') = 'true'),
  0::bigint,
  'admin registry has no allow-all authenticated read policy'
);

SELECT ok(
  NOT has_schema_privilege('anon', 'compass_legacy', 'USAGE'),
  'anon has no access to the archived schema'
);

SELECT ok(
  NOT has_schema_privilege('authenticated', 'compass_legacy', 'USAGE'),
  'authenticated has no access to the archived schema'
);

SELECT ok(
  NOT has_table_privilege('anon', 'compass_legacy.candidates', 'SELECT'),
  'anon cannot read archived candidates'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'compass_legacy.candidates', 'SELECT'),
  'authenticated cannot read archived candidates'
);

SELECT ok(
  has_schema_privilege('service_role', 'compass_legacy', 'USAGE')
  AND has_table_privilege('service_role', 'compass_legacy.candidates', 'SELECT'),
  'service_role retains explicit audit access to the archive'
);

SELECT is(
  (SELECT count(*)
   FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'sync_user_role'
     AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_email text'),
  0::bigint,
  'obsolete two-argument sync_user_role overload is absent'
);

SELECT is(
  (SELECT count(*)
   FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sync_user_role'),
  1::bigint,
  'exactly one sync_user_role overload remains'
);

SELECT hasnt_table('public', 'match_results',
  'manual-only legacy match_results is not a fresh-schema dependency');

SELECT cmp_ok(
  (SELECT count(*) FROM supabase_migrations.schema_migrations),
  '>=',
  180::bigint,
  'the reconciled 180-migration baseline and every later migration were recorded'
);

SELECT is(
  (SELECT count(*) FROM supabase_migrations.schema_migrations),
  (SELECT count(DISTINCT version) FROM supabase_migrations.schema_migrations),
  'migration ledger contains only unique versions'
);

SELECT * FROM finish();
ROLLBACK;
