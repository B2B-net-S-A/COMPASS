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

## Phase 19 — Faktury + rola Finanse (2026-05-14)

Pełen workflow rozliczeń pracowników biurowych:

1. **Pracownik biurowy (`internal`)** wpisuje godziny do timesheet → wysyła do akceptacji.
2. **Admin** akceptuje/odrzuca timesheet z komentarzem (bez zmian, jak Phase 11–17).
3. Po `approved` timesheet → user może wystawić **fakturę** (PDF, max 10 MB) za ten sam okres (`period_year` + `period_month`).
4. **Finanse (nowa rola)** akceptuje/odrzuca fakturę z komentarzem. Może też podejrzeć timesheet pracownika (godziny + opisy per-day) podczas review — żeby porównać kwotę z godzinami.
5. Po reject pracownik widzi czerwony banner z powodem, klika "Popraw i wyślij ponownie", edytuje dane i/lub plik, wysyła ponownie.

**Kluczowe artefakty:**
- 4 role w enum `user_role`: `consultant`, `admin`, `internal`, **`finanse`** (Phase 19a `ALTER TYPE ADD VALUE`).
- Tabela `invoices` z `file_path` + `file_hash` (SHA-256 obliczany przy approve, audit-grade).
- Trigger DB: invoice INSERT/UPDATE wymaga `approved` timesheet (twarda blokada).
- Trigger DB: `unlockTimesheet` zablokowany jeśli istnieją aktywne (submitted/approved) faktury.
- Storage bucket `invoices` (private) z folder-scoped RLS: `invoices/{user_id}/{ts}_{file}.pdf`.
- Helper SQL: `is_finanse_or_admin()` używany w RLS faktur.
- `sync_user_role()` RPC zaktualizowany (Phase 19c) żeby NIE downgrade'ował finanse → consultant przy każdym loginie.

**Routes/UI:**
- Pracownik: `/internal?tab=invoices` — lista swoich faktur, button "Wyślij fakturę".
- Finanse + admin: `/internal/admin?tab=invoices` — kolejka do akceptacji + filtry (oczekujące/zaakceptowane/odrzucone).
- Finanse landing: middleware redirectuje z `/home` na `/internal/admin?tab=invoices`.

**Ops po deploy:**
1. Aplikować 3 migracje przez `supabase db push` (Phase 19a → 19b → 19c).
2. Nadać 1 osobie rolę `finanse` przez InviteUserDialog (`/internal/admin?tab=employees`) lub SQL `UPDATE profiles SET role='finanse' WHERE email='ksiegowa@b2bnetwork.pl'`.

**Audit log actions:** `INVOICE_SUBMITTED`, `INVOICE_APPROVED`, `INVOICE_REJECTED`, `INVOICE_RESUBMITTED`.

## Phase 20 — System 6 ról + Manager + TCM (2026-05-16)

Rozszerzenie systemu ról z 4 do 6:

| enum value | UI label | Landing | Główne uprawnienia |
|---|---|---|---|
| `admin` | Super Admin | `/home` | Wszystko + własny HR (timesheet/faktura) |
| `consultant` | Konsultant IT | `/home` | Platform features (home/learning/league/incubator/news/support), **BEZ** /internal |
| `internal` | Konsultant wewnętrzny | `/internal` | HR Hub + wspólne sekcje |
| `finanse` | Finanse | `/internal` | HR Hub + akceptacja faktur **etap 2** + wspólne sekcje |
| **`manager`** (NEW) | Manager | `/internal` | HR Hub + HR **zespołu** (gdzie `profiles.manager_id = ja`) + akceptacja timesheetów zespołu + akceptacja faktur **etap 1** |
| **`talent_community`** (NEW) | Talent Community Manager | `/internal` | HR Hub + `/admin/inbox` + `/admin/compliance` + news composer (`/admin/news`) + wspólne sekcje |

**Wspólne sekcje dla WSZYSTKICH** (oprócz Konsultanta IT): Inkubator (`/incubator`), Aktualności (`/news`), Support Center (`/support`), strefa wewnętrzna (`/internal`).

### Schema (Phase 20a-d)

- **20260516000001_phase20a_role_enum_extend.sql** — `ALTER TYPE user_role ADD VALUE manager/talent_community`
- **20260516000002_phase20b_manager_id_and_helpers.sql** — `profiles.manager_id UUID REFERENCES profiles(id)` + helpers (`is_manager_of`, `is_manager`, `is_talent_community`, `has_hr_zone_access`) + RLS updates (timesheets/invoices manager team scope)
- **20260516000003_phase20c_invoice_2stage.sql** — invoices status enum extended: `submitted → manager_approved → approved` (+ `rejected`) + columns `manager_reviewed_by/at/note`, `rejected_by_stage` + trigger `enforce_invoice_stage_transitions`
- **20260516000004_phase20d_sync_user_role_v3.sql** — `sync_user_role()` preserve `manager` + `talent_community` na login

