# CLAUDE.md — Compass

> Per-app deviations od globalnego standardu w `~/.claude/rules/deployment.md`.
> Plik ładowany automatycznie przy każdej sesji Claude'a w tym repo.

## Stack & ports

- **Frontend:** Next.js 14.2.35 (App Router, React 18, standalone output) — w katalogu `COMPASS/`.
- **Database:** Supabase (external Postgres, Auth, Storage).
- **Integracje:** Anthropic SDK, OpenAI, Resend (email).
- **Test:** Vitest 4 (unit) + Playwright 1.58 (e2e).
- **Package manager:** npm (Node 20).
- **Port:** 10000 (Next.js standalone, env `APP_PORT` w compose).

**Monorepo-ish:** root repo zawiera tylko `docker-compose.yml` + `.github/`; aplikacja Next.js w podkatalogu `COMPASS/`.

## Deploy

- **Hosting:** Coolify v4 on Hetzner CAX21 ARM (compass-prod, 178.104.220.48).
- **Coolify panel:** `https://coolify-compass.dynaminds.pl` (HTTPS+LE, public via Traefik route — od 2026-05-04).
- **App UUID (Coolify):** `w136dv828ofipvjfnxrqi643`.
- **Resource:** Docker Compose Application, Private Repository (with Deploy Key), branch `main`, compose `docker-compose.yml` (z `build:` block).
- **Deploy key:** w GitHub repo Settings → Deploy keys jako "Coolify on compass-prod" (read-only).
- **Auto-deploy:** ✅ **TAK** — `git push origin main` → `.github/workflows/deploy.yml` (unified template) → Coolify webhook → build + restart → smoke test.
- **Trigger:** push `main` → `.github/workflows/deploy.yml` (PR #3 merged 2026-05-04).
- **Concurrency:** `group: deploy-${{ github.ref }}, cancel-in-progress: false`.
- **Migracja 2026-05-01 → 04:** z Caddy + manual SSH → Coolify-managed → unified Coolify webhook (commits `4851e63`, `e9c3f55`, `1dee42a`, PR #3).
- **Coolify admin password:** w password manager (był w `/tmp/coolify-admin-password.txt` na mac).
- **Rollback:** Coolify panel `https://coolify-compass.dynaminds.pl` → Resources → compass → Deployments → poprzedni → Redeploy.
- **Standardy + procedury:** patrz `~/.claude/rules/deployment.md` + `~/.claude/rules/deployment-runbook.md`.

## Healthcheck endpoint

- **URL:** `/api/health` (route w `COMPASS/app/api/health/route.ts`).
- **Shape:** `{status, version, deployedAt, checks: {supabase}}` (Faza 1.A done — commit `48fa896`).
- **Logic:** Supabase HEAD `/rest/v1/?apikey=...` → 4xx = healthy (alive), 5xx/timeout = unhealthy.
- **Compose healthcheck:** `wget --spider http://127.0.0.1:10000/api/health` co 30s, retries 3, start_period 40s.
- **Smoke test w GHA:** `deploy-hetzner.yml` smoke-test job, 5×15s curl `$NEXT_PUBLIC_APP_URL/api/health`, expect status `healthy`/`degraded`.
- **TODO Faza 1.B:** GIT_SHA + BUILT_AT build args (obecnie `version=unknown`, `deployedAt=unknown`).

## Env vars (build-time vs runtime)

**Build args (osadzone w bundle, dostarczone z GHA secrets):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `GIT_SHA`, `BUILT_AT` (po Fazie 1)

**Runtime env (Coolify env vault):**
- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side, never client)
- `CRON_SECRET` (cron auth)
- `SUPER_ADMIN_EMAILS` (CSV emails dla admin role)
- `NEXT_PUBLIC_SITE_URL` (default = `NEXT_PUBLIC_APP_URL`)

## CI gotchas

- **Test command:** `npm run test:unit` (Vitest) w CI; `npm test` lokalnie odpala Vitest **i** Playwright (wolne, nie do CI default).
- **E2E w osobnym workflow:** `e2e-tests.yml` (nie `build-check.yml`).
- **Concurrency lock:** deployy z `main` sekwencyjne (nie cancel-in-progress).
- **Build context:** `./COMPASS` (nie root). Dockerfile w `COMPASS/Dockerfile`.
- **Lint:** `next lint` (eslint-config-next 14.2.35).
- **Typecheck:** `tsc --noEmit` (TS 5, w `COMPASS/tsconfig.json`).

**Faza 2 (DONE 2026-04-29):** gitleaks + ESLint + Vitest + Playwright w `build-check.yml`.

## Manual ops cheat sheet

```bash
cd /Users/arturtwardowski/Compass

# Quick check
npm --prefix COMPASS run lint
npm --prefix COMPASS run test:unit

# Local build + run
cd COMPASS && npm run build && PORT=10000 npm start

# Docker local (cały compose)
cd /Users/arturtwardowski/Compass
docker compose up --build

# Deploy via main push
git push origin main
gh run watch  # follow GHA

# Smoke prod
SHORT_SHA=$(git rev-parse --short=7 HEAD)
curl -fsSL https://<compass-url>/api/health | jq .
curl -fsSL https://<compass-url>/api/health | jq -e ".version == \"$SHORT_SHA\""

# Rollback (Coolify dashboard)
# → ustaw env IMAGE_TAG=<poprzedni_sha> → Redeploy

# Rollback (git)
git revert HEAD && git push origin main
```

## Specyfika tej apki

- **Akademia (recent work):** sprawdź `app/akademia/`, `lib/types/akademia.ts`. Faza 5 (AI rekomendacje) szła w niedawnych commitach (5889f1f, 65faef1).
- **Multi-stage Dockerfile** z `pdf-lib` i `pdf2json` — zaufaj cache, ale `npm ci` jest cięższy niż w pozostałych apkach.
- **Monorepo gotcha:** wszystkie `npm` komendy odpalaj z `COMPASS/` lub z `--prefix COMPASS`.

## Coolify cron jobs (Phase 17 — Smart Work Clock)

Po merge PR #54 trzeba dodać 2 nowe cron joby w panelu Coolify (`https://coolify-compass.dynaminds.pl` → Resources → compass → Schedules):

| Nazwa | Schedule (cron) | Komenda |
|---|---|---|
| `clock-daily-cutoff` | `0 4 * * *` (codziennie 04:00 UTC = 05:00/06:00 PL) | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://compass.dynaminds.pl/api/cron/clock-daily-cutoff"` |
| `clock-idle-reaper` | `*/15 * * * *` (co 15 min) | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://compass.dynaminds.pl/api/cron/clock-idle-reaper"` |

> **Auth:** preferowany Bearer header (secret nie loguje się w CF/proxy/Sentry). Legacy `?secret=` nadal działa z warningiem.
> **Stan 2026-05-08:** crony skonfigurowane w Coolify. Migration `phase17_work_clock` zaaplikowana. Floating button live dla `internal`/`admin`.

**Co robią:**
- `clock-daily-cutoff`: zamyka sesje pracy (`work_clock_sessions` z `ended_at IS NULL`) starsze niż 16h. Reason: `daily_cutoff`.
- `clock-idle-reaper`: zamyka sesje gdzie `last_heartbeat < NOW() - 60 min` (network drop, laptop sleep bez sendBeacon). Reason: `idle_timeout`.

**Auth:** `CRON_SECRET` env var (już istnieje w Coolify dla `timesheet-reminder`).

**Verify po skonfigurowaniu:**
```bash
curl -fsS "https://compass.dynaminds.pl/api/cron/clock-daily-cutoff?secret=$CRON_SECRET" | jq
# expect: { ok: true, scanned: N, closed: N, emailed: N }
```

## Observability

Zobacz `~/.claude/rules/observability.md` dla pełnego standardu (Sentry + Grafana Cloud + Cloudflare). Per-Compass odstępstwa:

- **JSON logger utility** — `COMPASS/lib/logger.ts` (zero-dep) używany zamiast `console.error`. ~50 lokalizacji zmigrowanych w PR #32. Pozostałe ~100 w `lib/actions/` i `components/` migrowane stopniowo gdy pliki są edytowane (hook PostToolUse blokuje nowe `console.*`).
- **Sentry projekt:** `compass` (Next.js 14, App Router + middleware Edge runtime). SDK: `@sentry/nextjs ^8` (^9 wymagałoby Next 15).
- **Source maps:** `withSentryConfig` z `hideSourceMaps: true` + upload przez `SENTRY_AUTH_TOKEN` (build-time only, nigdy w runtime image).
- **GIT_SHA propagation:** `deploy.yml` PATCH-uje Coolify env vault na każdym pushu (nie magic var Coolify). `BUILT_AT = $(date -u +%Y-%m-%dT%H:%M:%SZ)` per deploy. `/api/health` zwraca prawdziwy short SHA, smoke test prefix-match przechodzi bez retry.
- **Replay privacy:** `maskAllText: true, blockAllMedia: true` — Compass trzyma dane HR (RODO).
- **Compose `logging:`** — `json-file 10MB×5 + tag` per service (już ma).
- **Alloy sidecar:** profile-gated (`profiles: [observability]`). Bez `COMPOSE_PROFILES=observability` w Coolify nie startuje. Po dodaniu Grafana creds + profilu → logi w Loki (`{app="compass"}`).
