# COMPASS release gate

This runbook covers the repository-side release foundation. It does not authorize a production deployment by itself.

## What the gate guarantees

- `quality-gate` is the single branch-protection check aggregating the existing secret scan, application checks, security scan, standards drift job, and an immutable Docker build.
- Docker CI renders the real App Router `/login` page and verifies that an anonymous request to `/internal` redirects to `/login`; `/api/livez` alone is not accepted as framework-migration evidence.
- Coolify receives a full 40-character `git_commit_sha`, which is read back before deployment.
- `GIT_SHA`, `BUILT_AT`, and `DEPLOYED_AT` are bulk-written as build-time and runtime variables before the exact `git_commit_sha` mutation and source build. Root Compose derives the build `GIT_SHA` and immutable image tag from Coolify's native `SOURCE_COMMIT`, which is determined by the patched `git_commit_sha`; this avoids stale environment metadata overriding the checked-out source. The Dockerfile validates the value as a full 40-character commit SHA.
- The concrete Coolify deployment UUID is polled; a completed deployment with another commit fails.
- Readiness must pass three times in a row, 20 seconds apart, with the exact SHA, exact build timestamp, and `checks.database.status=healthy`.
- The release is monitored for five more minutes. Two consecutive critical failures fail the workflow.
- Before any mutation, the previous production SHA must be an ancestor of the candidate and must be at or above `ROLLBACK_FLOOR_SHA`.
- A failed deployment/readiness/monitoring path uses compare-before-write semantics to redeploy the previous allowed SHA, then requires three green rollback-readiness checks.
- Successful and rolled-back runs archive `release-manifest.json` for 90 days; the workflow itself remains red after an automatic rollback.

The workflow uses two team-scoped Coolify tokens so no mutation credential needs read access:

- `COOLIFY_TOKEN`: `write + deploy` only.
- `COOLIFY_READ_TOKEN`: `read` only, used to verify application and deployment state.

## Activation checklist

1. Upgrade the COMPASS Coolify instance to `>= 4.1.2`.
2. Disable Coolify Git auto-deploy/webhook for COMPASS. Otherwise a push can deploy before CI finishes.
3. Configure strict branch protection on `main`; require only the final `quality-gate` check and include administrators.
4. Create the GitHub Environment `production`, configure required reviewers, and move all production secrets into it.
5. Add the two Coolify tokens and `COOLIFY_APP_UUID` as environment secrets. Add separate `STAGING_COOLIFY_URL`, `PRODUCTION_COOLIFY_URL`, and `APP_URL` variables. Keep `SENTRY_AUTH_TOKEN` only in the Coolify build vault; Compose passes it as a BuildKit secret rather than an image argument or environment layer.
6. Set `ROLLBACK_FLOOR_SHA` only after the migration reconciliation identifies the oldest safe release. The release script refuses to mutate Coolify when the floor or current full SHA is missing.
7. The tracked lock, local release tooling, and tokenless validation actions are pinned to engineering standard `2026.07.3` at `fa4bb1123a3ea1b444e8bd4d36fb180567960a13`; upgrades require review and lock regeneration. No central-repository PAT is used.
8. Security scans are blocking. The 2026-07-13 upgrade to Next.js 15.5.20 removed the previous 1 HIGH dependency finding and all 5 HIGH final-image findings: `npm audit --audit-level=high` and Trivy HIGH/CRITICAL now pass without ignores or exceptions. Any future temporary exception still requires a fail-closed audit filter plus a reviewed owner and expiry of at most 30 days.
9. The Next.js 15 App Router requires React 19. Before release, confirm the lockfile and final image contain Next 15.5.20, React/React DOM 19.2.7 and React type packages 19.2.x; a manifest-only bump is insufficient.
10. Connect the staging environment, production snapshot, and expand-only migration job before this production workflow. The generated reusable release workflow already treats staging and production as separate Coolify hosts; wire a COMPASS caller with both URLs before activation. The production-only foundation remains disabled until that caller exists. Automatic rollback uses only the exact previous SHA observed before mutation and refuses a target outside the approved ancestry window.
11. On staging, run the existing authenticated Playwright flow in addition to the anonymous Docker smoke, then perform an exact-SHA rollback drill and archive the evidence.
12. Only after steps 1–11, set the repository variable `COMPASS_RELEASE_GATE_ENABLED=true`.

Until the final variable is set, automatic and manual production jobs remain skipped.

## Health contract

- `GET /api/livez` checks only the process and returns exactly `status=alive` plus the full `version`. Docker uses this endpoint, so a database outage does not create a restart loop.
- `GET /api/health` is readiness. It performs an authenticated, read-only query against a known table, reports object-shaped dependency checks, and returns HTTP 503 if the database or release metadata is invalid.
- Both endpoints send `Cache-Control: no-store` and never include raw database errors.
- `checks.supabase` is a one-release compatibility alias for `checks.database`; consumers must migrate to `checks.database` before the alias is removed.

## Local verification

From the repository root:

```bash
cd COMPASS
npm ci
npm run lint
npx tsc --noEmit
npm run test:unit
npm run test:release
```

The release script is covered with a mocked Coolify API. Do not point it at production for a dry run.