### Workflow faktur 2-etap

```
draft → submitted (pracownik)
   ↓
   ├── ma managera? → tak: manager_approved (Manager merit) → approved (Finanse final)
   │                  nie: approved (Finanse skip stage 1)
   ├── manager reject → rejected (rejected_by_stage='manager') → draft
   └── finanse reject → rejected (rejected_by_stage='finanse') → draft
```

DB trigger blokuje invalid transitions (np. `submitted → approved` gdy user ma managera).

### Ops po deploy

1. Aplikować 4 migracje przez `supabase db push` lub `mcp.apply_migration`.
2. Nadać role nowym pracownikom przez `InviteUserDialog` (`/internal/admin?tab=employees`) lub SQL:
   ```sql
   -- Ustaw managera dla pracownika:
   UPDATE profiles SET role='internal', manager_id='<manager_uuid>' WHERE email='pracownik@b2bnetwork.pl';
   -- Nadaj rolę Manager:
   UPDATE profiles SET role='manager' WHERE email='lider@b2bnetwork.pl';
   -- Nadaj rolę TCM:
   UPDATE profiles SET role='talent_community' WHERE email='tcm@b2bnetwork.pl';
   ```
3. Stres test: nadać po 1 osobie każdej z nowych ról, sprawdzić middleware + sidebar + invoice workflow.

### Audit log

Nowe akcje: `INVOICE_MANAGER_APPROVED`, `INVOICE_MANAGER_REJECTED`, `MANAGER_ASSIGNED`.

## Phase 22 — Onboarding & Exit Interview (TCM module, 2026-05-17)

Pełny lifecycle pracownika prowadzony przez Talent Community Managera (rola dodana w Phase 20):

**Profile lifecycle:** `employment_status` enum w `profiles` — `pending` → `onboarding` → `active` → `offboarding` → `exited`. Plus `hired_at`, `termination_date`, `buddy_id`.

**Onboarding workflow:**
1. Admin invites user via `InviteUserDialog` z checkboxem "Automatycznie uruchom onboarding" (default ON dla consultant/internal/manager — role z domyślnym szablonem).
2. `inviteUser()` w `user-admin.ts` woła `start_onboarding_for_user()` RPC → kopiuje template_items → tasks z `due_date = hired_at + due_offset_days`, ustawia `employment_status='onboarding'`, wysyła welcome email.
3. Pracownik wypełnia checklist (employee tasks), manager swoje (manager tasks), buddy/TCM/admin pozostałe.
4. Check-iny dzień 1/7/30 — mini-ankieta 1-5 + komentarz, wysyłana via cron `lifecycle-checkins`.
5. TCM/admin zamyka onboarding gdy wszystkie required tasks done → `employment_status='active'`.

**Exit Interview workflow:**
1. TCM/admin schedules exit (`scheduleExitInterview(userId, terminationDate)`).
2. `start_offboarding_for_user()` ustawia `employment_status='offboarding'`, tworzy `exit_interviews` (status=scheduled) + 5 default offboarding tasks (access_revoke, equipment_return, knowledge_transfer, final_settlement, docs_archive), wysyła zaproszenie pracownikowi + checklist managerowi.
3. Pracownik wypełnia ankietę: powód (8 enum), NPS 0-10, 4 skale satysfakcji 1-5, swobodna wypowiedź, knowledge transfer. Checkbox "Wyślij anonimowo" → trigger DB zeruje `user_id` ale zachowuje snapshot fields (role, manager, tenure_months).
4. TCM widzi w kolejce `/internal/lifecycle/exit`, robi review + dodaje notatkę → status=reviewed.
5. Po wszystkich required offboarding tasks → admin/TCM klika "Mark as exited" → `employment_status='exited'`.

**Hub:** `/internal/lifecycle` (osobny route w sidebarze "Lifecycle"):
- TCM/admin: dashboard (4 KPI + queue + analytics)
- Manager: queue zespołu (read-only przez RLS team scope)
- Pracownik z aktywnym onboardingiem: redirect do `/onboarding/[progressId]`
- Pracownik w offboarding: redirect do `/exit/wypelnij`

**Migracje:** `20260517000001..._phase22a..e.sql` (5 plików w `COMPASS/supabase/migrations/`).

**Storage:** bucket `lifecycle-docs` (private) z folder-scoped RLS — `onboarding/{user_id}/` i `exit/{user_id}/`.

