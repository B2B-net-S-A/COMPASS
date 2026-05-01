# CLAUDE.md — Compass

> Per-app deviations od globalnego standardu w `~/.claude/rules/deployment.md`.
> Plik ładowany automatycznie przy każdej sesji Claude'a w tym repo.

## Stack & ports

- **Frontend:** Next.js 14.2.35 (App Router, React 18, standalone output) — w katalogu `APK-COMPASS/`.
- **Database:** Supabase (external Postgres, Auth, Storage).
- **Integracje:** Anthropic SDK, OpenAI, Resend (email).
- **Test:** Vitest 4 (unit) + Playwright 1.58 (e2e).
- **Package manager:** npm (Node 20).
- **Port:** 10000 (Next.js standalone, env `APP_PORT` w compose).

**Monorepo-ish:** root repo zawiera tylko `docker-compose.yml` + `.github/`; aplikacja Next.js w podkatalogu `APK-COMPASS/`.

## Deploy

- **Hosting:** Coolify v4 on Hetzner CAX21 ARM (compass-prod, 178.104.220.48).
- **Coolify panel:** `http://178.104.220.48:8000` (port nie public — dostęp tylko przez SSH tunnel: `ssh -L 8000:127.0.0.1:8000 root@178.104.220.48`).
- **Resource:** Docker Compose Application, Private Repository (with Deploy Key), branch `main`, compose `docker-compose.yml`.
- **Deploy key:** w GitHub repo Settings → Deploy keys jako "Coolify on compass-prod" (read-only).
- **Auto-deploy:** **NIE** (port 8000 nie public → webhook GitHub.com nie dotrze). Po push do main: ręczny "Deploy" w Coolify panel. TODO: dodać `coolify.dynaminds.pl` sub-domenę (Traefik route) → webhook auto-trigger.
- **Trigger:** push `main` → `.github/workflows/deploy-hetzner.yml` (build-and-push do GHCR jako redundant backup + smoke-test).
- **Concurrency:** `group: deploy-hetzner, cancel-in-progress: false`.
- **Migracja 2026-05-01:** z Caddy + manual SSH deploy → Coolify-managed (commit `4851e63`). Caddy `systemctl disable caddy`. Stary app dir: `/home/deploy/app.pre-coolify-2026-05-01` (zachowany do 2026-05-15).
- **Coolify admin password:** zapisz w password manager (mac `/tmp/coolify-admin-password.txt` po setupie sesji).

## Healthcheck endpoint

- **URL:** `/api/health` (route w `APK-COMPASS/app/api/health/route.ts`).
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
- **Build context:** `./APK-COMPASS` (nie root). Dockerfile w `APK-COMPASS/Dockerfile`.
- **Lint:** `next lint` (eslint-config-next 14.2.35).
- **Typecheck:** `tsc --noEmit` (TS 5, w `APK-COMPASS/tsconfig.json`).

> **Faza 2 (TODO):** dodać gitleaks job i `test:unit` do `build-check.yml`.

## Manual ops cheat sheet

```bash
cd /Users/arturtwardowski/Compass

# Quick check
npm --prefix APK-COMPASS run lint
npm --prefix APK-COMPASS run test:unit

# Local build + run
cd APK-COMPASS && npm run build && PORT=10000 npm start

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
- **Monorepo gotcha:** wszystkie `npm` komendy odpalaj z `APK-COMPASS/` lub z `--prefix APK-COMPASS`.
