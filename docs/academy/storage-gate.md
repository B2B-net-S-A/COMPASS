# Hosted Supabase Storage gate

`.github/workflows/academy-storage.yml` runs two independent jobs on disposable GitHub-hosted Linux runners. It uses Supabase CLI **2.117.0**, with the official release archive SHA-256 verified before execution. Neither job uses repository/production secrets, a linked project or paid infrastructure. The scripts reject local and self-hosted execution before any Docker operation.

## Evidence boundaries

`academy-fixture` starts real PostgreSQL, Auth, PostgREST and Storage. It builds the existing Academy fixture in a separate temporary database and exports only application schema (`public`, `academy_private`), allowlisted Academy Storage policies/trigger and the private bucket. Native `auth` / `storage` tables, functions, grants and object contents are not copied or replaced. Synthetic users are created through Auth Admin and sign in with passwords; training operations use their normal authenticated tokens. Direct database setup writes only profiles, fixture settings/rules and a synthetic elapsed lesson-unlock time. The fixture profiles and legacy application schema are intentionally incomplete.

The integration imports the production `uploadAcademyFile` transport and exercises:

- interruption after a real 6 MiB chunk, saved upload URL, HEAD offset and resumed PATCH without another POST;
- successful bytes with a lost browser finalization, recovering the same reservation;
- denial before scan, learner denial of upload signatures, mismatch of actual size/MIME and final PATCH with a token minted before trainer permission revocation;
- actual stored-byte SHA-256 and trusted scan acceptance; download and signed-download checks using learner tokens;
- lesson enrollment/drip restrictions, different editions of the same course, independent moderation and cancelled registration.

The trusted scanner verdict is simulated in this job. The real ClamAV workflow separately tests antivirus behavior. This is not a browser/Next.js route test or production acceptance proof. Previously issued signed download URLs remain valid until expiry; access withdrawal tests request new URLs and authenticated downloads.

`historical-replay` copies **all currently checked-in migration files** to a clean, separate Supabase workdir. It has a 15-minute startup/replay bound. The report records the file count, applied/skipped count, last migration and first PostgreSQL SQLSTATE/diagnostic (literal values redacted). Any migration failure, skipped file or incomplete replay fails the job; there is no `continue-on-error`. Green fixture tests cannot turn this job green. Registry reconciliation remains necessary if the historical replay fails.

Both jobs use the same pinned CLI and native service images it specifies. Keys and raw startup/status output stay in private temporary files, are never artifacts, and are deleted after stopping the disposable stack. Reports contain only counters, named checks and sanitized failure metadata.

Local checks are limited to `node --test ops/academy/storage/gate.test.mjs`, syntax and shell validation. The native Auth/Storage/TUS and complete-history results are **unverified until hosted CI executes them**.

Sources checked for this gate: [resumable and signed uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), [CLI configuration](https://supabase.com/docs/guides/local-development/cli/config), [CLI 2.117.0 release](https://github.com/supabase/cli/releases/tag/v2.117.0), [changelog](https://supabase.com/changelog). CLI command flags were checked with that installed version's `--help`.