**Helpery RLS:** `has_lifecycle_access()` (admin+TCM), `is_buddy_of(user)`. Templates SELECT dla HR-zone; WRITE TCM/admin only. Onboarding tasks: owner edytuje swoje (responsible='employee'), manager swoje (responsible='manager'), buddy swoje, TCM/admin wszystkie. Exit interviews z `is_anonymous=TRUE` po submit mają user_id=NULL — manager_of widzi tylko nie-anonimowe.

**Coolify cron jobs (do dodania po deploy):**

| Nazwa | Schedule | Komenda |
|---|---|---|
| `lifecycle-checkins` | `0 9 * * *` (9:00 UTC daily) | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://compass.dynaminds.pl/api/cron/lifecycle-checkins"` |
| `lifecycle-reminders` | `0 10 * * *` (10:00 UTC daily) | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://compass.dynaminds.pl/api/cron/lifecycle-reminders"` |

`lifecycle-checkins` skanuje progress z hired_at = T-1/T-7/T-30 i wysyła mini-ankietę email jeśli `checkin_dayN_at IS NULL`.
`lifecycle-reminders` wysyła managerom przypomnienia o overdue manager/buddy tasks + pracownikom o exit interview 3 dni przed termination_date.

**Audit log akcje:** `ONBOARDING_STARTED/TASK_COMPLETED/TASK_ADDED/CHECKIN_SUBMITTED/COMPLETED/CANCELLED/RESTARTED`, `TEMPLATE_CREATED/UPDATED/DELETED/DEFAULT_CHANGED/DUPLICATED`, `BUDDY_ASSIGNED/UNASSIGNED`, `OFFBOARDING_STARTED`, `EXIT_INTERVIEW_SCHEDULED/SUBMITTED/REVIEWED/ANONYMIZED/CANCELLED`, `OFFBOARDING_TASK_COMPLETED`, `EMPLOYEE_EXITED`, `LIFECYCLE_PROFILE_UPDATED`, `EXTERNAL_EMPLOYEE_CREATED`, `LIFECYCLE_NOTE_ADDED/DELETED`.

### Phase 22.1 — Template editor UI (PR #114, 2026-05-16)

TCM/admin może teraz w UI tworzyć/edytować szablony bez SQL:
- `/internal/lifecycle/templates/new` — wizard nowego szablonu (NewTemplateForm)
- `/internal/lifecycle/templates/[id]` — inline edit metadata, add/edit/delete items, reorder przez strzałki up/down, soft/hard delete template
- Server actions: `addTemplateItem`, `updateTemplateItem`, `deleteTemplateItem`, `reorderTemplateItems`

### Phase 22.2 — Interactive dialogs (PR #115, 2026-05-16)

Klikalne narzędzia codziennego użytku TCM/admin — bez SQL:
- **"Nowy onboarding"** (hub button) → `StartOnboardingDialog`: search pracowników → wybierz template + hired_at override → auto-start
- **"Zaplanuj exit interview"** (hub button) → `ScheduleExitDialog`: search → termination_date + scheduled_for → trigger offboarding + emaile
- **BuddyCard / BuddyAssignmentDialog** na onboarding detail — klikalna karta Buddy, search + przypisz/odpisz
- Server actions: `listEmployeesForLifecycle(filter)`, `listBuddyCandidates(forUserId)`, `listTemplateChoices()`, `startOnboardingWithOptions({userId, templateId?, hiredAt?})`

### Phase 22.3 — All employees view + archive + cancel/restart + external (PR #117 + 22.4, 2026-05-16..18)

Pełen TCM toolkit (13 features):

**Migracja 22f:**
- `profiles.is_external BOOLEAN` + `external_notes TEXT` — pracownicy bez konta auth.users (nie logują się)
- `onboarding_progress.cancelled_at/_by/_reason` — anuluj onboarding (terminalny stan obok completed_at)
- `exit_interviews`: nowy status `'cancelled'` + `cancelled_at/_by/_reason` — anuluj scheduled exit
- `lifecycle_notes` table (RLS: TCM/admin full; owner/manager non-private only) — private TCM notes per pracownik z 4 kategoriami (general/onboarding/exit/flag)
- Update `enforce_exit_interview_transitions` — pozwala scheduled → cancelled
- Update `block_employment_reversal_after_exit` — ignoruje cancelled (pozwala offboarding → active gdy interview cancelled)

**Frontend (nowe routes):**
- `/internal/lifecycle/employees` — directory wszystkich HR-zone pracowników z filtrami (status × rola × search) + per-row kebab menu (Start onboarding / Schedule exit / Edit profile / Notatki TCM) + **"Dodaj external pracownika"** button + visual badge `external` w wierszu
- `/internal/lifecycle/archive` — completed/cancelled onboardingi + exited employees z tenure (mies.)

