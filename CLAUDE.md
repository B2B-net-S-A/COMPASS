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

- **Hosting:** Coolify on Hetzner.
- **Registry:** GHCR (`ghcr.io/artur-t-96/compass`).
- **Trigger:** push `main` → `.github/workflows/deploy-hetzner.yml`.
- **Dual deploy method (świadome):** workflow respektuje `vars.DEPLOY_METHOD`:
  - `coolify` (default) → POST do `secrets.COOLIFY_WEBHOOK_URL` z `Authorization: Bearer COOLIFY_TOKEN`.
  - `ssh` → fallback przez `appleboy/ssh-action` na `secrets.HETZNER_HOST`, `git pull && docker compose up -d --build`.
- **Concurrency:** `group: deploy-hetzner, cancel-in-progress: false`.
- **Render fallback:** w `package.json` jest `npm run deploy` → `scripts/render-deploy.sh`. Historyczny — używać tylko jeśli Coolify+SSH oba padną.

## Healthcheck endpoint

- **URL:** `/api/health` (route w `APK-COMPASS/app/api/health/route.ts`).
- **Compose healthcheck:** `wget --spider http://127.0.0.1:10000/api/health` co 30s, retries 3, start_period 40s.
- **Smoke test w GHA:** `deploy-hetzner.yml` linia 87-108, 5×10s curl `$NEXT_PUBLIC_APP_URL/api/health`.

> **Faza 1 (TODO):** shape `{status, version, deployedAt, checks.supabase}` zamiast obecnego `{status: 'ok', timestamp, uptime}`. Smoke-test grep `"status":"ok"` → `jq .status != "unhealthy"`.

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
