# Academy — canonical dependency upgrade evidence

This contract qualifies the **Academy upgrade from the observed application
dependencies**, not restoration of the whole COMPASS database. The repository's
operational seed history is a separate, currently unqualified replay track.
No workflow failure is suppressed by this implementation.

## Source and reproducibility

- Source: `compass-prod`, project `shduiynzemftkqqefscd`, observed read-only on
  2026-09-22 through Supabase MCP `execute_sql`.
- Snapshot: [`canonical-dependency-contract.json`](canonical-dependency-contract.json).
- Snapshot SHA-256:
  `122441ebf41d77443819364c12252bab3d70aaede3d17c278d66337d7f35b085`.
- Exact catalog SELECT: [`canonical-contract.sql`](../../ops/academy/storage/canonical-contract.sql).
- No application rows, Auth records, storage bytes, passwords, database URLs,
  access tokens or environment values were read or copied to this snapshot.
- Observed PostgreSQL 17.6; vector extension 0.8.0 in `public`. The test requires
  PostgreSQL major 17 and actual vector types/indexes, not text substitutions.
- The observed migration actor was `postgres` (BYPASSRLS, not SUPERUSER).
  Catalog checks confirmed database CREATE, public schema CREATE, TRIGGER on
  `storage.objects`, and INSERT/UPDATE on `storage.buckets`. API roles `anon`
  and `authenticated` were neither SUPERUSER nor BYPASSRLS; `service_role`
  was BYPASSRLS and not SUPERUSER.

Before deployment, rerun the catalog SELECT on the same confirmed project and
compare `comparableContract(result)` with the checked-in contract. Unknown
differences require review and a new snapshot; do not merely update the hash.
Also rerun the existing aggregate `ops/academy/preflight.sql` for data
invariants. A source observation and a synthetic fixture do not prove that
production has remained unchanged since the observation.

## Exact application scope

The fixture creates the following 18 tables from captured definitions:

- `courses`, `course_lessons`, `course_quiz_questions`, `course_quiz_options`,
  `course_enrollments`, `course_quiz_attempts`, `course_ratings`;
- `course_questions`, `course_answers`, `course_survey_responses`;
- `learning_paths`, `learning_path_courses`, `learning_path_enrollments`;
- `profiles`, `loyalty_rules`, `loyalty_transactions`, `notifications`,
  `audit_logs`.

It reproduces **all columns**, nullability/defaults, named constraints and
indexes (including vector/HNSW), table RLS flags, policies, table/column ACLs,
three enums, 16 exact helper/trigger/RPC definitions and their ACLs. This includes
the previously omitted enrollment counter trigger, the profile privilege guard,
the real loyalty trigger, required loyalty-rule fields, and `profiles.role` as
`user_role`. The new migration replaces the loyalty trigger, so testing its
profile/notification dependencies is part of Academy scope.

The `postgres` default privileges from production are installed **before** the
new migrations. This tests the permissions of newly created objects under the
actual inherited defaults; checking only a schema import's ACLs would be
insufficient. Other captured owners' default privileges are inventory only:
the gate explicitly requires the migration actor to be `postgres`.

After constructing the baseline and after the optional synthetic-data seed,
the independent catalog SELECT must produce identical comparable definitions.
Unknown objects or differences in the fixed table/function allowlist fail the
gate. Tests demonstrate failure when a trigger is removed, a required column is
made nullable, a table grant is widened, or a default grant changes.

The separate adversarial default-privilege test deliberately grants broader
rights after this comparison. Its result is labeled `dependencyParity: false`
and cannot be reported as canonical upgrade proof.

## Explicit dependency boundary

- `auth` and `storage` are **not reconstructed from production**. Host-native
  SQL tests use minimal infrastructure. The existing hosted Supabase gate keeps
  real Auth/Storage, signs in synthetic users, imports only the application
  schemas, and exercises the actual Storage API/TUS transport and policies.
- The hosted PostgreSQL job executes the original Academy migration files
  against the canonical application baseline. The native Supabase job verifies
  final application ACL parity after import and executes real API operations;
  these are distinct evidence layers, not an entire application replay.
- Production `auth.users` profile-bootstrap trigger is outside the upgrade
  path: Academy migrations do not create Auth users. Hosted API tests deliberately
  create synthetic profiles after real Auth signup. This does not qualify the
  unrelated application-wide onboarding flow.
- Existing external FKs to `profiles` are inventoried in the snapshot. Academy
  does not delete profiles or change their primary keys, so their HR cascade/
  restriction actions cannot fire. No external table FK points at the 13 LMS
  tables in the observed catalog.
- `block_employment_reversal_after_exit()` and its trigger are reproduced
  exactly. Its `exit_interviews` query is not expanded into an HR schema: the
  trigger is `UPDATE OF employment_status`, and the Academy upgrade writes
  neither that column nor an offboarding reversal. HR state transitions are not
  a claimed acceptance result.
- All six observed database event triggers are platform functions in
  `extensions` (GraphQL, cron/net grants, PostgREST cache). Their definitions are
  recorded, not transplanted into the fixture. The native gate observes the
  actual resulting application ACLs instead of assuming such triggers are inert.
- This is not a generic dependency extractor. Changes introducing a new
  relation, enum, retained helper, trigger path, owner or default-privilege scope
  require an explicit extension of this reviewed boundary.

## Backfill acceptance

The existing `npm run test:academy-db` invokes the bounded synthetic backfill
scenario on both host-native PGlite and hosted PostgreSQL. It executes **all ten
Academy migrations**, then checks:

1. Five historical course states, v1 metadata/rules and publication/draft
   pointers; unchanged enrollment/completion counters and record IDs.
2. Pinned lessons, quizzes, attempts and enrollment progress; preserved completed
   dates/certificate hashes, deterministic fallback hash, legacy completion and
   incomplete reward-attribution state.
3. Deduplicated claims from completed/awarded flags and both ledger categories;
   no retroactive ledger writes or first-publication bonus after a later v2.
4. Independent review holds for old publications, preserved enrolled access,
   blocked new enrollment before review and allowed enrollment afterward;
   archived courses remain archived.
5. Q&A version/enrollment mapping, preserved answer/survey content and timestamps,
   ordered required-course path snapshots and normalized streak values. Existing
   Q&A `updated_at` triggers may touch question modification timestamps during
   metadata backfill; original creation timestamps and content are preserved.
6. Closed rollout, no automatic trainer grant, review tokens and revoked old
   review signatures; historical revocation remains manual reward review and
   never guesses which old ledger transactions to reverse.
7. The real profile guard pins privilege fields, allows the unrelated progress
   update, and writes its audit record. Existing domain tests cover current
   rewards, profile tier updates, notifications and concurrency.

Reports name the engine and include snapshot hash, 18-table/16-function/3-enum
parity and an assertion count. A PGlite pass is not a hosted PostgreSQL pass;
neither is a production migration or authenticated production UI acceptance.

## Release boundary

The historical replay remains unchanged and blocking until the replacement
upgrade evidence is actually green and separately reviewed. After that decision,
it may be retained as an explicitly nonqualifying legacy-history audit. Do not
label this result `fullHistoricalReplay: passed`, disaster recovery, full backup
verification or production deployment verification.