**Frontend (rozszerzone):**
- Hub: linki **Pracownicy** + **Archiwum** + **Szablony** w headerze
- Onboarding detail: `CancelOnboardingButton` (Anuluj + Restart dialogs) w "Strefie niebezpiecznej", `LifecycleNotesPanel`, `AuditHistoryPanel`
- Exit detail (status=scheduled): `CancelExitButton` (przywraca status active, czyści offboarding tasks), notes, audit history
- Exit queue: `ExportExitInterviewsButton` (CSV z UTF-8 BOM)
- Templates list: `DuplicateTemplateButton` na każdej karcie

**External onboarding flow:**
1. `/internal/lifecycle/employees` → "Dodaj external pracownika"
2. `ExternalEmployeeDialog`: imię + email (dowolna domena) + rola + hire date + opcjonalnie manager/buddy/template
3. Tworzy `profiles` row z `is_external=TRUE`, `onboarding_completed=TRUE` (skip /onboarding redirect bo nie loguje się), UUID generowany lokalnie (NIE w `auth.users`)
4. Opcja "Uruchom onboarding od razu" — auto-start z default template per rola
5. TCM oznacza taski w imieniu external pracownika; emaile wysyłane na podany adres
6. Edycja: `EditLifecycleProfileDialog` z dedicated polem `external_notes` (kontekst)

**Push notifications wired w `lifecycle.ts`:**
- `startOnboardingWithOptions` → push do employee ("Witamy w B2B Network!") + push do managera ("Team-member rozpoczyna onboarding")
- `scheduleExitInterview` → push do employee ("Exit interview") + push do managera ("Team-member rozpoczyna offboarding")
- `submitExitInterview` → push do wszystkich TCM/admin ("Nowy exit interview do review") — także po anonimizacji (bez user info)

**Server actions (12 nowych w Phase 22.3):**
`cancelOnboarding`, `restartOnboarding`, `cancelExitInterview`, `updateLifecycleProfile`, `createExternalEmployee`, `listLifecycleNotes`, `addLifecycleNote`, `deleteLifecycleNote`, `duplicateTemplate`, `listAuditLogForUser`, `exportExitInterviewsCsv`, `listCompletedOnboardings`, `listExitedEmployees`.

**Domyślne szablony seedowane przez migrację 22e:** 3 default templates — `consultant` (10 items), `internal` (11 items), `manager` (11 items). Edytowalne przez TCM w UI (read-only w pierwszej wersji — pełne CRUD planowane w follow-upie).

**Ops po deploy:**
1. Aplikuj 5 migracji przez `supabase db push` (lub MCP).
2. Dodaj 2 cron joby w panelu Coolify (patrz tabela wyżej).
3. Stres test: jako admin zaprosić nowego `consultant` z `manager_id` → sprawdzić że `profiles.employment_status='onboarding'`, `onboarding_progress` utworzony, welcome email wysłany.
4. Zalogować się jako pracownik, wypełnić task z plikiem → sprawdzić upload do `lifecycle-docs/onboarding/{user_id}/`.
5. Zalogować się jako TCM, zmienić status pracownika na offboarding via `scheduleExitInterview(...)` → wypełnić anonimowo → sprawdzić w DB że `user_id IS NULL` ale snapshot zachowany + ankieta widoczna w queue dla TCM.

## Observability

Zobacz `~/.claude/rules/observability.md` dla pełnego standardu (Sentry + Grafana Cloud + Cloudflare). Per-Compass odstępstwa:

- **JSON logger utility** — `COMPASS/lib/logger.ts` (zero-dep) używany zamiast `console.error`. ~50 lokalizacji zmigrowanych w PR #32. Pozostałe ~100 w `lib/actions/` i `components/` migrowane stopniowo gdy pliki są edytowane (hook PostToolUse blokuje nowe `console.*`).
- **Sentry projekt:** `compass` (Next.js 14, App Router + middleware Edge runtime). SDK: `@sentry/nextjs ^8` (^9 wymagałoby Next 15).
- **Source maps:** `withSentryConfig` z `hideSourceMaps: true` + upload przez `SENTRY_AUTH_TOKEN` (build-time only, nigdy w runtime image).
- **GIT_SHA propagation:** `deploy.yml` PATCH-uje Coolify env vault na każdym pushu (nie magic var Coolify). `BUILT_AT = $(date -u +%Y-%m-%dT%H:%M:%SZ)` per deploy. `/api/health` zwraca prawdziwy short SHA, smoke test prefix-match przechodzi bez retry.
- **Replay privacy:** `maskAllText: true, blockAllMedia: true` — Compass trzyma dane HR (RODO).
- **Compose `logging:`** — `json-file 10MB×5 + tag` per service (już ma).
- **Alloy sidecar:** profile-gated (`profiles: [observability]`). Bez `COMPOSE_PROFILES=observability` w Coolify nie startuje. Po dodaniu Grafana creds + profilu → logi w Loki (`{app="compass"}`).
