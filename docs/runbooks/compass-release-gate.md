# COMPASS release gate

This runbook covers the repository-side release foundation. It does not authorize a production deployment by itself.

## What the gate guarantees

- `quality-gate` is the single branch-protection check aggregating the existing secret scan, application checks, security scan, standards drift job, and an immutable Docker build.
- Coolify receives a full 40-character `git_commit_sha`, which is read back before deployment.
- `GIT_SHA` and `BUILT_AT` are written as build-time and runtime variables before the source build starts.
- The concrete Coolify deployment UUID is polled; a completed deployment with another commit fails.
- Readiness must pass three times in a row, 20 seconds apart, with the exact SHA, exact build timestamp, and `checks.database=healthy`.
- The release is monitored for five more minutes. Two consecutive critical failures fail the workflow.
- A successful run archives `release-manifest.json` for 90 days.

The workflow uses two team-scoped Coolify tokens so no mutation credential needs read access:

- `COOLIFY_TOKEN`: `write + deploy` only.
- `COOLIFY_READ_TOKEN`: `read` only, used to verify application and deployment state.

## Activation checklist

1. Upgrade the COMPASS Coolify instance to `>= 4.1.2`.
2. Disable Coolify Git auto-deploy/webhook for COMPASS. Otherwise a push can deploy before CI finishes.
3. Configure strict branch protection on `main`; require only the final `quality-gate` check and include administrators.
4. Create the GitHub Environment `production`, configure required reviewers, and move all production secrets into it.
5. Add the two Coolify tokens, `COOLIFY_URL`, `COOLIFY_APP_UUID`, and the `APP_URL` variable.
6. Set `ROLLBACK_FLOOR_SHA` only after the migration reconciliation identifies the oldest safe release.
7. Provision `artur-t-96/engineering-standards`, pin its full SHA in `.github/standards/manifest.json`, switch the manifest from `scaffold` to `enforced`, and add `ENGINEERING_STANDARDS_READ_TOKEN`.
8. Resolve or formally time-box all HIGH findings before changing the existing security scans from report-only to blocking. On 2026-07-13 `npm audit --omit=dev` reported 6 HIGH production findings (including Next.js 14.2.35, Sentry/Rollup, Undici, `tmp`, and `ws`); the complete install reported 10 HIGH findings.
9. Connect the staging environment, migration job, and an approved automatic rollback target. The current script fails closed on monitoring errors but deliberately does not guess a rollback SHA.
10. Run the exact-SHA flow against staging, perform a rollback drill, and archive the evidence.
11. Only after steps 1–10, set the repository variable `COMPASS_RELEASE_GATE_ENABLED=true`.

Until the final variable is set, automatic and manual production jobs remain skipped.

## Health contract

- `GET /api/livez` checks only the process and returns the full `version` plus `deployedAt`. Docker uses this endpoint, so a database outage does not create a restart loop.
- `GET /api/health` is readiness. It performs an authenticated, read-only query against a known table and returns HTTP 503 if the database or release metadata is invalid.
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
