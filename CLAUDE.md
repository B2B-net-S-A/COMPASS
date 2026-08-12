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

## Phase 23 — Premie (PR #116, 2026-05-16)

Manager proponuje premię dla pracownika → pracownik linkuje z własną fakturą → status=paid. State machine `pending → paid | cancelled`.

Tabela `bonuses` + trigger `enforce_bonus_stage_transitions` + helper `can_propose_bonus_for(user)`. RLS: recipient + manager_of + finanse/admin (read). Audit log: `BONUS_PROPOSED/CANCELLED/LINKED_TO_INVOICE/UNLINKED`.

## Phase 24 — Timesheet UX (PR #118, 2026-05-16)

Pełen pakiet UX poprawek timesheet:

**Migracja `phase24a_timesheet_templates_and_defaults`:**
- `timesheet_user_templates` (per-user snippety opisów usług, RLS owner-only)
- `timesheet_role_defaults` (admin-defined globalne prefill per rola/projekt)
- `resolve_role_default(role, project)` RPC — priority: role+project > role > project > global

**UI dla pracownika:**
- `TimesheetEntryDialog`: dropdown "Wstaw snippet ▾" wstawia opis + projekt jednym klikiem
- `TimesheetEditor`: przyciski "Skopiuj z poprzedniego miesiąca" (z ostatniego approved) + "Wypełnij defaultem" (globalny prefill admina)
- `/internal/timesheet/archiwum` — 12 ostatnich miesięcy z statusami + Eksport CSV
- `/internal/timesheet/snippets` — CRUD swoich snippetów

**UI dla admina/managera:**
- Klik wiersza w queue → `TimesheetPreviewDialog` z dniami + opisami + Approve/Reject z modala
- Przycisk "Profil" → `EmployeeProfileDialog` z 3 tabami (Timesheety / Faktury / Urlopy za 12 mc)
- Przycisk "CSV" w toolbar (range picker max 24 mc, UTF-8 z BOM dla Excela)
- `/internal/admin/role-defaults` — admin CRUD globalnych defaultów

**Audit log:** `TIMESHEET_COPIED_FROM_PREVIOUS`, `TIMESHEET_APPLIED_DEFAULT`, `TIMESHEET_TEMPLATE_*`, `TIMESHEET_EXPORTED_CSV`, `ROLE_DEFAULT_*`.

## Phase 25 — Zastępca + Outlook Out of Office + Calendar (PR #120 + #122, 2026-05-18)

Po approve urlopu system automatycznie ustawia OOF w Outlook pracownika + tworzy event "Urlop" w jego kalendarzu + wysyła email do zastępcy (jeśli wybrany).

**Migracja `phase25a_leave_substitute_and_oof`:**
- `leave_requests.substitute_id` (UUID FK profiles)
- `leave_requests.oof_internal_message` + `oof_external_message` (custom PL+EN auto-reply, opcjonalny)
- `leave_requests.graph_oof_set` + `graph_oof_set_at` (flag/timestamp gdy Graph potwierdzi)
- `leave_requests.graph_sync_error` (last error from Graph — OOF lub Calendar)
- 3 indexes: substitute, sync_error, active window

**Backend:**
- `lib/mailbox/graph-oof.ts` — `setOutOfOffice` / `disableOutOfOffice` / `buildDefaultOofMessages` (dwujęzyczny PL+EN default)
- `lib/calendar/graph-events.ts` (już od PR2) — `createLeaveEvent` / `deleteLeaveEvent`
- `approveLeaveRequest`: po success wywołuje OOF + Calendar + email do zastępcy, zapisuje flagi
- `cancelMyLeaveRequest` (status=approved): auto-disable OOF + delete event
- `retryLeaveGraphSync(id)` (admin only) — Phase 25d, ponawia sync gdy `graph_sync_error IS NOT NULL`

**UI:**
- `LeaveRequestForm`: dropdown "Zastępca" (z `listEligibleSubstitutes()` — HR-zone only, nie self, nie exited) + collapsible "Dostosuj tekst Out of Office" (2 textareas)
- `MyLeaveList`: "Zastępca: [Name]" + status OOF badge (green/amber/grey) dla approved
- `LeaveQueue` (admin pending): zastępca + badge "Custom Out of Office message"
- `AdminLeaveSyncIssues`: card z approved leaves gdzie sync failed + przycisk "Ponów"
- `ActiveLeavesBanner` (server component, w `/internal` u góry): aktywne urlopy w team scope (admin/TCM=all, manager=team, internal=own manager+colleagues+self), top 3 + count of remaining

**Email:** `sendSubstituteAssigned` (lib/email.ts) — wrapHrEmail z `saveToSentItems=true`.

**Audit log:** `LEAVE_SUBSTITUTE_ASSIGNED`, `LEAVE_OOF_SET`, `LEAVE_OOF_FAILED`, `LEAVE_OOF_DISABLED`.

## Phase 25c — Lifecycle emails są opt-in (2026-05-19)

Welcome onboarding email + exit interview invitation + offboarding checklist do managera **nie wysyłają się automatycznie** przy starcie onboardingu / exit interview. TCM/admin decyduje w momencie startu (checkbox w dialogu, default OFF) lub po fakcie (przycisk "Wyślij teraz" na karcie szczegółów). Powód: external pracownicy są tworzeni z prywatnym emailem podanym przez TCM (vendor, kontraktor, "konto procedurowe") — automatyczne emaile spamują skrzynki które nigdy nie miały dostać powiadomień systemowych.

**Push notifications (in-app) bez zmian** — zostają domyślnie, bo nie spamują skrzynki pocztowej. Push do external user i tak są no-op (brak `auth.users`), push do managera to przydatna notyfikacja w aplikacji.

**Migracja `phase25c_lifecycle_email_tracking`** (6 kolumn — kto/kiedy wysłał):
- `onboarding_progress.welcome_email_sent_at`, `welcome_email_sent_by`
- `exit_interviews.invitation_sent_at`, `invitation_sent_by`
- `exit_interviews.manager_checklist_sent_at`, `manager_checklist_sent_by`

**Server actions (4 zmodyfikowane + 3 nowe):**
- `startOnboardingWithOptions({sendWelcomeEmail?: boolean})` — default `false`
- `createExternalEmployee({sendWelcomeEmail?: boolean})` — default `false`, ignorowane gdy `autoStartOnboarding=false`
- `scheduleExitInterview(userId, terminationDate, scheduledFor, options?: {sendEmployeeEmail?, sendManagerEmail?})` — oba default `false`
- `archiveEmployee(userId, terminationDate, options?: {sendEmployeeEmail?, sendManagerEmail?})` — wrapper w `user-admin.ts`, defaults `false`
- NEW `sendOnboardingWelcomeEmailNow(progressId)` — TCM/admin manual trigger
- NEW `sendExitInvitationNow(interviewId)` — TCM/admin manual trigger
- NEW `sendOffboardingChecklistNow(interviewId)` — TCM/admin manual trigger
- `startOnboarding(userId, templateId)` (legacy) — usunięto automatyczne wysyłanie emaila; callerzy powinni używać `*WithOptions`

**UI dialogi (checkboxy, default OFF):**
- `StartOnboardingDialog.tsx` — 1 checkbox "Wyślij email powitalny"
- `ExternalEmployeeDialog.tsx` — 1 checkbox (visible gdy `autoStartOnboarding=true`)
- `ScheduleExitDialog.tsx` — 2 checkboxy (pracownik + manager)
- `AdminEmployeesPanelClient.tsx` → `ArchiveEmployeeDialog` — 2 checkboxy

**UI detail pages:**
- Onboarding detail (`/internal/lifecycle/onboarding/[progressId]`) — komponent `WelcomeEmailCard` (visible dla lifecycle admin gdy onboarding niezakończony), pokazuje status "Wysłany {date} przez {name}" lub button "Wyślij email powitalny teraz". Re-send wymaga potwierdzenia (audytowane).
- Exit detail (`/internal/lifecycle/exit/[interviewId]`) — komponent `ExitEmailsCard` (visible gdy `status=scheduled` i `user_id` not null), 2 sekcje: zaproszenie do pracownika + checklist do managera, każda z buttonem + status.

**Audit log (3 nowe actions):**
- `ONBOARDING_WELCOME_EMAIL_SENT` (z `trigger: 'start_dialog' | 'external_create_dialog' | 'manual_send_now'`)
- `EXIT_INVITATION_EMAIL_SENT`
- `OFFBOARDING_CHECKLIST_EMAIL_SENT`

Plus rozszerzono istniejące `ONBOARDING_STARTED` i `EXIT_INTERVIEW_SCHEDULED` metadata o `welcome_email_opt_in` / `employee_email_opt_in` / `manager_email_opt_in` (boolean) — można post-hoc zobaczyć z audit log czy email poszedł od razu, później, czy w ogóle.

**Ops po deploy:**
1. Migracja aplikowana już przez MCP (2026-05-19).
2. Brak nowych cron jobów ani env vars.
3. Smoke test: TCM tworzy external pracownika z `autoStart=ON` i `sendWelcomeEmail=OFF` → sprawdź audit log: `EXTERNAL_EMPLOYEE_CREATED`, `ONBOARDING_STARTED (welcome_email_opt_in=false)`, BRAK `ONBOARDING_WELCOME_EMAIL_SENT`. Otwiera onboarding detail → klika "Wyślij email powitalny teraz" → sprawdź `onboarding_progress.welcome_email_sent_at != NULL`, audit log `ONBOARDING_WELCOME_EMAIL_SENT (trigger=manual_send_now)`.

## Phase 25b — Manager/Admin wpisuje urlop w imieniu pracownika (PR #124, 2026-05-18)

Pracownik czasem zapomina wysłać wniosek urlopowy. Manager (dla swojego zespołu via `profiles.manager_id`) lub admin (globalnie) może wpisać urlop post-factum z auto-approve. Pracownik dostaje email + push z informacją kto wpisał.

**Migracja `phase25b_leave_on_behalf`:**
- `leave_requests.created_by` UUID NOT NULL (backfilled z `user_id` dla istniejących self-service wpisów)
- `leave_requests.created_on_behalf` BOOLEAN DEFAULT FALSE
- Indeks `idx_leave_created_by WHERE created_by <> user_id` — szybkie wyszukiwanie wpisów on-behalf
- RLS `leave_insert_self_or_on_behalf` — 3 ścieżki: self / admin on-behalf / manager on-behalf
- RLS `leave_update_owner_pending_admin_or_manager` — manager może później skorygować swój wpis
- RLS `leave_select_manager_team_all_statuses` — manager widzi wszystkie statusy zespołu (do tej pory tylko approved)

**Backend (`lib/actions/internal-leave.ts`):**
- `createLeaveOnBehalf({targetUserId, startDate, endDate, leaveType, halfDay?, note?, substituteId?})` — guard dual (admin OR `target.manager_id === ctx.userId`), duplicate detection, walidacja substitute, INSERT z `status='approved'`, `decided_by=ctx.userId`, `created_on_behalf=true`
- `listTeamMembersForLeaveOnBehalf()` — admin: wszyscy HR-zone aktywni; manager: tylko `manager_id=ctx.userId`. Wykluczeni: konsultanci IT (no urlopów), exited/offboarding, self

**Side-effecty inteligentnie wg `end_date >= today`:**
- ZAWSZE: `syncAttendanceFromLeave`, `logAudit('LEAVE_CREATED_ON_BEHALF')`, email + push do pracownika, Teams alert (niebieski "info" `#3B82F6`, nie zielony "approved")
- ONGOING/FUTURE: + `createLeaveEvent` (Outlook calendar) + `setOutOfOffice` (Outlook OOF z auto-generated PL+EN message) + `sendSubstituteAssigned` (jeśli wybrany zastępca)
- PAST: pomijamy Outlook/OOF/substitute — nie ma sensu auto-reply na okres który minął

**Walidacje (server-side):**
- `targetUserId === ctx.userId` → throw (sobie nie wpisuj, użyj normal form)
- `leaveType === 'sick_leave'` → throw (L4 musi wpisać pracownik z dokumentem)
- Target poza HR-zone (`consultant`) → throw
- Target `exited` / `offboarding` → throw
- Manager + `target.manager_id !== ctx.userId` → throw "Możesz wpisać urlop tylko swojemu zespołowi"
- Overlap z istniejącym approved leave → throw z datami konfliktującego wpisu

**UI:**
- Nowa zakładka `/internal/admin?tab=leave-on-behalf` widoczna dla admin + manager (visibleTabs w `admin/page.tsx` rozszerzone)
- `LeaveOnBehalfPanel` (server) → pre-fetch candidates, renderuje `CreateLeaveOnBehalfForm`
- `CreateLeaveOnBehalfForm` (client): select pracownika, typ urlopu (bez sick_leave), daty, half-day, note, substitute (pokazany tylko gdy `endDate >= today`)
- Live bannery: past leave (amber, "Outlook OOF i email zastępcy NIE zostaną wysłane") / ongoing-future (blue, "Out of Office zostanie ustawiony")
- `LeaveQueue` (admin pending list): button-skrót "Wpisz urlop za pracownika" linkujący do `tab=leave-on-behalf`

**Email:** `sendLeaveCreatedOnBehalf(recipient, name, actor, type, start, end, note?, isPastLeave?)` w `lib/email.ts` — accent niebieski `#3b82f6`, treść różna dla past vs future, `saveToSentItems=true`.

**Audit log:** `LEAVE_CREATED_ON_BEHALF` z payload `{leave_id, target_user_id, leave_type, start_date, end_date, actor_role, is_past_leave}`.

### KRYTYCZNE: Exchange Online RBAC for Applications (RAOP)

Tenant `b2bnetwork.pl` ma aktywny mechanizm **RBAC for Applications** w Exchange Online (Microsoft, GA 2024). To NIE wystarczy żeby app miała permissions w Entra — wymagane jest też explicit role assignment w EXO. Bez tego Graph zwraca:
```
403 ErrorAccessDenied — [RAOP] : Blocked by tenant configured AppOnly AccessPolicy settings.
```

**Fix (zrobiony 2026-05-18, ServicePrincipal ObjectId `90ea31d8-c888-4e34-b146-9bd97f894515`):**
```powershell
Connect-ExchangeOnline -UserPrincipalName artur.twardowski@b2bnetwork.pl
$sp = New-ServicePrincipal -AppId "17f9ff8c-ac4e-414d-890e-a823722b4c35" -ServiceId "90ea31d8-c888-4e34-b146-9bd97f894515" -DisplayName "Compass"
New-ManagementRoleAssignment -App $sp.Identity -Role "Application Mail.Send"
New-ManagementRoleAssignment -App $sp.Identity -Role "Application Calendars.ReadWrite"
New-ManagementRoleAssignment -App $sp.Identity -Role "Application MailboxSettings.ReadWrite"
```

**GOTCHA:** `-ServiceId` musi być **Entra Service Principal ObjectId** (z `az ad sp list --filter "appId eq '...'" --query "[0].id"`), NIE Application ID. Niejasne w docs Microsoft.

**Smoke test Graph (verify EXO RBAC działa):**
```bash
TOKEN=$(curl -s -X POST "https://login.microsoftonline.com/$TENANT_ID/oauth2/v2.0/token" \
  -d "client_id=$CLIENT_ID" -d "client_secret=$CLIENT_SECRET" \
  -d "scope=https%3A%2F%2Fgraph.microsoft.com%2F.default" \
  -d "grant_type=client_credentials" | jq -r .access_token)
# Test PATCH mailboxSettings → expect 200
curl -X PATCH "https://graph.microsoft.com/v1.0/users/artur.twardowski@b2bnetwork.pl/mailboxSettings" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"automaticRepliesSetting":{"status":"disabled"}}'
```

Jeśli zwraca 403 RAOP — uruchom skrypt PowerShell powyżej żeby przyznać role w EXO.

## Phase 26 — Bonusy z auto-akceptem managera + ukrycie faktur (PR #128 + #130, 2026-05-19)

Uproszczenie workflow premii — manager (lub admin) przypisuje pracownikowi premię z uzasadnieniem za konkretny miesiąc; bonus jest od razu w stanie terminalnym `assigned` (auto-approved, bez wymogu linkowania z fakturą). Pracownik dostaje email (Graph Send-As, accent zielony) + push in-app. Manager może później edytować (kwota, uzasadnienie, notatka) lub anulować — każda zmiana propaguje notyfikacje.

Równocześnie wyłączono cały flow faktur (Phase 19/20c) z UI za pomocą feature flag — tabela `invoices` zostaje w DB, server actions rzucają błąd gdy flaga off. Phase 27 może reaktywować po przeprojektowaniu.

**Migracja `phase26a_bonus_assigned_workflow`:**
- `bonuses`: rozszerzony CHECK status o `'assigned'`; nowe kolumny `period_year SMALLINT`, `period_month SMALLINT`.
- Partial UNIQUE `(recipient_user_id, period_year, period_month) WHERE status='assigned' AND period_year IS NOT NULL` — jedna przypisana premia per pracownik per miesiąc.
- Trigger `enforce_bonus_stage_transitions` zaktualizowany:
  - INSERT: tylko `status='assigned'` + wymagane `period_year`/`period_month` + brak `linked_invoice_id`.
  - UPDATE: `assigned → cancelled` OK; `assigned → assigned` (edit amount/reason/notes); zablokowana zmiana `recipient_user_id` lub period.
  - Legacy transitions (`pending → paid`, `pending → cancelled`, `paid → pending`) zostają dla wstecznej kompatybilności.
- RLS `bonuses_update_cancel_by_proposer` przyjmuje `status IN ('pending','assigned')`.
- `notifications` type CHECK rozszerzony o `'bonus_assigned'`, `'bonus_updated'`.

**Feature flag faktur:**
- `NEXT_PUBLIC_INVOICES_ENABLED` (client/build-time, embedded w bundle) — filtruje taby `invoices` w `/internal` + `/internal/admin` + sidebar `financeGroup`/`managerGroup` invoice links + `EmployeeProfileDialog` tab "Faktury".
- `INVOICES_ENABLED` (server-only runtime) — `requireInvoicesEnabled()` guard na `submitInvoice/approveInvoice/rejectInvoice/managerApproveInvoice/managerRejectInvoice/linkBonusToInvoice/unlinkBonus/proposeBonus`.
- Defaults: oba `false` (invoices off). Żeby reaktywować — ustawić oba na `'true'` w Coolify env vault + rebuild.

**Server actions (lib/actions/internal-bonus.ts):**
- `assignBonus(input)` — guard `requireBonusProposerAction`; manager scope (`profiles.manager_id = ctx.userId`); period validation (past 12 + current); UNIQUE friendly error; INSERT z `status='assigned'`; email + push + audit.
- `updateBonus(input)` — guard proposer/admin; tylko `amount`/`reason`/`notes` (period+recipient immutable trigger-side); push z `changes` summary.
- `cancelBonus(input)` — przyjmuje teraz `assigned` lub `pending`.
- `listEligibleEmployeesForBonus()` — manager: zespół; admin: wszyscy HR-zone aktywni; wykluczeni consultant + exited.
- Legacy `proposeBonus/linkBonusToInvoice/unlinkBonus` — `@deprecated`, gated przez `requireInvoicesEnabled()`.

**UI:**
- `/internal/admin?tab=bonuses` (admin + manager) — lista zespołu z filtrami `assigned/cancelled/all`, button "Przypisz premię" + per-row "Edytuj"/"Anuluj". Kolumna miesiąc z PL nazwą.
- `/internal?tab=bonuses` (pracownik) — read-only lista własnych premii z kwotą, miesiącem, uzasadnieniem, kto przypisał.
- `EmployeeProfileDialog` (Phase 24): 4. tab "Premie" (read-only ostatnie 12 mies.) + top-level button "Przypisz premię" dla managera/admina pracownika (otwiera AssignBonusForm w nested dialogu z zablokowanym recipientem).
- Komponent `AssignBonusForm` (shared, mode `'assign' | 'edit'`, period selector past 12 + current).

**Audit log akcje:** `BONUS_ASSIGNED`, `BONUS_UPDATED` (Phase 26) + istniejące `BONUS_PROPOSED/CANCELLED/LINKED_TO_INVOICE/UNLINKED` (Phase 23 legacy).

**Notyfikacje:**
- In-app DB (notifications table): typy `bonus_assigned`, `bonus_updated`.
- Email: `sendBonusAssigned` (zielony accent, period PL) + `sendBonusUpdated` (niebieski accent + `changesSummary`) via Graph Send-As, `saveToSentItems=true`.
- Web push (best-effort): `sendPushToUserId` z `url: '/internal?tab=bonuses'`.
- Wszystkie 3 kanały w `Promise.allSettled` — channel failure nie blokuje pozostałych.

**Bug fixy po deploy (2026-05-19):**
- **PR #130:** `getEmployeeProfile` używał PostgREST embed `proposer:profiles!bonuses_proposed_by_fkey(full_name)` dla bonusów, ale `bonuses` ma 3 FK do `profiles` (proposed_by, recipient_user_id, cancelled_by) → wieloznaczność. Naprawione przez rozdzielenie na dwa zapytania (bonusy → potem `profiles WHERE id IN (...)`).
- **PR #133:** Realna przyczyna crashu — embed managera `manager:profiles!profiles_manager_id_fkey(full_name)` zwracał PGRST200 "Could not find a relationship... using hint 'profiles_manager_id_fkey'". Self-FK na profiles (manager_id → profiles.id) nie rozpoznawany przez PostgREST schema cache mimo że constraint istnieje; `NOTIFY pgrst, 'reload schema'` nie pomogło. Fix: split na dwa zapytania (profile bez embed → potem `profiles WHERE id = manager_id`). Reguła: **unikaj embed-by-FK-hint na self-referencing tabelach w Compass**; preferuj split queries.

**Ops po deploy:**
1. Migracja zaaplikowana via Supabase MCP (prod miał 0 bonusów + 0 faktur, więc zero ryzyka).
2. Coolify env vars ustawione przez API: `NEXT_PUBLIC_INVOICES_ENABLED=false` (buildtime+runtime), `INVOICES_ENABLED=false` (runtime).
3. Brak rebuild required — defaults bez env vars i tak resolve do `false`. Env vars set jawnie dla widoczności w panelu.

## Phase 44 — Kanban ↔ skrzynka mailowa: integracja USUNIĘTA (2026-07-29)

> Zastępuje Fazy 26b / 26c / 26d (auto-import maili do `/admin/inbox`). Kod integracji nie istnieje —
> opis poniżej jest po to, żeby nikt nie odtwarzał jej z pamięci ani nie szukał martwych plików.
> Historia implementacji: `git log -- COMPASS/lib/inbox COMPASS/lib/mailbox/graph-mail-read.ts`.

**Co robiła:** cron `*/5` czytał Graphem shared mailbox `compass-tickets@b2bnetwork.pl` (zasilany
transport rule BCC-ującym każdy mail z `administracja@`) i zakładał z maili tickety na tablicy Kanban;
odpowiedzi miały doklejać się do istniejącego ticketu po `conversationId`.

**Dlaczego wycofana:** crony Coolify nie odpalały od maja (patrz `coolify_cron_needs_container_name`),
więc ingest ruszył realnie dopiero **27.07.2026** — i w dwie doby wrzucił **178 ticketów**.
Wątkowanie po `conversationId` nie zadziałało dla tej poczty: **każda odpowiedź w wątku (RE:/ODP:/Fw:)
zakładała osobny ticket**. Przy 44 ticketach ręcznych tablica przestała nadawać się do pracy.
Decyzja Artura 29.07: wrócić do ręcznego wpisywania spraw.

**Usunięty kod:** `app/api/cron/inbox-ingest/`, `lib/inbox/` (ingest + filters + run-lock + testy),
`lib/mailbox/graph-mail-read.ts`. W UI: banner „Auto-import", badge „email" na karcie, render treści
maila (HTML/tekst) i sekcja załączników na `[id]`. W `getInboxTicketDetail` — pobieranie podpisanych
URL-i z bucketu. **Zostaje** pole „Od (email)" w ręcznym dialogu (to zwykłe pole formularza, nie integracja).

**Uwaga — `lib/mailbox/` NIE jest martwe.** Zostały tam `graph-oof.ts`, `graph-inbox-rules.ts`
i `forward-rule-sync.ts` — to Fazy 25/41 (Out of Office + przekierowanie poczty na czas urlopu),
zupełnie inna funkcja. Usunięty został wyłącznie `graph-mail-read.ts`.

**Czego migracja NIE ruszyła (dane zostają, do odzyskania):**
- 178 ticketów `support_inbox_meta.source='email'` — **zamknięte** migracją
  `phase44_close_ingested_inbox_tickets` (zeszły z tablicy, nie skasowane). Powrót: `UPDATE
  support_tickets SET status='open' WHERE ...`. Ślad w audycie: `INBOX_EMAIL_TICKETS_BULK_CLOSED`.
- Tabela `inbox_sync_state` (2 wiersze z kursorami), kolumny `support_inbox_meta.email_body_html` /
  `email_body_text` / `email_headers` / `email_skip_reason` / `external_conversation_id`, bucket
  `inbox-attachments` — martwe, ale nietknięte. Treść maili i 24 komentarze są dalej w bazie.
- `InboxSource` wciąż zawiera `'email'` — właśnie z powodu tych 178 wierszy.

**Ops do zrobienia ręcznie po deployu (poza repo):**
1. **Coolify** — wyłączyć zadanie `inbox-ingest` (endpoint już nie istnieje, więc tik = 404 co 5 min):
   `gh workflow run "Coolify Ops" -f action=cron-disable-task -f task_name=inbox-ingest`.
   Uwaga: `action=cron-enable` włącza **wszystkie** zadania naraz, więc po każdym takim przebiegu
   trzeba `inbox-ingest` wyłączyć ponownie.
2. **Exchange** (wymaga PowerShella i uprawnień EXO — Claude tego nie zrobi):
   `Remove-TransportRule -Identity "Mirror Administracja to Compass Inbox"` (kopia do
   `compass-tickets@`). Sama skrzynka `compass-tickets@b2bnetwork.pl` może zostać — bez transport
   rule nic do niej nie wpada. Uprawnienia app `Mail.Read` / `Sites.Read.All` zostają nietknięte:
   `Mail.Read` nie jest już przez COMPASS używane do ingestu, ale RAOP/`CompassMailSenders` obsługują
   też OOF i forward (Fazy 25/41) — **nie odbierać ich hurtem**.

**Jeśli kiedyś wracać do auto-importu:** najpierw naprawić wątkowanie (`conversationId` z Graph nie
scala wątku dla tej poczty — trzeba oprzeć się o `In-Reply-To`/`References` albo normalizację tematu),
i dopiero potem cokolwiek włączać. Bez tego wraca dokładnie ten sam zalew.

## Phase 28 — Placementy (import Excela → auto-premie DL/Rekruter + tickety TCM, 2026-05-21)

Manager (Dominik) wgrywa raz w miesiącu Excela z nowymi placementami (umieszczenie zewnętrznego konsultanta u klienta). System liczy premie, prognozuje datę należności (168h), a po potwierdzeniu generuje premie DL + rekrutera. Każdy DL/Rekruter widzi swoje placementy. Każdy nowy placement tworzy ticket onboardingu dla TCM.

**Reguły premii (reuse Phase 27b/d):**
- DL: `monthly_margin × 10%` (monthly_margin = (stawka_przychodowa − kosztowa) × 168h).
- Rekruter wg progu marży/h: ≤40 → 1000 zł, 40–50 → 1500 zł, ≥50 → 2000 zł (`recruiterTierForMargin`, `lib/types/bonus.ts`).
- Należność: konsultant musi przepracować **168h** (~21 dni roboczych od startu). `bonus_eligible_date = start + 21 dni rob.`

**Schema (migracje 28a + 28b, zaaplikowane na prod via MCP 2026-05-21):**
- `placements` — źródło prawdy (1 wiersz = 1 podpisana umowa). Konsultant = free text (zewnętrzny, nie user); DL i Rekruter linkują do `profiles` (NOT NULL — wiersze bez dopasowania blokowane przy imporcie). Klucz naturalny `(lower(consultant)+lower(client)+start_date)` UNIQUE → idempotentny re-upload. Stan: `upcoming → started → bonus_confirmed` (+ `cancelled`). Linki `dl_bonus_id`/`recruiter_bonus_id` (anty-dubel generacji), `tcm_ticket_id`.
- `placement_person_aliases` — pamięć nazwisko→profil; kolejne uploady auto-rozwiązują znane nazwiska.
- `support_categories` += `inbox_onboarding` (slug `inbox_%` → ticket trafia na Kanban `/admin/inbox`). `notifications` type += `placement_reminder`.
- Brak migracji „relax unique" — `bonuses_one_per_recipient_period` już zdjęty w Phase 27e (rekruter może mieć wiele premii/mies.).

**Flow:**
- `/internal/admin?tab=placements` (admin + manager): upload `.xlsx` → `PlacementImportDialog` (preview diff nowe/zmiana/zniknięte + mapowanie distinct nazwisk + blokada commitu na nierozwiązanych) → commit (UPSERT po kluczu, tworzy ticket TCM per nowy placement). Daty w Excelu **muszą mieć rok** (parser exceljs czyta realne daty).
- Potwierdzenie 168h: hybryda — cron `placement-hours-reminder` przypomina managerowi (push + in-app `placement_reminder`); klik „168h" (`confirmPlacementHours`) generuje 2 rekordy `bonuses` (kat. `delivery_lead` + `recruiter`, status `assigned`, service-role insert), notyfikacje (`sendBonusAssigned` + push) i ustawia `bonus_confirmed`.
- Self-view `/internal/placements` (DL/Rekruter): własne placementy (RLS scope) + prognoza premii (kwota + ~data).

**Pliki:** `lib/types/placement.ts`, `lib/placements/{parse-xlsx,import}.ts` (+ testy), `lib/actions/placements.ts`, `components/internal/{PlacementImportDialog,PlacementsAdminClient}.tsx` + `panels/PlacementsAdminPanel.tsx`, `app/(protected)/internal/placements/page.tsx`, `app/api/cron/{placement-status-tick,placement-hours-reminder}/route.ts`. Dep: `exceljs`.

**Audit log:** `PLACEMENTS_IMPORTED`, `PLACEMENT_HOURS_CONFIRMED`, `PLACEMENT_BONUSES_GENERATED`, `PLACEMENT_CANCELLED`, `PLACEMENT_PERSON_ALIAS_SET`.

**Coolify cron jobs (do dodania po deploy):**

| Nazwa | Schedule | Komenda |
|---|---|---|
| `placement-status-tick` | `0 6 * * *` (06:00 UTC daily) | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://compass.dynaminds.pl/api/cron/placement-status-tick"` |
| `placement-hours-reminder` | `0 8 * * *` (08:00 UTC daily) | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://compass.dynaminds.pl/api/cron/placement-hours-reminder"` |

`placement-status-tick`: `upcoming → started` gdy `start_date ≤ dziś`. `placement-hours-reminder`: dla `started` placementów po `bonus_eligible_date` (ostatnie 30 dni), niepotwierdzonych → przypomnienie do importera (lub managerów/adminów) o potwierdzeniu 168h.

## Phase 30 — Pula płatnych urlopów dla B2B/zlecenie (2026-06-01)

Rozszerzenie infrastruktury Phase 27k (urlop UoP) na B2B i zlecenie — dla pracowników którzy mają w kontrakcie wynegocjowany benefit "X dni płatnych urlopów rocznie". PR #179 / `phase29_b2b_zlecenie_vacation_only` zablokował B2B/zlecenie do `leave_type='vacation'` ale bez puli — domyślnie wszystko bezpłatne. Phase 30 daje adminowi opcję ustawić pulę per pracownik; system auto-splituje wniosek na płatny (z puli) + bezpłatny (nadwyżka) w jednym `leave_request`.

**Kluczowe decyzje (z planowania):**
- **Roczna pula, bez carry-over** — reset implicit przez `WHERE start_date BETWEEN year-01-01 AND year-12-31` w `getMyLeaveBalance`.
- **Tylko B2B/zlecenie** dostają nową semantykę auto-split. UoP zostaje przy hard-limit (PR #179 + Phase 27k unchanged — UoP używa osobnego `leave_type='unpaid_leave'` dla nadwyżki, czego B2B/zlecenie nie mają).
- **Auto-split**: jeden `leave_request` z `paid_days + unpaid_days = working_days`. Per-day distinction w timesheet: chronologicznie pierwsze N dni roboczych = płatne, reszta = bezpłatne.
- **Hybrydowy backfill** przez nową kolumnę `profiles.leave_used_initial_days` — admin przy włączeniu puli wpisuje "ile już zużyto w tym roku" (np. "pula 20, wpisz 5 → balance 15").
- **Display**: per-leave badge w `TimesheetPreviewDialog` (admin/finanse/manager), breakdown w `MyLeaveList` (pracownik), preview w `LeaveRequestForm`. Kalendarz zespołu `/internal?tab=calendar` bez zmian (consolidacja OOO/Zdalnie/Święto z PR #179/180/181 zostaje). Brak proaktywnych emaili/push o końcu puli — info widoczne tylko w widget'cie.

**Migracja `phase30_paid_vacation_pool_b2b`:**
- `profiles.leave_entitlement_days` — comment update (pula dotyczy każdego employment_type, nie tylko UoP)
- `profiles.leave_used_initial_days NUMERIC(4,1) DEFAULT 0` — hybrydowy backfill
- `leave_requests.paid_days NUMERIC(4,1) DEFAULT 0` — split płatne
- `leave_requests.unpaid_days NUMERIC(4,1) DEFAULT 0` — split bezpłatne
- Index `idx_leave_requests_user_year_pool` (partial — vacation+on_demand z status approved/pending)
- **Świadomie BEZ** triggera walidującego sum (computation świąt PL w PG SQL jest pain — walidacja w app layer)
- **Świadomie BEZ** backfilla historycznych leave_requests (zostają z 0/0; admin użyje `leave_used_initial_days` per user)

**Backend:**
- `lib/hr/leave-balance.ts` += `computePaidUnpaidSplit({employmentType, entitlementDays, carriedOverDays, usedInitialDays, alreadyBookedDaysInYear, requestedWorkingDays})` — pure helper z 10 unit testami (B2B/zlecenie bez puli, z pulą fits/partial/exhausted, UoP zawsze paid=requested, half-day atomowy, over-booked, requested=0).
- `lib/actions/internal-leave.ts`:
  - Nowy helper `computeLeaveRequestSplit(supabase, userId, leaveType, start, end, halfDay)` — fetch 3 zapytań (profile + existing-in-year + holidays) → wywołuje `computePaidUnpaidSplit`.
  - `createLeaveRequest` + `createLeaveOnBehalf` — używają split, wstawiają `paid_days/unpaid_days` do INSERT. UoP hard-limit zachowany (throw przy overshoot z friendly errorem).
  - `getMyLeaveBalance` — odgate'owana (`hasLimit = entitlement != null` zamiast `employment_type === 'uop' && entitlement != null`). Odejmuje `leave_used_initial_days` z remaining.
  - `listPendingLeaveRequests` — extended SELECT (paid_days/unpaid_days + profile pool fields via nested select) + batch-fetch SUM(paid_days) per user/year dla badge'a "Pula 2026: 15/20".
  - Nowy `previewLeaveSplit({startDate, endDate, halfDay, leaveType})` — używany przez LeaveRequestForm do live banner'a.
- `lib/actions/user-admin.ts` `setEmployeeProfile`/`getEmployeeProfileFields` — dodane `leave_used_initial_days` w UpdateableFields + SELECT + walidacja.

**Frontend:**
- `EmployeeProfileDialog` (admin) — odgate'owane (sekcja puli widoczna dla każdego employment_type), 3-ci input `leave_used_initial_days`, adaptive label (UoP: "Limit urlopu (KP)" vs B2B/zlecenie: "Pula płatnych (z kontraktu, opcjonalna)"), adaptive helper text.
- `LeavePanel` — conditional render `LeaveStatsWidget`: visible TYLKO gdy UoP lub B2B/zlecenie z pulą. B2B/zlecenie bez puli → widget w ogóle nie renderuje się (per user req: "jak nie ma, to nie pokazuj sekcji").
- `LeaveStatsWidget` — adaptive header ("Pula płatnych urlopów" dla B2B/zlecenie z pulą vs "Urlop wypoczynkowy"); breakdown wymiar/zaległe/zużyte-na-start; tekst "Bez puli płatnych" dla B2B/zlecenie bez puli.
- `LeaveRequestForm` += `hasPool` prop + live preview banner (debounce 350ms) z 3 stanami: ✓ wszystko płatne (green), ⚠ częściowo (amber), ✗ wszystko bezpłatne (red). Visible dla vacation/on_demand gdy `hasPool=true`.
- `MyLeaveList` — breakdown per wniosek: "5 dni płatnych (z puli) + 3 dni bezpłatnych".
- `LeaveQueue` (manager/admin/finanse) — badge per pending row: "5 płatnych + 0 bezpłatnych · Pula 2026: 15/20 → po akceptacji 10/20".
- `TimesheetPreviewDialog` — w sekcji "Urlopy w tym miesiącu" dodano pill "X dni płatnych (z puli)" + "Y dni bezpłatnych" przy każdym urlopie. `TimesheetEditor` (widok własny pracownika) — bez zmian; pracownik widzi breakdown w `MyLeaveList`.

**Ops po deploy:**
1. Aplikuj migrację `phase30_paid_vacation_pool_b2b` przez Supabase MCP (`mcp__e0e020fb...__apply_migration`).
2. Dla każdego B2B/zlecenie pracownika z benefitem (Dominik/Artur ustala listę): `/internal/admin?tab=rates` → button "Profil" → wypełnij "Wymiar dni/rok" + "Już zużyte (start)" + Save. Backfill manualny przez `leave_used_initial_days` zachowuje historyczne wnioski jako 0/0 ale "zjada" pulę zgodnie z deklaracją admina.
3. Komunikat dla tych pracowników (Slack/Teams): "Od dziś widzisz pulę płatnych urlopów w `/internal?tab=leaves`."
4. Brak cron jobów, brak nowych env vars.

**Audit log:** existing `EMPLOYEE_PROFILE_UPDATE` payload zawiera `leave_entitlement_days` / `leave_carried_over_days` / `leave_used_initial_days` (zmiana fields obiektu — bez nowych action types). Existing `LEAVE_APPROVED` (Phase 25) niezmieniona — paid/unpaid są na samym `leave_requests` row.

## Phase 30b — Płatny urlop z puli pokazuje godziny w timesheet (2026-05-29)

Decyzja Artura: dla B2B/zlecenie z pulą **dni płatnego urlopu (z puli) mają pokazywać się w timesheet jak normalny dzień roboczy — auto-wpis 8h, billable**. Dopiero po wyczerpaniu puli nadwyżkowe dni (`unpaid_days`) blokują timesheet jak zawsze (i nie pokazują się). UoP **bez zmian** (urlop nadal blokuje — etatowiec nie rozlicza godzin za urlop).

**Mechanizm (zmiana względem Phase 30):** wcześniej approved `vacation` tworzył `attendance_records` (status=`vacation`) dla **wszystkich** dni roboczych → wszystkie zablokowane w timesheet. Teraz `syncAttendanceFromLeave` dzieli dni przez `splitLeaveWorkingDays`:
- **dni płatne** (pierwsze `paid_days` dni roboczych, B2B/zlecenie pool) → **BEZ** attendance + auto-wpis do `timesheet_entries` (8h/4h, `source='leave_paid'`, opis „Praca standardowa" — patrz nota niżej), getOrCreate timesheet per (rok, miesiąc), idempotentny.
- **dni blokujące** (nadwyżka/UoP/non-pool) → `attendance_records` jak dotąd.
- `remove` (cancel/reject urlopu) → usuwa attendance **i** auto-wpisy `leave_paid` w zakresie.

**Opis auto-wpisu = „Praca standardowa" (decyzja Artura, 2026-06-03):** płatny dzień z puli ma na karcie pracy/PDF wyglądać jak NORMALNY dzień roboczy (string identyczny z `DEFAULT_QUICK_FILL_DESCRIPTION`). Pierwotnie opis brzmiał „Urlop płatny (z puli)", co zdradzało pochodzenie na dokumencie idącym do klienta. Pochodzenie z puli COMPASS śledzi WYŁĄCZNIE wewnętrznie przez `source='leave_paid'` — nie przez opis (PDF renderuje tylko `description`; edytor/preview nie mają badge'a dla `leave_paid`). Istniejące TS-y poprawione na prod (23 wpisy w 6 TS-ach; `pdf_hash` przeliczony dla 3 approved — Anna Korycka/Malwina Jobda/Michał Stankiewicz maj 2026).

**Kalendarz zespołu** (`VacationCalendar`) bez zmian — czyta OOO z `leave_requests` (pełen zakres), więc płatne dni nadal pokazują się jako urlop, mimo braku rekordu attendance.

**Pliki:**
- `lib/hr/leave-timesheet-split.ts` (NEW) — czysty helper `splitLeaveWorkingDays` + stałe `PAID_LEAVE_ENTRY_SOURCE='leave_paid'`, `PAID_LEAVE_ENTRY_DESCRIPTION`, `STANDARD_PAID_LEAVE_HOURS=8` (+ 18 testów).
- `lib/actions/internal-leave.ts` — przebudowane `syncAttendanceFromLeave` + helpery (`autoFillPaidLeaveEntries`, `getOrCreateTimesheetForAutoFill`, `recomputeTimesheetHashIfSet`, `removePaidLeaveEntries`) + nowa server-action `getTimesheetBlockedDates(year, month, targetUserId?)` (split-aware źródło blokad).
- `components/internal/TimesheetEditor.tsx` + `TimesheetPreviewDialog.tsx` — blokady dni z `getTimesheetBlockedDates` (zamiast pełnych zakresów `leave_requests`); płatny dzień z puli nie jest blokowany.
- Migracja `20260605000001_phase30b_leave_paid_timesheet_source.sql` — rozszerza CHECK `timesheet_entries.source` o `'leave_paid'`.

**Hash integralności (H2.8):** auto-wpis do **approved** timesheetu (z `pdf_hash`) wymaga przeliczenia hasha, inaczej PDF route zwraca 409. `recomputeTimesheetHashIfSet` przelicza `pdf_hash` przez `computeTimesheetHash` po każdej zmianie wpisów hashowanego timesheetu. `trg_timesheet_unlock_guard` nie blokuje (odpala się tylko przy zmianie statusu approved→inny, nie przy update pdf_hash).

**Pending urlop:** `getTimesheetBlockedDates` traktuje pending zachowawczo (wszystkie dni robocze blokują, jak dotąd) — split (płatne nie-blokują) stosuje się dopiero po `approved`. `quickFillMonth` bez zmian (pomija attendance-blocked + wszystkie pending; approved płatne dni mają już wpis `leave_paid` → pomijane jako istniejące).

**Audit log:** nowy `TIMESHEET_PAID_LEAVE_AUTOFILL` (tylko gdy auto-wpis dotyka non-draft timesheetu — traceability korekt approved/submitted).

**Backfill (2026-05-29, jednorazowo na prod):** 6 approved urlopów B2B z pulą (Anna Korycka 28–29.05; Dominik 5.06 + 15–23.06; Klaudia 8–12.06; Malwina 22–26.06; Michał 22.05 + 29.05) — wszystkie mieszczą się w puli → w pełni płatne. Recompute `paid_days` (część miała stale 0/0 sprzed Phase 30), zwolnienie attendance, auto-wpis `leave_paid`, recompute `pdf_hash` dla maja Michała (jedyny approved+hash; formuła SQL sha256 pre-zweryfikowana 1:1 z JS `computeTimesheetHash`).

**Ops po deploy:** brak nowych cron jobów ani env vars (migracja `source` CHECK + jednorazowy backfill SQL).

## Phase 31 — Premia Champions League (kwartalna, manualna, 2026-06-02)

Piąta kategoria premii (po `sales`/`delivery_lead`/`recruiter`/`custom` z Phase 27b): **`champions_league`** — kwartalny ranking rekrutacyjny zarządu z hard-coded nagrodami za 3 pierwsze miejsca.

**Reguły kwot (hard-coded `CHAMPIONS_LEAGUE_AMOUNTS` w `lib/types/bonus.ts`):**
- 🥇 1. miejsce: **5 000 PLN**
- 🥈 2. miejsce: **3 000 PLN**
- 🥉 3. miejsce: **2 000 PLN**

Admin/manager może nadpisać kwotę w formie (np. 7 000 PLN dla wybitnego osiągnięcia) — ostrzeżenie w UI ("⚠ Nadpisałeś domyślną kwotę").

**Migracja `phase31_champions_league_bonus`:**
- `bonuses.place_rank SMALLINT` (CHECK IN 1/2/3 lub NULL)
- `bonuses.period_quarter SMALLINT` (CHECK 1-4 lub NULL)
- Rozszerzony `bonuses_category_check` o `'champions_league'` (5 kategorii)
- Rozszerzony `bonuses_category_fields_required` o piątą gałąź (CL wymaga `place_rank + period_quarter + period_month=NULL`)
- Partial UNIQUE `bonuses_champions_league_unique (period_year, period_quarter, place_rank) WHERE category='champions_league' AND status='assigned'` — 1 zwycięzca per (rok, kwartał, miejsce); cancel zwalnia miejsce
- Trigger `enforce_bonus_stage_transitions` rozszerzony — INSERT champions_league wymaga period_year+period_quarter (zamiast period_month); UPDATE blokuje zmianę place_rank/period_quarter/category
- `notifications_type_check` += `'champions_league_assigned'`
- Inline smoke test: insert champions_league + update amount + próba zmiany place_rank (expected to fail)

**Workflow (jak Phase 26 — terminal `assigned`, opcjonalny cancel):**
- Admin lub manager (scope: tylko swój zespół, `profiles.manager_id = ja`) przypisuje przez `/internal/admin?tab=bonuses` → drugi button "🏆 Champions League" obok "Przypisz premię" → dedykowany `AssignChampionsLeagueForm` (5 pól)
- Forma auto-prefilluje `amount` przy zmianie miejsca; period selector = past 4 kwartałów + current; recipient list z `listEligibleEmployeesForBonus` (HR-zone, exclude exited/self)
- Po insert: audit `CHAMPIONS_LEAGUE_ASSIGNED` + email złoty (`#EAB308`) + push + in-app (`type='champions_league_assigned'`, kanał `Promise.allSettled`)
- Edit: tylko amount/reason/notes (place/quarter/recipient immutable per trigger); osobny dialog z `AssignChampionsLeagueForm mode='edit'`
- Cancel: jak Phase 26 — `BonusesAdminClient` cancel dialog; audit `CHAMPIONS_LEAGUE_CANCELLED`; email czerwony do recipient

**Pracownik widzi w `/internal?tab=bonuses`** (reuse `MyBonusesPanel`) — wiersz CL ma żółty badge "🏆 Liga Mistrzów" + period "Q1 2026" + szczegóły "🥇 1. miejsce w Champions League" + kwotę.

**Friendly error przy konflikcie miejsca:** jeśli admin/manager próbuje przypisać 1. miejsce w Q1 2026 gdy już ktoś je dostał, server action łapie PostgresError `23505` z constraint `bonuses_champions_league_unique`, robi lookup nazwy istniejącego zwycięzcy i rzuca "🥇 1. miejsce w Q1 2026 jest już zajęte przez Anna Kowalska. Najpierw anuluj poprzednią premię."

**Pliki:**
- Migracja: `COMPASS/supabase/migrations/20260602000001_phase31_champions_league_bonus.sql`
- Backend: `COMPASS/lib/actions/internal-bonus.ts` (extend `assignBonus`, `notifyChampionsLeagueRecipient`, `findChampionsLeagueWinnerName`, `validateChampionsLeagueInput`, `buildCategoryInsertPayload` branch CL)
- Typy: `COMPASS/lib/types/bonus.ts` (`AssignBonusInputChampionsLeague`, `CHAMPIONS_LEAGUE_AMOUNTS`, `championsLeagueAmountForPlace`, `isQuarterInAllowedRange`, `BONUS_QUARTERS_PL`, `CHAMPIONS_LEAGUE_PLACE_LABELS_PL`, `ChampionsLeagueRank`, `Quarter`)
- Email: `COMPASS/lib/email.ts` (`sendChampionsLeagueAssigned` accent złoty `#EAB308`, `sendChampionsLeagueCancelled` accent czerwony)
- UI nowe: `COMPASS/components/internal/AssignChampionsLeagueForm.tsx` (dedykowany, ~280 lines — separat od 997-liniowego AssignBonusForm dla mniejszego ryzyka regresji w istniejących 4 kategoriach)
- UI rozszerzone: `BonusesAdminClient.tsx` (button + dialog + dispatch w edit), `MyBonusesClient.tsx` (badge + period kwartalne), `EmployeeProfileDialog.tsx` (Premie tab z period+miejsce dla CL), `internal-employee-profile.ts` (`BonusHistoryRow` += category/period_quarter/place_rank)

**Audit log akcje (Phase 31):**
- `CHAMPIONS_LEAGUE_ASSIGNED` z payload `{bonus_id, recipient_user_id, place_rank, period_year, period_quarter, amount, currency, reason, category}`
- `CHAMPIONS_LEAGUE_UPDATED` z payload `{bonus_id, recipient_user_id, period_year, period_quarter, place_rank, category, changes: {amount/reason/notes: [old, new]}}`
- `CHAMPIONS_LEAGUE_CANCELLED` z payload `{bonus_id, recipient_user_id, place_rank, period_year, period_quarter, amount, cancellation_reason, category}`

Standardowe `BONUS_ASSIGNED/UPDATED/CANCELLED` zostają dla innych kategorii — split umożliwia łatwe filtrowanie audytu per produkt.

**Ops po deploy:**
1. Aplikuj migrację `phase31_champions_league_bonus` przez Supabase MCP (`mcp__e0e020fb...__apply_migration`). Inline smoke test sprawdzi insert+update+immutability.
2. Brak nowych cron jobów ani env vars.
3. Smoke test prod: admin → przypisz testową Champions League Q1 2026 / 1. miejsce → próba drugiej osoby na to samo miejsce → expect friendly error. Anuluj testową.

**Co świadomie NIE wchodzi:**
- Dashboard analityczny "Hall of Fame" (top 3 per kwartał historycznie) — można w Phase 31.1.
- Konfigurowalne kwoty w UI (hard-coded zostaje).
- Automatyczne wyliczanie rankingu z metryk (Liga jest manualna z definicji).
- Ex aequo split (1 miejsce = 1 zwycięzca, partial UNIQUE wymusza).
- Broadcast email do całej firmy "Nowy zwycięzca!" — TODO follow-up.

## Phase 33 — Kontraktorzy (moduł Talent Community, 2026-06-01)

Przeniesienie 4 plików TCM (Word/Excel) do Compass — pełen cykl opieki nad **kontraktorem u klienta** (zewnętrzny konsultant, NIE user Compass): wejście → onboarding interview → log rozmów → exit interview → zejście. Pełny raport: `docs/kontraktorzy-tcm-completion-report.md`.

**Decyzje:** (1) cały moduł naraz; (2) import historii 2024 idempotentny; (3) **lekka tabela `contractors`** zamiast wpychania w `profiles`/`auth.users` (kontraktorzy mają telefon, nie mail; ~300 zalałoby katalog pracowników i dropdowny); (4) **widoczność tylko `talent_community` + `admin`**.

**Schema (4 migracje addytywne, prod via MCP):**
- `phase33a_contractors` — `contractors` (tożsamość: `full_name` natural-key, phone, current_client, owner_tcm_id, status, `profile_id` leniwy link) + ALTER `placements` (`contractor_id` + pola Wejść) + backfill 17 placementów.
- `phase33b_contractor_conversations` — log rozmów (`category` ← Sprawa, `status` ← kolor: w_toku/rozwiazane/potrzebny_kontakt/pilne, `external_key` dedup) + `notifications.type += 'contractor_followup'`.
- `phase33c_contractor_interviews` — `contractor_onboarding_interviews` + `contractor_exit_interviews` (trigger transition scheduled→submitted→reviewed→archived bez NPS; załączniki inline JSONB; storage reuse `lifecycle-docs` prefiksy `contractor-onboarding/`,`contractor-exit/`).
- `phase33d_client_movements` — `client_entries` (archiwum Wejść 2024, read-only, NIE napędza premii) + `client_departures` (Zejścia hist.+go-forward; who_resigned/przepięcie/replacement/strata).

**RLS wszystkich nowych tabel:** `has_lifecycle_access()` (admin OR talent_community). `placements` BEZ zmian RLS (Phase 28 premie zostają). Importery reużywają `placement_person_aliases`.

**UI:** `/internal/kontraktorzy` (guard `requireTalentCommunityOrAdminLayout`) — zakładki Rozmowy/Kontraktorzy/Wejścia (UNION client_entries+placements)/Zejścia/Statystyki/Import. Karta `[id]`: timeline + onboarding+exit interview (schema-driven, zastępuje 2 docx) + ruchy. Sidebar: grupa „Kontraktorzy" tylko TCM+admin.

**Importery (wzorzec Phase 28):** `lib/contractors/parse.ts` (break po 200 pustych — arkusz Zejścia ma wymiar ~1M wierszy) + `lib/actions/contractor-import.ts` (idempotentne po `external_key`, fuzzy-match recruiter/DL/TCM). Zweryfikowane: Rozmowy 147 / Wejścia 273 / Zejścia 332.

**Coolify cron (do dodania):** `contractor-followup-reminder` — `0 8 * * *` — `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://compass.dynaminds.pl/api/cron/contractor-followup-reminder"` (rozmowy potrzebny_kontakt/pilne/follow_up → push+in-app do owner TCM).

**Ops po deploy:** (1) cron w Coolify; (2) import 3 plików przez `/internal/kontraktorzy` → Import; (3) status rozmów z importu = `rozwiazane` (kolory Excela z conditional-formatting nieczytelne przez `cell.fill.fgColor` — go-forward w UI).

## Phase 34 — Talent Community: hub wg journey + Zadania + Ticket→Zadanie (2026-06-03)

Przebudowa modułu Kontraktorzy (Phase 33) w spójny workspace działu Talent Community ułożony wg ścieżki osoby: **onboarding → opieka → retencja → exit → analiza zejść**, plus przekrojowo skrzynka administracja@ i zadania działowe. Raport: `docs/talent-community-restructure-completion-report.md`.

**Sidebar** (`components/layout/Sidebar.tsx`) — grupa „Talent Community" (TCM + admin), jedna definicja dla obu ról, kolejność wg dnia pracy: **Skrzynka administracja@** (`/admin/inbox`) → **Kontraktorzy** (`/internal/kontraktorzy`, headline) → **Onboarding pracowników (wewn.)** (`/internal/lifecycle` — Phase 22, jasno oznaczone: inna populacja = pracownicy wewnętrzni z kontem) → **Compliance** → **News composer**. Wcześniejsze 3 osobne grupy (tcmGroup/lifecycleGroup/kontraktorzyGroup) + rozsypane linki admina scalone. Inne HR-zone role (internal/finanse/manager) zachowują standalone „Onboarding & Exit".

**Hub Kontraktorów** (`components/internal/kontraktorzy/KontraktorzyHub.tsx` + `panels/`) — zakładki z technicznych (Rozmowy/Wejścia/Zejścia/Statystyki) na **journey**: `Pulpit · Onboarding · Opieka · Retencja · Exit & analiza zejść · Zadania`.
- **Pulpit** — KPI (dashboard) + „wymaga uwagi dziś" (at-risk / follow-up due / onboarding / exit, derived) + **skrzynka administracja@** (open/overdue/unassigned z `getInboxSummary`) + Import (zwinięty).
- **Onboarding** — kolejka kontraktorów `status IN (prospect,onboarding)` + stan wywiadu (`listOnboardingQueue`) + Wejścia (intake).
- **Opieka** — roster + log rozmów (dawne Rozmowy + Kontraktorzy).
- **Retencja** (NEW) — proaktywna worklista zagrożonych, derived z rozmów: `category IN (zejscie,przedluzenie)` lub `status IN (pilne,potrzebny_kontakt)` (helpery `deriveAtRisk`/`isRetentionRisk` w `lib/types/contractor.ts`, bez migracji).
- **Exit & analiza zejść** — kolejka exit interview (`listExitInterviewQueue`) + zejścia + trendy (powody, per klient).
- **Zadania** (NEW) — prosta lista zadań działu.

**Zadania — tabela `contractor_tasks`** (migracja `20260607000001_phase34a_contractor_tasks`): status `todo/in_progress/done`, `assigned_tcm_id`, `due_date`, opcjonalny `contractor_id` (zadanie działowe gdy NULL) i `source_ticket_id` (link do ticketu inboxu). RLS `has_lifecycle_access()` (TCM+admin), trigger `updated_at`, 4 indexy. Akcje `listTasks/createTask/updateTask/deleteTask` w `lib/actions/contractors.ts`; audit `CONTRACTOR_TASK_CREATED/UPDATED/DELETED`. UI: `TaskDialog.tsx` + `panels/ZadaniaPanel.tsx` (delete przez `useConfirm()` z `components/shared/ConfirmDialog`, NIE window.confirm).

**Ticket → Zadanie** — przycisk „Utwórz zadanie z tego zgłoszenia" w `/admin/inbox/[id]` (`components/inbox/TicketToTaskButton.tsx`, tylko TCM/admin) tworzy `contractor_tasks` z `source_ticket_id` = ticket; zadanie ma odnośnik powrotny do `/admin/inbox/{id}`. Tak issue z administracja@ staje się śledzonym zadaniem, które przeżyje zamknięcie ticketu. `getInboxSummary` w `lib/actions/support-inbox.ts` zasila KPI Pulpitu (guard `is_inbox_handler` / admin).

**Ops:** migracja zaaplikowana na prod 2026-06-03 (PR #205); brak nowych cron jobów ani env vars. `database.types.ts` ma ręcznie dodany `contractor_tasks` (FK relationships zsynchronizują się przy najbliższym pełnym regenie). Świadomie poza zakresem: automat handoffu placement→onboarding (dziś = ticket inbox), link ticket↔kontraktor (`support_inbox_meta.contractor_id`), cron SLA breach, scalanie Faz 22/33.

## Phase 35 — Talent Community: 5 sekcji (Sprawy otwarte / Onboarding / Retencja / Offboarding / Analityka) (2026-06-03)

Restrukturyzacja hubu Kontraktorów z 6 zakładek (Phase 34) na **5 sekcji** wg życzenia Artura: **Sprawy otwarte · Onboarding · Retencja · Offboarding · Analityka** (`KontraktorzyHub.tsx`, panele w `components/internal/kontraktorzy/panels/`).
- **Sprawy otwarte** (`SprawyOtwartePanel`) — dzienny worklist: otwarte tickety ze skrzynki administracja@ (lista z linkami do `/admin/inbox/{id}`) + otwarte rozmowy (pilne/potrzebny kontakt/follow-up po terminie) + zadania działu (`ZadaniaPanel` zagnieżdżony). Nowy typ `OpenInboxTicketLite` (`lib/types/support.ts`) + fetch `listInboxTickets()` w `page.tsx` (graceful empty gdy caller nie jest inbox-handler).
- **Onboarding** (`OnboardingPanel`) — bez zmian (kolejka prospect/onboarding + Wejścia).
- **Retencja** (`RetencjaPanel`) — scalone dawne *Opieka* + *Retencja*: zagrożeni (at-risk) + roster + log rozmów.
- **Offboarding** (`OffboardingPanel`) — exit interviews + zejścia (operacyjne).
- **Analityka** (`AnalitykaPanel`) — KPI + liczniki etapów (onboarding/retencja-zagrożeni/offboarding) + trendy (powody zejść, per klient, per TCM) + Import Excel.

Usunięte panele: `PulpitPanel`, `OpiekaPanel`, `ExitPanel` (treść rozdzielona). Zadania nie są już osobną zakładką (żyją w Sprawach otwartych). `getInboxSummary` zostaje w kodzie, ale hub już go nie woła (zastąpione listą ticketów). Bez zmian w DB/API/migracjach.

**Sidebar (`Sidebar.tsx`):** grupa „Talent Community" = **5 deep-linków do zakładek huba** (`/internal/kontraktorzy?tab=sprawy|onboarding|retencja|offboarding|analityka`) + Compliance + Composer News. Skrzynka administracja@ usunięta z sidebara (jest w „Sprawach otwartych"). „Onboarding pracowników (wewn.)" przeniesiony do osobnej grupy „Lifecycle" (pokazywanej teraz dla WSZYSTKICH HR-zone, nie tylko internal/finanse/manager — to inna populacja niż kontraktorzy). Hub czyta `?tab=` (`useSearchParams` + sync `useEffect`); active-state w sidebarze rozpoznaje `?tab=` (default = `sprawy`).

## Phase 36 — Reverse sync: Outlook OOF → auto-pending wnioski urlopowe (2026-06-05)

Kierunek odwrotny do Phase 25 (Compass→Outlook). Pracownicy czasem ustawiają **Out of Office w Outlooku bez wniosku urlopowego w COMPASS** → kalendarz zespołu (czyta tylko `leave_requests`) systemowo niedoszacowuje nieobecności. Cron wykrywa takie luki i tworzy **PENDING** wniosek do akceptacji w normalnej kolejce — **człowiek w pętli, nic auto-zatwierdzane**. Integracja jest teraz dwustronna.

**Mechanizm** (`GET /api/cron/oof-reconcile`, `withCronAuth`, service-role):
1. Skan OOF każdej skrzynki strefy HR przez Graph (`getCurrentOof`; uprawnienia `MailboxSettings.Read` już są — skan zwrócił 37×200).
2. Pomija OOF ustawione przez Compass (marker `compass-managed-oof-v1`) — już mirrorują urlop (Phase 25d).
3. Dla OOF ustawionego ręcznie: brakujące dni robocze = zakres OOF − weekendy − święta (`public_holidays`) − istniejące urlopy (`approved`/`pending` + odrzucony `outlook_oof`).
4. Każdy ciągły run brakujących dni → 1 PENDING `leave_request` (`vacation`, `source='outlook_oof'`); split płatny/bezpłatny jak `createLeaveOnBehalf` (`computePaidUnpaidSplit`).

**Reguła dat OOF:** koniec o północy Warszawy = **exclusive** (Graph/Compass piszą koniec = ostatniDzień+1 @00:00); inny czas = **inclusive** (np. „wracam 16:00"). Konwersja przez `Intl` w `Europe/Warsaw` (DST-safe).

**Idempotencja:** dzień pokryty `approved`/`pending` nie jest ponawiany; odrzucony `outlook_oof` też (żeby nie zapętlić po odrzuceniu przez managera). `alwaysEnabled` / OOF bez dat → flaga w `errors`, **nie zgadujemy** zakresu.

**Schema:** migracja `20260607000002_phase36_leave_source.sql` — `leave_requests.source TEXT` (NULL/`self` / `on_behalf` / `outlook_oof`) + partial index `idx_leave_source_oof`. `created_by` (NOT NULL) = system actor (`OOF_RECONCILE_ACTOR_ID` lub pierwszy admin).

**Pliki:** `lib/oof/oof-dates.ts` (czyste, deterministyczne helpery: konwersja dat + run-grupowanie + 9 testów), `lib/oof/reconcile.ts` (orchestrator skan→split→insert), `app/api/cron/oof-reconcile/route.ts`.

**Coolify cron (dodany 2026-06-05, scheduled_tasks id 15):**

| Nazwa | Schedule | Komenda |
|---|---|---|
| `oof-reconcile` | `0 6 * * *` | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/oof-reconcile"` |

**Weryfikacja (2026-06-05):** live tick — 37 skrzynek, 10 OOF-Compass (pominięte) / 10 OOF-user, `gapsFound=0`, `created=0`, `errors=[]` (0 fałszywych alarmów). Przy okazji dorejestrowano 4 zaległe luki ręcznie przez „Wpisz urlop za pracownika": Klaudia Uliasz 05.06, Michał Stankiewicz 05.06, Marcin Kraszewski 03.06, Dorota Głowczyńska 01.06 (dwie ostatnie jako cały dzień — OOF od popołudnia, możliwe pół dnia, flaga w notatce).

**Opcjonalny env:** `OOF_RECONCILE_ACTOR_ID` — UUID profilu jako `created_by` auto-wniosków (domyślnie pierwszy admin chronologicznie).

**Świadomie poza zakresem:** badge „z Outlook OOF" w UI kolejki wniosków (follow-up — `source` już w DB), obsługa OOF `alwaysEnabled` (wymaga ręcznego wpisu), nudge do pracownika „złóż wniosek". **Reverse sync NIE cofa**: wyłączenie OOF nie kasuje już utworzonego wniosku (rozprzęgnięte).

## Phase 37 — People-ops: scalenie w 2 moduły (Onboarding + Zgłoszenia), usunięcie Compliance/Retencja, analityka typów zgłoszeń (2026-06-05)

Konsolidacja rozsypanego people-ops (Talent Community/Lifecycle/Kontraktorzy + 3 powierzchnie zgłoszeń) w **2 grube moduły + analityka**. PR #216 (główny) + #217 (hotfix). Pełen „full DB merge" zrealizowany jako **read-model** (nie przepisywanie backendu).

**Architektura — read-model + sync triggery (KLUCZOWE):** legacy tabele zostają **źródłem prawdy** (RPC `start_onboarding_for_user`, triggery anonimizacji/transition, RLS, `lifecycle.ts`/`contractors.ts`/`support-*` — **bez zmian**). Zunifikowany store to mirror utrzymywany w spójności przez 6 `AFTER`-triggerów (`SECURITY DEFINER`, exception-safe → nigdy nie blokują legacy write). Nowe huby czytają mirror / komponują istniejące widoki. Zero rewrite backendu, w pełni odwracalne (drop mirror = rollback).

**Migracje (additive, `*_legacy` NIE tworzone — legacy = source of truth):**
- `20260608000001_phase37a` — `onboarding_cases` + `exit_cases` (`person_type` employee|contractor, `person_id` polimorficzny profiles|contractors), backfill **id-preserving**, RLS branched per typ. Mirror BEZ triggerów transition (te są na legacy).
- `20260608000002_phase37b` — kategorie `contractor_conversation`/`contractor_task` + `support_contractor_meta` (1:1), fold rozmów/zadań do `support_tickets` (id = source UUID, idempotentnie), `is_contractor_category()`, RLS `support_tickets` rozszerzona o 3. gałąź `CASE` (inbox→handler / contractor→lifecycle / else→user; inbox+konsultant **verbatim**).
- `20260608000003_phase37c` — 6 sync-triggerów legacy→mirror.

**Aplikacja na prod:** przez Supabase MCP `apply_migration` (atomic). **Branch Supabase startuje pusty** (bez prod-danych) → backfill walidowany read-only SELECT-em na prodzie (status-mapy, 0 kolizji UUID, admin-fallback). Gotcha: `onboarding_progress.cancellation_reason` (NIE `cancelled_reason` — sprawdzaj realny schemat, nie docs).

**UI (reuse komponentów):**
- `/internal/zgloszenia` — Skrzynka (`KanbanBoard`) / Helpdesk (`listTickets`) / Sprawy kontraktorskie (`RetencjaPanel` — log rozmów + roster, treść z usuniętej Retencji).
- `/internal/onboarding` — Pracownicy (queue + `HubActionButtons` + Szablony/Pracownicy/Archiwum) / Konsultanci (`OnboardingPanel` + exit).
- `/internal/analityka` — `getContractorDashboard` (zejścia) + `getTicketTypeAnalytics` (`lib/actions/zgloszenia-analytics.ts` — typy/status/priorytet z **scalonego** `support_tickets`).
- `Sidebar.tsx`: Talent Community = 4 linki (Zgłoszenia / Onboarding & Exit / Analityka / Composer News); `lifecycleGroup` tylko dla internal/finanse/manager (TCM+admin używają nowego huba).

**Usunięcia (bez utraty danych):** `/admin/compliance` → redirect `/home` (tabele `um_*` + akcje logowania zostają — RODO); Retencja zakładka znika (`deriveAtRisk` zachowany); `/internal/kontraktorzy` (5 zakładek) → redirect `/internal/onboarding` (karty `[id]` bez zmian).

**Gotcha (#217):** rozmowy zmirrorowane do `support_tickets` zanieczyszczały helpdesk — `listTickets` musi wykluczać też `contractor_%` (nie tylko `inbox_%`). Wzorzec: **każdy broad reader `support_tickets` poza inboxem/analityką wyklucza `inbox_%` ORAZ `contractor_%`**.

**Follow-up (świadomie nie zrobione):** „contract step" = migracja backendu na czytanie mirror + drop legacy (duży, osobny — teraz legacy działa jako źródło prawdy). Patrz pamięć [[supabase-branch-empty-validate-readonly]].

## Phase 38 — Talent Community: 5 elementów + upload plików wywiadów (PR #222, 2026-06-05)

Rozbicie people-ops kontraktorskiego (Phase 37 scaliło je w Zgłoszenia + Onboarding&Exit) z powrotem na **5 dedykowanych elementów** wg ścieżki życia kontraktora, wszystkie w sidebarze. **Bez migracji** — reużywa tabel Phase 33 + bucketu `lifecycle-docs` (Phase 33c). Pełny raport: `docs/talent-community-5-elementow-completion-report.md`.

**Sidebar (TCM + admin):**
- **Talent Community** = Rozmowy / Onboarding / Exit / Kontraktorzy (zakładki huba `/internal/kontraktorzy?tab=…`) + **Analityka** (osobny route `/internal/analityka`) → 5 linków.
- Nowa grupa **„Komunikacja"** = Zgłoszenia (skrzynka administracja@ + helpdesk) + Composer News — wydzielone z TC, nic nie usunięto („Zostaw osobno").
- **„Pracownicy wewnętrzni"** (Lifecycle, Phase 22 — inna populacja) widoczne teraz też dla TCM/admin (`/internal/lifecycle`).

**Elementy (4 zakładki huba `KontraktorzyHub` + panele w `components/internal/kontraktorzy/panels/`):**
- **Rozmowy** (`RozmowyPanel`) — Zagrożeni (`deriveAtRisk`) + Logi rozmów (`contractor_conversations`) + import rozmów. (Roster wyszedł stąd do osobnego elementu Kontraktorzy.)
- **Onboarding** (`OnboardingEntriesPanel`) — Wejścia (feed) + tabela Onboarding (przepisane Imię/Klient/Stanowisko/Rekruter/Start + **upload pliku „Onboarding interview"** per wiersz) + import wejść.
- **Exit** (`ExitPanel`) — Zejścia (pełne kolumny) + Exit Interview (przepisane Imię/Klient/Stanowisko + **upload pliku „Exit Interview"**) + import zejść.
- **Kontraktorzy** (`KontraktorzyRosterPanel`) — aktualni kontraktorzy ze stawkami: Imię, Klient, Rekruter, **Delivery Lead**, Data wejścia, **Stawka przychodowa/kosztowa, Marża**.

**Źródła danych (nowe akcje w `lib/actions/contractors.ts`):**
- `listContractorRoster()` — `placements` (status ≠ cancelled) ∪ `client_entries` (archiwum 2024), dedup po kluczu naturalnym (konsultant+klient+start), placement wygrywa. Stawki/DL/marża z tych tabel (NIE z `contractors`).
- `listOnboardingEntries()` / `listExitDepartures()` — wejścia/zejścia wzbogacone o `contractor_id` + najnowszy wywiad (status + `attachments`).

**Upload plików wywiadów (nowa funkcja — kolumna `attachments` JSONB istniała od Phase 33, brakowało UI/akcji):**
- `uploadContractorInterviewFile(formData)` → upload do `lifecycle-docs/contractor-{onboarding|exit}/{contractorId}/`, dopina do `attachments` najnowszego wywiadu (tworzy wywiad gdy brak). Gdy wiersz niepowiązany — **find-or-create kontraktora po nazwisku** (`resolveOrCreateContractor`, normalizacja `normalizeContractorName`) + podlinkowanie wejścia/zejścia (`placements`/`client_entries`/`client_departures`).
- `removeContractorInterviewFile` + `getContractorInterviewFileUrl` (signed URL 5 min). Walidacja ≤10 MB, PDF/Word/Excel/obrazy. Service client po guardzie (`requireLifecycleManagerAction`). Komponent `InterviewFileCell`.

**Routing:** `kontraktorzy/page.tsx` z redirectu → ładowanie danych + `KontraktorzyHub` (4 zakładki); `[id]` detail bez zmian. `onboarding/page.tsx` → redirect `?tab=onboarding`. `/internal/analityka` i `/internal/zgloszenia` bez zmian.

**Audit log:** `CONTRACTOR_ONBOARDING_INTERVIEW_FILE_UPLOADED`, `CONTRACTOR_EXIT_INTERVIEW_FILE_UPLOADED`, `CONTRACTOR_INTERVIEW_FILE_REMOVED`.

**Loose ends (świadomie):** widok **Zadań** (Phase 34) zniknął z huba (nie ma w 5-elementowej specyfikacji; tworzenie z ticketu `TicketToTaskButton` nadal działa, brak widoku). Kilka osieroconych plików-paneli zostawione jako martwy kod (build przechodzi) — cleanup follow-up. Upload anchoruje do kontraktora, nie do konkretnego wejścia (wystarczające dla 1 bieżącego wejścia/osobę).

## Phase 39 — Exit: Bench + filtr Zejść + auto-update z SharePoint (2026-06-08)

Rozszerzenie zakładki **Exit** (Phase 38) o tabelę **Bench** (konsultanci między projektami) + przeporządkowanie tabel + filtr Zejść. Dwie fazy:

### Faza A (zrobiona) — Bench + filtr Zejść + kolejność

Kolejność tabel w Exit: **Bench → Exit Interview → Zejścia**.

**Bench** (`contractor_bench`, migracja `phase39a_contractor_bench`) — worklista osób po zejściu (lub schodzących wkrótce), którym szukamy projektu. **Hybryda:** auto-seed z `client_departures` (zejścia ostatnich ~90 dni + przyszłe/bez daty, idempotentnie przez unikalny `departure_id`) + ręczne dodanie (`source='manual'`, `departure_id NULL`). Kolumny: Imię, Klient, Rola, Data zejścia, Data wypowiedzenia + **edytowalne**: `status` (`w_rekrutacji`/`przepiety`/`zakonczenie_umowy`) i `benefits` (`aktywne`/`nieaktywne`/`do_wygaszenia`). `dismissed_at` = soft-remove (zachowuje slot, żeby auto-seed nie dodał ponownie). Domyślny widok = aktywni (`w_rekrutacji`); toggle „Pokaż wszystkich" odsłania resolved. RLS `has_lifecycle_access()`. Auto-seed odpala się przy `listBench()` (na load zakładki) — idempotentny, kolejne loady nie wstawiają nic gdy brak nowych zejść. ~42 kandydatów z 331 zejść (okno 90 dni).

**Zejścia** — domyślnie tylko **bieżący + następny miesiąc** (filtr klient-side po `departure_date`), przycisk **„Pokaż pełną"/„Pokaż skróconą"**. Exit Interview bez zmian (pełna lista z uploadem).

Pliki: migracja + `contractor_bench` w `database.types.ts` (ręcznie, jak `contractor_tasks`); typy + akcje `listBench`/`addBenchEntry`/`updateBenchEntry`/`dismissBenchEntry` w `contractors.ts`; `BenchPanel.tsx` (edytowalne dropdowny optymistycznie + toggle + dismiss), `BenchDialog.tsx` (ręczne dodanie); `ExitPanel.tsx` przeporządkowany + filtr Zejść; hub + `page.tsx` ładują `listBench()`. Audyt: `BENCH_ENTRY_ADDED/UPDATED/DISMISSED`.

### Faza B (zrobiona) — auto-update Wejść/Zejść z SharePoint/Graph

Tabele Wejścia/Zejścia **same aktualizują się raz dziennie** zaciągając plik **„Wejścia i zejścia od klientów 2024.xlsx"** (jeden skoroszyt, 2 arkusze: „Wejścia do klientów" + „Zejścia od klientów") z SharePoint site **B2BKlienci** przez Graph (app-only).

- **Uprawnienie:** Graph **`Sites.Read.All`** (Application) nadane app Compass (`17f9ff8c-...`, SP `90ea31d8-...`) przez `az rest` appRoleAssignment (id `2DHqkIjINE…`). Least-privilege dla SharePoint (węższe niż Files.Read.All; **NIE** dotyczy RAOP/CompassMailSenders — to Exchange-only). Hardening na przyszłość: `Sites.Selected` scoped do B2BKlienci.
- **Pobranie:** `lib/graph/sharepoint.ts` → `downloadSharedWorkbook(shareUrl)` = `GET /shares/{u!token}/driveItem/content` (`responseType('arraybuffer')`). Token = base64url(url) z prefiksem `u!`.
- **Import:** rdzeń wyciągnięty do `lib/contractors/import-core.ts` (plain module, NIE 'use server') — `importWejsciaFromBuffer`/`importZejsciaFromBuffer`/`importRozmowyFromBuffer` (bufor + `actorUserId`), idempotentne (upsert po `external_key`). `lib/actions/contractor-import.ts` to teraz cienkie wrappery (guard + FormData + revalidate) nad tym rdzeniem — manual import i cron dzielą tę samą logikę. **Każdy parser sam znajduje swój arkusz** (`findSheet` po nagłówkach), więc jeden bufor obsługuje oba.
- **Cron:** `GET /api/cron/tc-sync` (`withCronAuth`, Bearer `CRON_SECRET`, `maxDuration 240`). Pobiera plik → importuje oba arkusze niezależnie → `revalidatePath(HUB)`. Zwraca JSON `{ok, bytes, wejscia:{inserted,...}, zejscia:{...}}`.
- **Env (Coolify, runtime):** `TC_SYNC_FILE_URL` = sharing link do skoroszytu (wymagany); `TC_SYNC_USER_ID` = profil dla `imported_by`/audytu (opcjonalny, fallback = najstarszy admin).
- **Coolify schedule:** `tc-sync` — `0 5 * * *` (05:00 UTC daily) — `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://compass.dynaminds.pl/api/cron/tc-sync"`.
- **Semantyka:** **additive** (jak manual import) — nowe wiersze w pliku trafiają do `client_entries`/`client_departures`; usunięcia/edycje pól kluczowych (`external_key`) nie propagują (świadome ograniczenie v1; dedup ręczny lub follow-up). Re-runy bezpieczne (idempotent).

## Phase 41 — Przekierowanie poczty do zastępcy na czas urlopu (2026-07-20)

Phase 25 wymieniała zastępcę w treści auto-reply OOF, ale poczta nieobecnej osoby leżała w jej skrzynce do powrotu. Teraz po akceptacji urlopu z zastępcą COMPASS zakłada w skrzynce pracownika **regułę Outlooka** (Graph `messageRule`) kopiującą przychodzącą pocztę do zastępcy, a po urlopie ją kasuje.

**Semantyka:** `forwardTo` (kopia — oryginał zostaje u właściciela, po powrocie ma komplet poczty), NIE `redirectTo`.

### KRYTYCZNE: reguła skrzynki nie ma warunków czasowych

`messageRulePredicates` nie zawiera **żadnego** pola daty/harmonogramu — reguła jest niezależna od `automaticRepliesSetting`. Ustawienie OOF na 10–20.07 nie ogranicza reguły do tego okna. Skutki projektowe:
- OOF wystarczał jeden PATCH przy akceptacji (Exchange sam pilnuje `scheduledStart/End`); forward tak **nie umie** — okno otwiera i zamyka cron.
- Nieudane zamknięcie = przekierowanie w nieskończoność → **sprzątacz sierot jest częścią systemu, nie opcją**.
- ID reguły MUSI być trwale zapisane (`leave_requests.outlook_forward_rule_id`), a `displayName` zawiera UUID urlopu (`COMPASS · zastępstwo · <leaveId>`), żeby sprzątacz rozpoznał regułę, której ID zgubiliśmy.

**Uprawnienia — bez zmian w Entra/Exchange.** POST i DELETE `/users/{upn}/mailFolders/inbox/messageRules` wymagają `MailboxSettings.ReadWrite` (Application) — dokładnie tego, którym Phase 25 PATCH-uje OOF na tych samych skrzynkach. Docs: „Higher privileged permissions: Not available".

### Okno przekierowania

`shouldForwardBeActive` (`lib/oof/forward-window.ts`, czysty, `now` wstrzykiwany): `approved` ∧ `substitute_id` ∧ `start_date <= warsawDziś` ∧ `end_date >= warsawDziś`.

Okno = **sam urlop**, nigdy wcześniej. Pierwotnie otwierało się dzień wcześniej (żeby cron o 06:00 UTC zdążył przed pierwszym rankiem urlopu), ale to znaczyło, że akceptacja wniosku od razu przerzucała pocztę na zastępcę, choć pracownik jeszcze siedział przy biurku — zgłoszone z produkcji 2026-07-20 (urlop 21.07 zaakceptowany 20.07, zastępczyni dostawała pocztę już od akceptu). Przekierowanie należy do urlopu, nie do decyzji o nim.

Koszt tej zamiany: **luka pierwszego ranka** — reguła powstaje dopiero gdy przejdzie cron, więc poczta z przedziału północ–przebieg crona nie zostanie skopiowana (u właściciela zostaje, bo forward kopiuje). Skracać przez **wcześniejszy cron**, nie przez otwieranie dzień wcześniej. Przy `0 6 * * *` luka to 00:00–08:00 czasu warszawskiego; `0 3 * * *` zbija ją do 00:00–05:00 (noc). `warsawTomorrow` zostaje wyeksportowany jako escape hatch, gdyby kiedyś wracać do starego kompromisu.

**Daty liczone w Europe/Warsaw**, nie UTC (`warsawDate()` wyeksportowany z `oof-dates.ts`) — forward przełącza się na granicy dnia, więc `toISOString().slice(0,10)` myliłby się o dobę wieczorami.

### Pliki

- `lib/mailbox/graph-inbox-rules.ts` — `createForwardRule` / `deleteForwardRule` (**404 = sukces**) / `listCompassForwardRules` (`null` przy błędzie, bez retry) + czyste `buildForwardRuleName` / `parseLeaveIdFromRuleName`. Reguła: bez `conditions`, `stopProcessingRules: false` (własne reguły użytkownika muszą dalej działać), `exceptions: {isAutomaticReply, isAutomaticForward}` (ochrona przed pętlą A→B→A).
- `lib/mailbox/forward-rule-sync.ts` — plain module (NIE 'use server') z `openForwardRule`/`closeForwardRule`; wspólny dla akcji i crona. Kolumna zerowana **tylko** gdy Graph potwierdzi usunięcie — inaczej żywa reguła zostałaby bez wskaźnika.
- `lib/oof/forward-rules.ts` — `reconcileForwardRules`: OTWÓRZ / ZAMKNIJ / SPRZĄTACZ SIEROT (`MAX_SWEEP_PER_RUN = 100`, roster = `HR_ROLES` z `reconcile.ts` + filtr `exited`/`offboarding` w JS).
- Wpięcia w `lib/actions/internal-leave.ts`: `approveLeaveRequest` (lookup zastępcy wyciągnięty poza blok `shouldSetOof`), `createLeaveOnBehalf`, `cancelMyLeaveRequest`, `cancelTeamLeave`, `updateTeamLeave`, `retryLeaveGraphSync` (zwraca teraz `{oof, calendar, forward}`).

**`updateTeamLeave` była najostrzejszą krawędzią** — zmieniała daty i `substitute_id` z zerową resynchronizacją Graph. Bez Phase 41 edycja zastępcy zostawiałaby regułę celującą w **poprzednią osobę**. Teraz: skasuj starą → załóż nową (awaited, żeby nie było dwóch żywych reguł).

### Cron

Doklejone do istniejącego `oof-reconcile` (**bez nowego harmonogramu w Coolify**, nadal `0 6 * * *`). Route: każda połowa w osobnym `try/catch` (wcześniej nie miał żadnego → rzut = gołe 500 bez Sentry), `maxDuration` 120 → **240**, Sentry eskalowany dopiero gdy padły obie połowy. Odpowiedź: kształt Phase 36 na górnym poziomie + `forward: {opened, closed, orphansRemoved, sweptMailboxes, errors}`.

### Phase 41b — forward idzie pierwszy + heartbeat w audit_logs (2026-07-22)

Zgłoszenie z produkcji: po zakończonym urlopie Marleny Rosół zastępczyni (Klaudia) **dalej** dostawała jej pocztę, a trzy trwające urlopy (Marcin/Michał/Błażej) **nie miały** reguł wcale. Diagnoza z bazy: forward-owa połowa crona nie zostawiła **żadnego** śladu — zero `LEAVE_FORWARD*` z `via:cron` przez ≥2 poranne przebiegi, mimo że ścieżka approve działała (reguła Marleny powstała 20.07). Błąd forward-owej połowy żył **wyłącznie w odpowiedzi HTTP** (route go łapie, ale nigdzie nie persystuje), więc z samej bazy nie dało się odróżnić „cron nie odpala" od „forward pada po starcie". Dwie zmiany:

1. **Kolejność w route: forward PRZED OOF.** OOF czyta ~37 skrzynek sekwencyjnie bez per-call timeoutu; jedna zawieszona skrzynka potrafi zjeść cały `maxDuration`, a runtime ubija request **zanim** dojdzie do forward (linia z `reconcileForwardRules`) — bez wyjątku, bez Sentry, bez śladu. To najlepiej tłumaczy „zero efektu, zero logu". Forward jest tańszy (listing reguł per skrzynka, DB-bounded), więc kończy szybko i zostawia budżet OOF-owi.
2. **Heartbeat `FORWARD_RECONCILE_RUN` w `audit_logs`** — jeden wpis `phase:'start'` na wejściu do `reconcileForwardRules`, jeden `phase:'done'` (ze statystykami + `errors`) na wyjściu. To **jedyny czytelny z bazy** dowód, że połowa się wykonała. Wzorzec diagnozy: `start` bez `done` = request ubity w locie (timeout); brak `start` = cron w ogóle nie dosięgnął forward (→ problem harmonogramu Coolify); `done` z `errors` = dokładny komunikat błędu bez potrzeby `CRON_SECRET`. `logAudit` nigdy nie rzuca, więc heartbeat sam z siebie nie zepsuje przebiegu.

**Znany dług operacyjny (poza tym PR, wymaga dostępu do prod):** stara reguła Marleny (`57da4f35...`, `outlook_forward_rule_id=AQAAAOXg7Hg=`) wisi w jej skrzynce — zamknie ją dopiero pierwszy sprawny przebieg forward-reconcile (pass 2 „close", bo `end_date < dziś`) **albo** ręczne usunięcie w Outlooku (Ustawienia → Poczta → Reguły → „COMPASS · zastępstwo · 57da4f35..."). Ten sam przebieg dołoży brakujące reguły Marcinowi/Michałowi/Błażejowi (pass 1 „open"). Weryfikacja po deployu: `select action, details from audit_logs where action='FORWARD_RECONCILE_RUN' order by created_at desc` — jeśli po 06:00 UTC nie ma wiersza `start`, cron nie odpala forward i trzeba sprawdzić `scheduled_tasks` w `coolify-db`.

### Audit log

`LEAVE_FORWARD_SET` / `LEAVE_FORWARD_FAILED` / `LEAVE_FORWARD_DISABLED` / `LEAVE_FORWARD_ORPHAN_REMOVED`. Błędy lądują w `graph_sync_error` z prefiksem `forward:` (obok `oof:` / `calendar:`), więc kolejka „problemy z synchronizacją" i przycisk retry działają bez zmian.

### Ops po deploy

1. **Smoke test PRZED merge** (RAOP potrafi blokować mimo poprawnych uprawnień — historia w Phase 44, szczegóły w `git log` Faz 26b→26d): app-only POST reguły z `isEnabled:false` na jedną skrzynkę → oczekiwane 201, potem DELETE → 204. Przy `403 [RAOP]` sprawdzić `Get-ApplicationAccessPolicy` i `CompassMailSenders`.
2. Migracja `20260720102237_phase41_leave_forward_rule` zaaplikowana na prod 2026-07-20 (addytywna, nullable TEXT + partial index).
3. **Pierwszy przebieg crona założy reguły od razu na skrzynkach trwających urlopów z zastępcą** (w chwili wdrożenia: 3). To nie jest stopniowy rollout — warto uprzedzić te osoby.

## Phase 42 — Analityka zejść kontraktorów (trend miesięczny + widoczne powody, 2026-07-27)

Dział Talent Community nie miał odpowiedzi na „ile osób schodzi w miesiącu" i „dlaczego": Analityka liczyła
wyłącznie all-time (jedyny licznik miesięczny to pojedyncza liczba w kaflu Exit interviews na Pulpicie),
a kolumna „Powód" renderowała `client_departures.reason` — wypełniony w **4 z 333** wierszy. Realne opisy
siedzą w `comment` (**318/333**), bo importer mapuje arkuszowy „Komentarz" właśnie tam
([parse.ts](COMPASS/lib/contractors/parse.ts)) i ta kolumna nie była pokazywana nigdzie.

**Bez migracji, bez cronów, bez env-varów** — dane produkcyjne nietknięte, cała zmiana to odczyt i prezentacja.

- `lib/contractors/departure-analytics.ts` — czyste funkcje (wzorzec `health-snapshot.ts`, `now` wstrzykiwany):
  `resolvePeriodRange` · `filterDepartures` · `buildMonthlyDepartureSeries` · `summarizeDepartures` ·
  `buildDepartureAnalytics` (składa cały wynik). Daty porównywane jako stringi `YYYY-MM-DD`.
- `getDepartureAnalytics` / `exportDeparturesCsv` w `lib/actions/contractors.ts` — jeden SELECT, agregacja w JS.
  `getContractorDashboard` bez zmian.
- UI: `/internal/people?tab=analityka` → `DepartureAnalyticsSection` (stacked BarChart 12 mies. wg
  „kto zrezygnował", tabela miesiąc × kategoria, kafle liczone w okresie, filtry przez query string, CSV).
- Tabela Zejść (`ExitPanel`) pokazuje `reason ?? comment`.

**Trzy pułapki, na które uważać przy zmianach tutaj:**
1. **Trend celowo ignoruje filtr okresu** (inaczej „Ten miesiąc" zostawiłby jeden słupek), ale respektuje
   klienta/rekrutera — stąd dwa różne zbiory w `buildDepartureAnalytics`.
2. **`withoutDate` liczy się z `trendRows`, nie z `filtered`** — wiersze bez daty wypadają z każdego zakresu,
   więc liczone z `filtered` byłyby zawsze 0 (kafel jakości danych ma pokazywać stan globalny).
3. **Granice okresów wg kalendarza warszawskiego** (`warsawNow()` → `warsawDate`) — serwer chodzi w UTC,
   więc 1. dnia miesiąca nad ranem „Ten miesiąc" pokazywałby poprzedni.

Świadomie poza zakresem: backfill `reason := comment` i zmiana mapowania importera · słownik kategorii
przyczyn (budżet / niedopasowanie / lepsza oferta) · ożywienie `contractor_exit_interviews` (0 rekordów —
bez zmiany procesu TCM sam kod nic nie da).

## Phase 42a — Kanonizacja nazw klientów i osób przy imporcie (2026-07-27)

Arkusze TCM są uzupełniane ręcznie od lat, więc ta sama firma miała po kilka zapisów
(`Nordea`/`NORDEA`, `Xperi`/`XPERI`/`Xperii`, `BNP`/`BNP Paribas`, `PKO`/`PKO BP`, 5 wariantów e-zdrowia),
a rekruterzy literówki (`Aleksandra Borzecka`, `lza Grabińska`, `MIchał Walasek`). Statystyki liczyły każdy
wariant osobno.

**Słownik: [`lib/contractors/name-normalization.ts`](COMPASS/lib/contractors/name-normalization.ts)** —
`CLIENT_ALIASES` + `STAFF_ALIASES` (rekruterzy, Delivery Leadowie i TCM to jedna pula) + `normalizeClientName`
/ `normalizeStaffName`. Wpięte w **parsery** (`lib/contractors/parse.ts`, `lib/placements/parse-xlsx.ts`),
więc kanonizacja obejmuje też `external_key` i `contractors.current_client`. Nowy wariant = jedna linijka + deploy.

**Cztery rzeczy, o których trzeba wiedzieć przy zmianach tutaj:**
1. **Pisownia kanoniczna zgadza się z tabelą `clients`** (Phase 27d, dropdowny premii) — stąd wersaliki
   w `ATOS`/`BOSCH`/`ERGO`/`NORI`/`ORLEN`/`XPERI` i małe `e-zdrowie`. To nie kaprys: dwie listy klientów
   w jednej aplikacji byłyby gorsze niż nieidealna pisownia marek. Dodając alias, sprawdź `clients`.
2. **`external_key` zawiera nazwę klienta** (`importExternalKey('dep', nazwisko, klient, data)`), więc
   zmiana aliasu zmienia klucz idempotencji. Bez przeliczenia w bazie ponowny wgrany ten sam plik wstawi
   duplikaty. Wzorzec backfillu: migracja `20260727120000_phase42a_*` — odtwarza FNV-1a w SQL i **przed**
   jakąkolwiek zmianą sprawdza, że replika zgadza się z każdym istniejącym kluczem (rozjazd → `RAISE
   EXCEPTION` + rollback). Przed pisaniem sprawdź też kolizje UNIQUE (`client_departures`, `client_entries`,
   `idx_placements_natural_key`).
3. **Kontrola wymaganych pól musi iść PO normalizacji** (parser placementów). Znacznik „nikt" (`-`, `ND`)
   normalizuje się do `null`; gdyby walidacja szła na surowej wartości, `-` przeszedłby ją i wywalił się
   dopiero przy dopasowaniu profilu. Detekcja pustego wiersza zostaje na surowych wartościach — inaczej
   wiersz z samym `-` zniknąłby po cichu zamiast dać błąd.
4. **Nie zgadujemy przy imionach bez nazwiska.** `Igor` ma jednego właściciela → mapowany. `Klaudia`
   (Uliasz vs Grelak) i `Marcin` (Kraszewski vs Kurowski) zostają nietknięte — scalenie zafałszowałoby
   ranking per rekruter. Tak samo osobne byty: `BNP Paribas Cardif` ≠ `BNP Paribas` (spółka
   ubezpieczeniowa grupy, choć jej własne warianty `Cardif` / `BNP Cardif` scalamy w pełną nazwę),
   `Centrum e-Zdrowia` ≠ `e-zdrowie`, kontrakty dzielone `BOSCH/Nordea` i `Frontex / Atos`.

**Poza zakresem:** `contracts`, `support_inbox_meta`, `profiles.previous_clients` ·
`client_departures.manager_raw` (manager po stronie klienta, nie nasza pula osób) ·
`contractor_conversations.tcm_raw` objęte (Phase 42a), ale bez mapowania „Paula" — brak nazwiska w bazie.

### Domknięcia 42b–42e (2026-07-27)

Cała reszta łańcucha nazw, w kolejności: **42b** literówki w słowniku `clients` (`PEFRON` → `PFRON`;
`Mnisterstwo` usunięte jako duplikat `Ministerstwo Sprawiedliwości`) plus ta sama literówka w 2 premiach,
do których wyciekła z dropdownu · **42c** kanonizacja `bonuses.client_name` (`NORDEA`+`Nordea` → 56 premii,
12 nazw → 8) plus `normalizeClientName` w `buildCategoryInsertPayload`, bo formularz premii ma opcję
„Inny (wpisz ręcznie)" · **42d** `BNP Cardif` → `BNP Paribas Cardif` w słowniku · **42e** `Cardif` →
`BNP Paribas Cardif` i `Metlife` → `MetLife` we wszystkich tabelach.

**Wnioski na przyszłość:**
- **Słownik `clients` nie jest „tylko listą"** — zasila dropdown premii, więc literówka w nim wycieka
  do danych finansowych. Poprawiając nazwę tam, sprawdź `bonuses.client_name`.
- **Zmiana wielkości liter nie rusza `external_key`** (hash liczy po `lower()`), ale zmiana treści nazwy
  tak. `Metlife` → `MetLife` nie wymagało przeliczenia, `Cardif` → `BNP Paribas Cardif` już tak.
- **Migracje ruszające dane premiowe zostawiają wpisy w `audit_logs`** (`source: migration phase42*`,
  para `[przed, po]` w `changes`) — nie ma zalogowanego użytkownika, więc ślad musi zrobić migracja.

## Phase 43 — Archiwizacja pracownika naprawdę archiwizuje (PR #272, #290, #292, 2026-07-27)

Do lipca 2026 archiwizacja pracownika (`employment_status='exited'`) była **wyłącznie kosmetyką
po stronie UI**, i to dziurawą. Kalendarz zespołu pokazywał osoby, które odeszły miesiące temu,
bo składał listę wyłącznie po `role` — a archiwizacja roli nie zmienia. Audyt wszystkich 274
zapytań do `profiles` pokazał, że kalendarz nie był wyjątkiem, tylko jedynym miejscem, gdzie
akurat było to widać.

### KRYTYCZNE: archiwizacja odbiera dostęp do aplikacji

Kliknięcie **Archiwizuj** w Administracji HR od 2026-07-27 **natychmiast odcina człowiekowi
logowanie**. Wcześniej konto dalej przechodziło autoryzację — nigdzie w middleware ani
w guardach nie sprawdzaliśmy `employment_status`, więc broniło nas tylko wyłączenie konta
w M365. To cudza procedura poza COMPASS-em, która w dodatku **nie dotyczy logowania hasłem**
(konsultanci spoza `@b2bnetwork.pl` nie mają M365).

Reguła siedzi w [`lib/auth/employment-access.ts`](COMPASS/lib/auth/employment-access.ts).
Trzy warstwy egzekucji, bo każda łapie co innego:

| Warstwa | Co obejmuje | Czego nie |
|---|---|---|
| `app/auth/callback/route.ts` + `app/login/actions.ts` | Odrzuca zanim powstanie sesja | Sesji już otwartych |
| `middleware.ts` | Każde żądanie → pada sesja otwarta w chwili archiwizacji. **Jedyna warstwa obejmująca server actions** (POST na ścieżkę strony), więc stara karta nie wywoła akcji | `/api/**` — wycięte z matchera |
| `lib/api/with-auth.ts` | Route'y user-facing pod `/api/**` | — |

**Blokuje `exited`, NIE `termination_date < dziś`.** Offboarding trwa po ostatnim dniu pracy —
pracownik ma jeszcze wypełnić exit interview, a datę zejścia wpisuje się z wyprzedzeniem.
Do tego literówka w dacie zamykałaby dostęp żywemu pracownikowi. Blokuje więc jawny akt
archiwizacji. **`offboarding` przechodzi wszędzie.**

**Brak statusu / brak profilu NIE blokuje.** Gdyby odczyt profilu padł albo trafił na świeże
konto bez wiersza, blokada „na wszelki wypadek" wylogowałaby całą firmę.

**Wylogowanie jest best-effort** — gdyby `signOut()` padł, blokada i tak trzyma, bo middleware
przelicza ją przy każdym żądaniu. Bezpieczeństwo nie stoi na powodzeniu czyszczenia ciasteczek.

`needsProfile` w middleware rozszerzone z listy ścieżek na **każdą niepubliczną** — inaczej
blokada miałaby dziury tam, gdzie akurat nie potrzebowaliśmy roli (`/messages`, `/profile`,
`/documents` ten SELECT pomijały). Koszt: jeden lookup po PK. Wszystkie redirecty zależne od
roli są path-scoped, więc szerszy fetch nie zmienia niczego poza samą blokadą.

### DWIE REGUŁY filtrowania list ludzi — łatwo ujednolicić w złą stronę

Dodając zapytanie do `profiles` zwracające wielu ludzi, wybierz świadomie:

- **Listy „tu i teraz"** (adresaci komunikatora, dropdowny przypisania, rozsyłki powiadomień,
  crony mailowe) → `.neq('employment_status', 'exited')`. Tak robią już payroll, stawki,
  premie, placementy, urlop za pracownika, kolejka timesheetów.
- **Widoki i raporty miesięczne** (kalendarz zespołu, `payroll-export`) →
  `filterEmployedInMonth` z [`lib/hr/employment-window.ts`](COMPASS/lib/hr/employment-window.ts),
  czyli „czy pracował w TYM miesiącu". Człowiek wypada dopiero od miesiąca PO ostatnim dniu pracy.

**Oba kierunki błędu bolą.** Ślepe `neq('exited')` w raporcie miesięcznym wycina kogoś
z miesiąca, który przepracował — kto odszedł 20-go, **musi** zostać w payrollu za ten miesiąc.
Brak filtra w liście zostawia archiwum na zawsze — dokładnie to robił kalendarz.

Naprawione w #290 (11 miejsc): komunikator (`getAllUsersToMessage`, `searchUsersToMessage` —
jedyny **żywy** wyciek, reszta nie strzelała przez zbieg okoliczności), crony
`timesheet-reminder` i `clock-daily-summary`, `payroll-export`, `listManagerCandidates`,
dropdowny TCM (`listTcmProfiles`, `loadTcmOptions`, ticket→zadanie w inboxie, planner),
`listHandlers` skrzynki, powiadomienia przy publikacji newsa.

**Celowo pokazują archiwum:** Administracja HR → Pracownicy (jawny filtr Aktywni / Nieaktywni /
Wszyscy, domyślnie Aktywni), `/internal/lifecycle` (archiwum), People Ops.

### Poza zakresem (znane, świadomie nietknięte)

- **Brak backingu RLS** — wszystkie filtry są app-layer. Uwierzytelniony użytkownik odpytujący
  `profiles` bezpośrednio nadal zobaczy zarchiwizowanych. Zgodne z resztą architektury.
- **`people-sync.ts` nie wykrywa odejść** — wyłączone konto w Graph nie ustawia `exited`,
  archiwizacja zostaje aktem ręcznym w Administracji HR.
- **Konta `pending`** (zaproszone, jeszcze nie zaczęły) nie są wykluczane z rozsyłek.
- **`listProposableRecipients`** ([internal-bonus.ts](COMPASS/lib/actions/internal-bonus.ts)) —
  martwy kod po Phase 23, zero wywołań.
- `?error=account_archived` w URL-u ujawnia istnienie konta. Świadomie: przy SSO Microsoft
  odrzuca wcześniej, a generyczny komunikat kazałby komuś błędnie zarchiwizowanemu myśleć,
  że aplikacja jest zepsuta, zamiast pójść do HR.

## Phase 46 — Mapa technologiczna (TCM tech-intel, Etap 1 MVP, 2026-08-03)

Strukturalne karty rozmów TCM z kontraktorami u klientów (skrypt: blok A zawsze + rotacyjny B/C/D),
agregowane docelowo w mapę technologiczną klientów. **Ewolucja modułu Kontraktorzy — nie równoległy silos**:
konsultant = `contractors` (NIE profiles), klient = ISTNIEJĄCA tabela `clients`, karta żyje OBOK logu
`contractor_conversations` (log = sprawy opieki; wspólna oś czasu w briefie i na profilu kontraktora).

**Dostęp:** `requireLifecycleManagerAction()` + RLS `has_lifecycle_access()` (admin | talent_community |
grant `has_tcm_access`). Zero dostępu dla konsultantów. Bez nowego uprawnienia. Rola „sprzedaż" (read-only
agregaty) = flaga `can_view_tech_map` planowana w Etapie 3.

**Schema (migracje 46a+46b):**
- `technologies` — słownik ze **stabilnym `slug`** (kebab, niezmienny przy rename — kotwica pod sync z NEXUS),
  `aliases text[]` (k8s→Kubernetes), `category` (jezyk/chmura/dane/devops/security/inne), `is_verified`
  (tag-picker dodaje FALSE). Seed ~130 pozycji. `vendors` — analogicznie bez sluga/kategorii.
- `client_areas` — child `clients` (UNIQUE per klient, lower(trim)).
- `tech_interview_cards` — draft (`is_draft`, `status` nullable) → finalizacja (`finalized_at`); pola bloku A
  (satysfakcja+komentarz, koniec projektu month/year XOR `project_end_unknown`, hiring+role+źródło, cytat),
  B (tech_old_new, team_size/externals), D (vendors_note); `*_alerted_at` = dedup alertów Etapu 3.
  **Matryca kompletności w `lib/tech-map/validation.ts` (app-layer, NIE trigger)** — `ok`/`niechetny` wymaga
  końca projektu + odpowiedzi o rekrutacji; `odmowa`/`brak_czasu` luzuje; satysfakcja ≤3 → komentarz.
- Junctions `tech_interview_card_technologies/_vendors` (słownik RESTRICT — delete łapie 23503 z polskim
  komunikatem; dotyczy też `deleteClient` w internal-clients.ts — pierwsze FK do `clients`!) +
  `tech_interview_card_initiatives`.
- `tech_block_assignments` — przydział bloku per kontraktor per kwartał, UNIQUE(contractor, rok, kwartał),
  `source=manual` lepki. Rotacja = czysty cykl B→C→D (`lib/tech-map/block-rotation.ts`); materializacja:
  fallback przy zapisie karty (Etap 1) + cron/przycisk (Etap 2). **Brief liczy blok czysto bez zapisu**
  (render bez side-effectów, audyt P1.8). Finalizacja z innym blokiem niż przydzielony → przydział
  aktualizowany do rzeczywistości (source=manual, audyt `TECH_BLOCK_OVERRIDDEN`).

**UI:** zakładka `mapa` w `/internal/people` (MapaTabPanel: lista kart + filtry client-side + „Nowa rozmowa"
+ słowniki dla admina) · pełne strony `/internal/people/mapa/wywiad/[contractorId]` (brief „przed rozmową":
duża litera bloku, prefill klienta przez `normalizeClientName`→`clients`, oś czasu kart+rozmów „żeby nie pytać
drugi raz") i `/mapa/karta/[cardId]` (edycja; własne karty — autor lub admin) · deep-link w sidebarze
(peopleOpsGroup) · sekcja kart na profilu kontraktora. **`TagMultiSelect`** (components/internal/people/mapa/)
to pierwszy generyczny tag-picker w repo (Input+Badge+filtrowana lista+„Dodaj: X" → słownik unverified).
**TCM może dodać klienta z formularza** (świadoma decyzja: `createClientForTechMap` — normalizacja Phase 42a
+ audyt `CLIENT_CREATED_FROM_TECH_MAP`, ta sama tabela co panel admina).

### Etap 2 — karta klienta + rotacja bloków (2026-08-03, bez migracji)

**Karta klienta** `/internal/people/mapa/klienci/[clientId]` — agregat z kart **sfinalizowanych**
(drafty to notatki w toku, nie wiedza o kliencie): technologie/vendorzy (tag + liczba wskazań + data
ostatniego potwierdzenia + obszary), inicjatywy (scalane po nazwa+rodzaj, `wysoki` wygrywa), sygnały
popytu, oś końców projektów, **macierz pokrycia obszary × bloki** (puste pole = temat nieporuszony),
notatki i wielkość zespołu. Dane >6 mies. wyblakłe (`opacity-60` + badge „do odświeżenia").
**Agregat NIE zawiera nazwisk konsultantów ani id kart** (test to pilnuje) — gotowe pod read-only
dostęp sprzedaży w Etapie 3. Cała logika w czystym `lib/tech-map/aggregation.ts` (`buildClientTechMap`,
`todayISO` wstrzykiwany); akcja `getClientTechMap` tylko dowozi wiersze. Wejście: sekcja „Mapy klientów"
w zakładce + klikalna nazwa klienta w liście kart.

**Rotacja bloków — materializacja.** `lib/tech-map/rotation-sweep.ts` (`sweepBlockAssignments`, plain
module) nadaje brakujące przydziały na bieżący kwartał; wspólny dla crona i przycisku „Przelicz
przydziały" (admin). Idempotentne: kontraktor z przydziałem — auto czy **ręcznym** — jest pomijany
(`computeRotationInserts` + `ignoreDuplicates`), więc override admina jest lepki. Populacja:
`contractors.status='active'`. Panel `RotationAdminSection` w zakładce pokazuje kto ma jaki blok
(badge `ręczny` / `z cyklu`) i kto już rozmawiał w kwartale; select bloku i „Przelicz" tylko dla admina.
`getRotationOverview` liczy blok **bez zapisu** (render bez side-effectów).

**Cron** `GET /api/cron/tech-map-rotation` (`withCronAuth`, maxDuration 120, try/catch + Sentry).
**Dzienny, nie kwartalny** — kontraktorzy aktywują się w środku kwartału, a crony Coolify potrafią
nie odpalić; dzienny przebieg sam nadrabia. Ślad w bazie: `TECH_MAP_ROTATION_RUN` (`phase: start|done`)
w `audit_logs` — `start` bez `done` = przebieg ubity w locie, brak `start` = cron nie odpalił.

| Nazwa | Schedule | Komenda |
|---|---|---|
| `tech-map-rotation` | `30 5 * * *` | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://compass.dynaminds.pl/api/cron/tech-map-rotation"` |

### Etap 3 — alerty + KPI + flaga sprzedaży (2026-08-04, migracja 46c)

**Migracja 46c:** `notifications_type_check` przepisany z ŻYWEJ listy prod (31 wartości, zweryfikowane
`pg_get_constraintdef`) +2: `tech_map_demand`, `tech_map_project_end`. `profiles.can_view_tech_map` bool
(grant read-only dla sprzedaży, wzorzec grant-flags Phase 45).

**Alerty (3 kanały — in-app insert + push + email, `Promise.allSettled`):**
- **Popyt → sprzedaż** — event-driven przy finalizacji karty (`fireDemandAlert` w `saveCardInternal`):
  gdy karta sfinalizowana, `hiring=true` i `demand_alerted_at IS NULL`. Best-effort (try/catch — błąd
  alertu nie cofa zapisu), stempluje `demand_alerted_at` (dedup).
- **Koniec projektu → bench** — dzienny cron `tech-map-project-end` (`0 6 * * *`): per kontraktor
  NAJNOWSZA sfinalizowana karta; deadline (ostatni dzień miesiąca) w oknie ≤60 dni i
  `project_end_alerted_at IS NULL` → alert, stempluje kartę. Heartbeat `TECH_MAP_PROJECT_END_RUN`.
- **Odbiorcy** — `system_settings` CSV UUID (`tech_map_demand_recipients` / `tech_map_project_end_recipients`),
  konfigurowani w sekcji admina modułu (`AlertRecipientsSection`); fallback: `owner_tcm_id` kontraktora,
  potem wszyscy admin+TCM (wzorzec `contractor-followup-reminder`).

**KPI** (sekcja `TechMapKpiSection` w zakładce Analityka): karty/7 dni per prowadzący (po `finalized_at`),
% obszarów z danymi <90 dni (mianownik = `client_areas`), aktywne sygnały popytu (hiring, <90 dni), końce
projektów ≤90 dni. Czysta `lib/tech-map/analytics.ts` + testy.

**Guard sprzedaży:** `requireTechMapViewerAction` (lifecycle OR `can_view_tech_map`) podpięty WYŁĄCZNIE
pod `getClientTechMap` (agregat bez nazwisk). UI dla roli sprzedaż świadomie poza zakresem — gotowy guard+flaga.

**Czyste helpery testowalne** (bez server-only): `lib/tech-map/alert-selection.ts` (`parseRecipientCsv`,
`projectEndDeadline`, `selectProjectEndAlerts`) wydzielone z `alerts.ts` (I/O: `dispatchAlert`,
`resolveRecipients`) — wzorzec bench-seed.

| Nazwa | Schedule | Komenda |
|---|---|---|
| `tech-map-project-end` | `0 6 * * *` | `wget ... "https://compass.dynaminds.pl/api/cron/tech-map-project-end"` |

Pełny plan: `docs/mapa-technologiczna-completion-report.md`.

### Phase 46d — jedna karta zamiast rotacji bloków (2026-08-04, migracja 46d)

Decyzja Artura po zobaczeniu Etapów 1-3: **karta wypełniana ZA JEDNYM ZAMACHEM**, bez dzielenia na
bloki B/C/D. Rotacja („kto ma jaki blok w kwartale") okazała się nadmiarowa — realny proces to komplet
raz, a potem lekkie telefony aktualizacyjne (obsługiwane przez log rozmów `contractor_conversations`).
Najważniejsze pola: technologie, projekt/pion (obszar), poszukiwane kompetencje, zadowolenie; reszta
(dostawcy, inicjatywy, zespół, stare/nowe) opcjonalna w tej samej karcie.

**Migracja 46d:** `DROP COLUMN tech_interview_cards.block` (+ odtworzenie `idx_tech_cards_client_hiring`
bez block) i `DROP TABLE tech_block_assignments`. Bezpieczne — 0 realnych kart; 640 przydziałów auto-B
to dane testowe z weryfikacji Etapu 2.

**Usunięto:** `lib/tech-map/{block-rotation,rotation-sweep}.ts`, cron `tech-map-rotation` (route + trzeba
wyłączyć zadanie w Coolify przez `cron-disable-task`), `RotationAdminSection`, akcje `getRotationOverview`/
`recalcBlockAssignments`/`overrideBlockAssignment`, typy `InterviewBlock`/`INTERVIEW_BLOCK*`/
`TechBlockAssignmentRow`/`plannedBlock`/`latestCardByBlock`.

**Zmienione:** formularz — wszystko naraz (sekcja „Najważniejsze" + „Technologie i zespół" + opcjonalne
„Inicjatywy" i „Dostawcy"), bez selektora bloku; **„Koniec projektu" przeformułowany** na plany klienta
z helperem „nie umowa konsultanta" (nie straszymy konsultanta, koniec zamówienia znamy z placementów);
karta klienta — pokrycie obszary×bloki → obszary + świeżość; brief przed rozmową bez dużej litery bloku.
Alerty, KPI, guard sprzedaży — bez zmian. Testy: usunięto rotation (suita 1103/1103).

### Phase 46g — „Wielkość zespołu": limit tekstu 40 → 80 + walidacja (2026-08-10, migracja 46g)

Postowanie kart rozmów zwracało zamaskowany błąd **„An error occurred in the Server Components render"**.
Przyczyna (z logów postgres prod, `new row ... violates check constraint
tech_interview_cards_team_size_len_check`): pole **„Wielkość zespołu"** (wolny tekst od 46f) miało w DB
`CHECK char_length <= 40`, ale ani formularz, ani walidacja app-layer tego nie pilnowały. Naturalny opis,
do którego zachęca placeholder („cały dział ~50"), łatwo przekracza 40 znaków (np. „cały dział IT, ok. 50
osób w kilku zespołach" = 46) → INSERT padał na constraint, a Next.js **maskował** przyczynę w prod jako
generyczny błąd server-action (wzorzec [[compass_prod_error_masking]]).

**Migracja 46g:** limit `team_size` **40 → 80** (`tech_interview_cards_team_size_len_check`). Rozszerzenie
CHECK jest bezpieczne (istniejące wartości ≤40). 80 mieści realny opis, wciąż chroni przed wklejeniem akapitu.
Zaaplikowana na prod przez Supabase MCP.

**Kod:** stała `TEAM_SIZE_MAX=80` (`lib/types/tech-map.ts`) zasila regułę w `validateCardBase` (client i
server) oraz `maxLength` inputu „Wielkość zespołu". KLUCZOWE: skoro prod maskuje błędy server-action,
walidacja musi łapać za długi input **po stronie klienta** — dlatego `submit()` woła teraz `validateCardBase`
na obu ścieżkach (draft i final), nie tylko przy finalizacji. `team_size` trimowany w `cardPayloadFromInput`
(spójnie z resztą pól tekstowych karty, żeby walidacja == to, co ląduje w DB). +testy jednostkowe limitu.

**Nauka:** dodając pole z DB CHECK, egzekwuj ten sam limit w app-layer **client-side** — sam constraint DB
daje w prod zamaskowany, nieczytelny błąd zamiast wskazania przyczyny.

## Phase 47 — powiadomienie o anulowaniu urlopu + historia wniosków (2026-08-04)

Anulowanie urlopu było ślepą plamą: kolejka approvera pokazuje tylko `pending`, więc po
akceptacji (lub anulowaniu) wniosek znikał bez śladu w UI, a powiadomienia były dziurawe —
`pending` cancel → **nikt**, `approved` cancel → **tylko admini** (email + push). Manager
akceptujący wniosek ani wybrany zastępca nie dowiadywali się, że urlop przepadł. Case Artura:
rozliczał timesheet w oparciu o zapisany urlop, który okazał się anulowany, bez żadnego sygnału.

### Powiadomienie (in-app + push + email) — `notifyLeaveCancelled`

Jeden helper w [internal-leave.ts](COMPASS/lib/actions/internal-leave.ts) wpięty we **wszystkie 3
ścieżki anulowania** (`cancelMyLeaveRequest` pending + approved, `cancelTeamLeave`). Odbiorcy
(zdeduplikowani, **z wykluczeniem actora** — nie powiadamiamy tego, kto anulował):

- **Approverzy** = wszyscy `admin` + **manager pracownika** (`profiles.manager_id`).
- **Zastępca** (`substitute_id`) — osobna treść „Zastępstwo anulowane".
- **Pracownik** — tylko gdy anulował **ktoś inny** (`byManager`); przy self-cancel pomijany (wie).

Kanały: **in-app** (dzwonek — trwałe, `await`-owane jako najpewniejszy sygnał; nowy typ
`leave_cancelled`) + **push** (best-effort) + **email tylko dla anulowanego `approved`** urlopu
(pending znika rutynowo — bez emaila, żeby nie zasypywać skrzynek). Każdy kanał best-effort, nigdy
nie blokuje anulowania. Nowy typ powiadomienia dodany migracją `phase47_leave_cancelled_notification`
(addytywnie do `notifications_type_check`) + do TS `NotificationType` + ikona 🚫 w `NotificationBell`.
Email zastępcy: nowy `sendSubstituteCancelled` (symetryczny do `sendSubstituteAssigned`, accent amber).

**Uwaga na przyszłość:** `notifyLeaveCancelled` zastąpił ad-hoc blok email/push adminów w
`cancelMyLeaveRequest` (approved) oraz pojedynczy push pracownika w `cancelTeamLeave` — teraz wszystkie
ścieżki zachowują się jednolicie. `for...of` po `Set` łamie tsconfig target (< es2015) — iteruj
`Array.from(set)` (TS2802).

### Historia wniosków (wszystkie statusy, w tym anulowane)

`listAllLeaveRequests()` — najświeższe ~500 wierszy wszystkich statusów; scope jak kolejka (admin:
wszyscy, manager: tylko zespół przez `manager_id`). Renderowana pod kolejką w
[AdminLeaveRequestsPanel](COMPASS/components/internal/panels/AdminLeaveRequestsPanel.tsx) jako
`AllLeaveRequestsList` (client): filtr statusu (Wszystkie/Oczekujące/Zaakceptowane/Anulowane/Odrzucone
z licznikami) + wyszukiwarka po nazwisku/emailu, read-only. Filtrowanie client-side (skala firmy =
setki wierszy). Rozwiązuje „prośba o akcept znika po kliknięciu Akceptuj" — teraz stan każdego wniosku
jest sprawdzalny.

**Bez `cancelled_by`/`cancelled_at`** — anulowanie tylko ustawia `status='cancelled'`; kto/kiedy jest
w `audit_logs` (`LEAVE_CANCELLED` / `LEAVE_CANCELLED_BY_MANAGER`) + `updated_at`. Testy scopingu nowej
akcji w `internal-leave.test.ts`. Migracja zaaplikowana na prod przez MCP (2026-08-04).

## Phase 48 — Monitoring prawny (skrzynka przeglądu dla finanse/admin, 2026-08-10)

Codziennie w dni robocze ~7:30 zewnętrzny agent AI (zadanie cykliczne na koncie Claude Artura,
`trig_01VYhNEcpj6Z3bF9FnU3o3Sr`, cron `30 5 * * 1-5` UTC) czyta 7 publicznych baz prawnych, wybiera
pozycje istotne dla modelu firmy (B2B a art. 22 KP, estoński CIT, ZUS, legislacja, TK) i dopisuje je
do `legal_monitor_items` + zawsze jeden wiersz do `legal_monitor_runs` (heartbeat).

**COMPASS niczego nie pobiera z internetu** — moduł czyta te dwie tabele i obsługuje przegląd:
`new → reviewed | action_required | dismissed`. Tabele są stałym interfejsem, więc silnik da się
kiedyś podmienić (np. na wariant w GitHub Actions) bez ruszania modułu.

**Gdzie:** zakładka `legal-monitor` w hubie Administracja HR (`/internal/admin?tab=legal-monitor`),
widoczna dla `admin` i `finanse` — lustro RLS `is_finanse_or_admin()`. Na zakładce licznik
nieprzejrzanych wpisów (`HubTabs` dostał opcjonalne pole `badge`), bo bez niego nikt nie wie, że
automat coś dorzucił, dopóki tam nie kliknie. Błąd licznika nie może wywalić huba — jest w try/catch.

### Sześć rzeczy, o których trzeba wiedzieć przy zmianach tutaj

1. **INSERT/DELETE nie mają polityk RLS i to jest celowe** — pisze wyłącznie pipeline ścieżką
   serwisową. Dodanie polityki INSERT dla `authenticated` otworzyłoby drogę do podrobionych „wpisów
   prawnych". `reviewLegalMonitorItem` idzie **klientem użytkownika**, nie service-role, żeby RLS był
   realnym backstopem guardu; lista kolumn jest zawężona w kodzie do czterech pól przeglądu
   (RLS jest wierszowa, nie kolumnowa — treści wpisu i `dedupe_key` pilnuje app-layer).
   Brak wiersza z `RETURNING` traktujemy jako błąd, nie cichy sukces.
2. **Alarm „monitoring nie odpowiada" wymaga OBU warunków**: wieku > 26 h **i** realnie pominiętego
   dnia roboczego (`missedWorkingDaysSince` w [health.ts](COMPASS/lib/legal-monitor/health.ts) —
   daty liczone w `Europe/Warsaw`, święta z `public_holidays`). Sam próg 26 h alarmowałby po każdym
   weekendzie; sama „luka dnia roboczego" alarmowałaby po przebiegu wykonanym późnym wieczorem.
   Dzisiejszy dzień wlicza się dopiero po 10:00 czasu warszawskiego (`EXPECTED_BY_HOUR_WARSAW`),
   bo do tej godziny brak wpisu z dzisiaj to normalka, nie awaria. **Zimą cron wypada 6:30** — jeśli
   ktoś przesunie harmonogram, ta stała jest jedynym miejscem do korekty po stronie COMPASS.
3. **`sources_checked` ma trzy wartości, nie dwie**: `ok` / `empty` / `fail`. `empty` (źródło
   odpowiedziało, ale bez nowości) to stan normalny — do bannera i listy „niedostępnych" liczy się
   wyłącznie `fail`. Pierwszy realny przebieg miał `SEJM_RCL: fail` przy reszcie `empty`.
4. **`url` z pipeline'u to treść z zewnątrz** — przed renderem przechodzi przez
   [safeExternalUrl](COMPASS/lib/legal-monitor/safe-url.ts) (tylko http/https, parsowanie przez
   `URL`, nie regexem). React nie sanityzuje `href`, więc `javascript:` w linku wykonałby się
   w sesji użytkownika finanse/admin. Odrzucony link nie znika po cichu — zostaje informacja,
   że wpis miał źródło o nieprawidłowym adresie (inaczej wyglądałby jak wpis bez źródła).
5. **Banner to JEDNO zdanie i ma tak zostać** — surowe `notes` przebiegu to u tego pipeline'u
   kilka akapitów relacji z tego, co się nie udało; w bannerze zjadały pół ekranu i ucinały się
   po trzech liniach (widziane na prodzie 2026-08-10). Szczegóły należą do „Historii sprawdzeń",
   a stan problemowy kończy zdanie odsyłaczem tam. Dlatego historia **sama rozwija uwagi
   NAJNOWSZEGO przebiegu, gdy jest `partial`/`failed`** (`initiallyExpanded`) — bez tego odsyłacz
   kazałby klikać drugi raz po treść, po którą się przyszło. Nie wracaj z `notes` do bannera.
6. **Pełna nazwa miesiąca po polsku to `MMMM`, nie `LLLL`** — `LLLL` daje formę samodzielną
   w mianowniku („10 sierpień 2026"), a po liczbie dnia polski wymaga dopełniacza („10 sierpnia
   2026"). Trafiło na prod i było widoczne w bannerze. Dla skrótów `LLL` i `MMM` dają ten sam
   wynik („10 sie 2026"), więc reszta modułu (listy, historia) świadomie zostaje na `LLL`,
   spójnie z resztą repo. Odmiana liczebników z czasownikiem — `elapsedWorkingDaysPl`
   („minął 1 dzień roboczy" / „minęły 2 dni robocze" / „minęło 5 dni roboczych", 12–14 jak 5+).

**Pliki:** [lib/types/legal-monitor.ts](COMPASS/lib/types/legal-monitor.ts) (unie + etykiety PL) ·
[lib/legal-monitor/health.ts](COMPASS/lib/legal-monitor/health.ts) (czysta logika bannera i
sortowania, `now`/święta wstrzykiwane, 19 testów) ·
[lib/actions/legal-monitor.ts](COMPASS/lib/actions/legal-monitor.ts) ·
`components/internal/legal-monitor/` (banner, lista z filtrami + panel szczegółu, historia
sprawdzeń) · [AdminLegalMonitorPanel](COMPASS/components/internal/panels/AdminLegalMonitorPanel.tsx).
Audyt: `LEGAL_MONITOR_ITEM_REVIEWED`.

**Migracja:** `20260810121224_legal_monitoring_tables` została zaaplikowana na prod przez MCP
**zanim** powstał moduł; plik w repo jest jej idempotentnym odwzorowaniem (na prod = no-op), żeby
świeże środowisko dało się zbudować z samych migracji.

**Ops:** brak nowych cronów i env-varów po stronie COMPASS — harmonogramem zarządza właściciel konta
Claude (zmiana godziny / pauza / nowe źródło = jedno zdanie do Claude w dowolnej sesji). Weryfikacja
RLS na prodzie (2026-08-10, transakcje z ROLLBACK): `finanse` widzi 15 wpisów / 3 przebiegi i
aktualizuje 1 wiersz; `consultant` widzi 0 i aktualizuje 0.

## Phase 50 — Monitoring prawny przestaje być pasywny (alerty + follow-up, 2026-08-10)

Phase 48 dała skrzynkę, ale **moduł niczego nie wypychał**: jedynym sygnałem, że automat coś dorzucił
— albo że przestał chodzić — był licznik na zakładce schowanej w Administracji HR. Narzędzie do
pilnowania zmian prawnych, które wymaga pamiętania, żeby do niego zajrzeć, ma wbudowaną wadę.
Dane to potwierdzały: start modułu to **backfill 13 miesięcy** (dokumenty 2025-07-03 → 2026-08-04),
a bieżący ruch to 0–4 wpisy dziennie — skrzynka się nie zapycha, tylko cicho czeka.

**Cron `legal-monitor-alerts`** (`0 8 * * *`, po przebiegu pipeline'u) robi pięć rzeczy w JEDNYM
przebiegu, żeby po stronie Coolify było jedno zadanie, nie pięć: czerwony wpis · cisza monitoringu ·
seria awarii źródła · zaległa reakcja · poniedziałkowy digest.

### Cztery decyzje, które łatwo cofnąć nie znając powodu

1. **Alert o awarii źródła dopiero po `SOURCE_FAILURE_STREAK_THRESHOLD` (3) przebiegach z rzędu.**
   Pojedynczy `partial` to rutyna — 2 z 3 pierwszych przebiegów na prodzie miały `SEJM_RCL: fail`
   (api.sejm.gov.pl bywa nieosiągalne). Alert o każdym wyrobiłby odruch ignorowania i przykrył ten
   jeden ważny. Warunek to `=== threshold`, nie `>=` — daje dokładnie jeden alert na epizod **bez
   trzymania stanu w bazie**: przy serii 4, 5, 6… już nie alertujemy, a po odzyskaniu źródła licznik
   sam wraca do zera.
2. **Termin reakcji siedzi NA WPISIE, nie w zadaniu.** Pierwotny pomysł („Do reakcji" → zadanie, jak
   `TicketToTaskButton`) rozbija się o uprawnienia: `contractor_tasks` ma RLS `has_lifecycle_access()`
   (admin+TCM — `finanse` by tam nie sięgnął), a `tasks` to osobiste tablice kanban przypisane do
   właściciela. `due_date` + `assigned_to` na `legal_monitor_items` dają follow-through bez
   przeciągania uprawnień przez pół aplikacji, a cron przypomina o zaległościach.
3. **Digest to gałąź TEGO SAMEGO crona, nie osobny harmonogram** (`isDigestDay` — poniedziałek czasu
   warszawskiego). Przy 0–4 wpisach dziennie codzienny mail o żółtych i zielonych to szum; jedno
   podsumowanie tygodniowo pasuje do wolumenu, a Coolify dostaje jedno zadanie do dodania.
4. **Hurtowe „Przejrzane" z pustą notatką NIE kasuje notatek indywidualnych** — inaczej jedno
   kliknięcie wymazałoby ustalenia wpisane wcześniej ręcznie. `review_note` trafia do UPDATE tylko
   wtedy, gdy operator faktycznie coś wpisał.

**Grant `profiles.can_view_legal_monitor`** (piąta flaga tego typu, wzorzec Phase 45/46c) daje
zarządowi/managerowi podgląd bez nadawania roli `finanse` (która odblokowałaby faktury i stawki).
SQL: `has_legal_monitor_read()` — nazwa **celowo różna od kolumny**, żeby w ciele funkcji nie było
wątpliwości, czy identyfikator to kolumna czy wywołanie. Flaga rozszerza **tylko SELECT**; UPDATE
zostaje przy `is_finanse_or_admin()`, więc posiadacz czyta, ale nie przegląda.
`requireInternalAdminAreaLayout` wpuszcza go do huba, a `visibleTabs` pokazuje mu **wyłącznie**
zakładkę monitoringu.

**Dispatcher alertów wyjechał do `lib/notifications/alert-dispatch.ts`** — ten sam kod obsługuje
teraz tech-mapę (Phase 46c) i monitoring. `lib/tech-map/alerts.ts` to cienkie opakowanie zachowujące
poprzedni interfejs; 80 testów tech-mapy potwierdza brak regresji.

**Phase 50b — źródło `PRASA`.** Artur wskazał prawo.pl, porozmawiajmyopodatkach.pl, newsletter
pl.andersen.com i estonskicit.com. Samo ich czytanie jest po stronie pipeline'u, ale `source` ma
sztywny CHECK — bez tej wartości **każdy taki wpis odbiłby się od constraintu przy INSERT**.
`PRASA` = pozycje, których pierwotnym źródłem jest omówienie; gdy pipeline dociera do samego
orzeczenia, nadal używa kodu rejestru, a prasę podaje w `source_label` (tak jak dziś robi
„TK — Trybunał Konstytucyjny / prasa").

**Pliki:** [alert-selection.ts](COMPASS/lib/legal-monitor/alert-selection.ts) (czysta selekcja,
25 testów) · [alerts.ts](COMPASS/lib/legal-monitor/alerts.ts) (I/O) ·
[alert-dispatch.ts](COMPASS/lib/notifications/alert-dispatch.ts) · `app/api/cron/legal-monitor-alerts/`.
Audyt: `LEGAL_MONITOR_ALERTS_RUN` (start/done), `LEGAL_MONITOR_ITEMS_BULK_REVIEWED`,
`LEGAL_MONITOR_FOLLOWUP_SET`, `LEGAL_MONITOR_EXPORTED_CSV`.

**Ops po deploy:**

| Nazwa | Schedule | Komenda |
|---|---|---|
| `legal-monitor-alerts` | `0 8 * * *` | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://compass.dynaminds.pl/api/cron/legal-monitor-alerts"` |

Odbiorcy alertów (opcjonalnie — bez nich fallback na wszystkich finanse+admin): `system_settings`
klucze `legal_monitor_red_recipients` (czerwone + digest) i `legal_monitor_ops_recipients` (cisza,
awarie źródeł), oba jako CSV z UUID.

## Phase 51 — Monitoring prawny: skrzynka grupowana po dacie otrzymania (2026-08-12)

Przeglądający wchodzi codziennie i pyta „co przyszło nowego", a lista była płaska i posortowana
globalnie po pilności — nowości trzeba było wyławiać z całości. Data w wierszu tego nie ratowała:
to `published_at`, czyli data DOKUMENTU, a jeden poranny przebieg potrafi przynieść dokumenty
z rozpiętością prawie dwóch lat (prod, 12.08: 5 wpisów z dokumentami od 2024-11-19 do 2026-08-11).

Wpisy są teraz pogrupowane po dniu OTRZYMANIA (`created_at`) jak w skrzynce mailowej: „Dzisiaj",
„Wczoraj", „Przedwczoraj", dalej „Poniedziałek, 10 sierpnia 2026", najnowszy dzień u góry.
Logika w [lib/legal-monitor/grouping.ts](COMPASS/lib/legal-monitor/grouping.ts) (czysta, `todayISO`
wstrzykiwany, 11 testów) + test renderu listy.

Cztery rzeczy, o których trzeba wiedzieć przy zmianach tutaj:

1. **Pilność zeszła z poziomu globalnego na poziom dnia.** Wcześniej wszystkie czerwone były
   na samej górze listy (spec Phase 48); teraz są pierwsze w SWOIM dniu. Zamiennikiem globalnego
   przeglądu jest filtr pilności, który jest w UI od Phase 48 — nie dokładaj drugiego przełącznika
   trybu sortowania. Zerwanie czerwonych z dna listy pilnuje osobno alert e-mail/push z Phase 50.
2. **Dzień grupy liczony w `Europe/Warsaw`** (`warsawDate`), nie `toISOString().slice(0,10)` —
   pipeline dopisuje wpisy rano, ale ręczne/ponowne przebiegi po 22:00 UTC wylądowałyby w grupie
   poprzedniego dnia.
3. **`todayISO` liczy SERWER** (`AdminLegalMonitorPanel`) i podaje w dół propsem. Wyliczenie
   „dzisiaj" w komponencie klienckim rozjeżdża się z HTML-em z serwera przy renderze o północy
   (hydration mismatch).
4. **Data dokumentu w wierszu jest podpisana słowem „dokument"** — obok nagłówka z datą otrzymania
   dwie różne daty bez podpisu czytają się jak błąd.

## Phase 52 — Monitoring prawny: pinezka trzymająca wpis na górze (2026-08-12)

Phase 51 ułożyła skrzynkę wg dnia otrzymania, więc wpis uznany za ważny po kilku dniach schodzi
w dół razem ze swoim dniem. Pinezka wyjmuje go z tego porządku: sekcja **Przypięte** stoi nad
dniami, kolejność „ostatnio przypięte na górze".

Kolumny `pinned_at` / `pinned_by` (migracja `phase52_legal_monitor_pin`, addytywna, RLS bez zmian —
polityki są wierszowe, więc to warstwa aplikacji pilnuje, których kolumn moduł dotyka). Akcja
`setLegalMonitorPin` bierze **stan docelowy**, nie „przełącz" — dwa kliknięcia z dwóch kart nie
mogą dać wyniku zależnego od kolejności.

Cztery decyzje, które łatwo cofnąć nie znając powodu:

1. **Pinezka jest ORTOGONALNA do statusu, nie kolejnym poziomem ważności.** „Do reakcji" to stan
   procesu — ma termin, osobę i budzi crona przypomnieniami (Phase 50). Przypięcie to „chcemy mieć
   to pod ręką". Dlatego przypiąć można wpis w dowolnym statusie, a przegląd pinezki NIE zdejmuje.
   Nie zlewaj tych dwóch rzeczy w jedno pole.
2. **Wyjątek: odrzucenie zdejmuje pinezkę** (`reviewLegalMonitorItem` + wariant hurtowy) — „nieistotne"
   i „trzymamy na górze" nie mogą być prawdziwe naraz, a przypięty śmieć zostałby na górze na zawsze.
3. **Sekcja przypiętych ignoruje filtr statusu**, ale honoruje pilność/temat/źródło/szukajkę. Gdyby
   honorowała status, przypięty wpis znikałby w chwili oznaczenia go jako przejrzany — czyli
   dokładnie wtedy, kiedy pinezka ma robić robotę. `visibleIds` (zaznaczanie hurtem) obejmuje obie
   sekcje, więc „Zaznacz widoczne" nie mija się z tym, co widać.
4. **Pinezka jest WSPÓLNA dla zespołu**, jak status, notatka i termin — moduł obsługuje kilka osób
   przy jednej skrzynce. Prywatne zakładki wymagałyby tabeli łączącej (item × user); nie ma potrzeby.

Przypięty wpis nie powtarza się w swoim dniu (ten sam wpis w dwóch miejscach czyta się jak dwa różne),
więc w sekcji przypiętych dostaje w wierszu datę otrzymania — poza dniem straciłby ten kontekst.
Logika w [lib/legal-monitor/grouping.ts](COMPASS/lib/legal-monitor/grouping.ts) (`partitionPinned`).
Audyt: `LEGAL_MONITOR_ITEM_PINNED` / `_UNPINNED`. Świadomie poza zakresem: kolumna „Przypięty"
w eksporcie CSV i limit liczby przypiętych.

## Phase 49 — edytowalne tytuły rozmów i zgłoszeń (2026-08-10)

Nagłówki obu strumieni pracy People Ops były nieedytowalne, a oba brały tytuł z cudzych danych:
karta rozmowy z Mapy technologicznej wyliczała „Rozmowa: {konsultant}" z `contractors.full_name`
(importy potrafią mieć samo nazwisko — „wasilewski"), a zgłoszenie ze Spraw dostawało tytuł raz,
przy zakładaniu. W obu przypadkach jedyną drogą do poprawki był SQL.

**Mapa technologiczna — nowa kolumna, nie zmiana nazwiska.** `tech_interview_cards.title` (migracja
`20260810150000_phase49_card_title`, nullable, `CHECK char_length(btrim(title)) BETWEEN 1 AND 120`)
trzyma tytuł nadany przez TCM. **Świadomie NIE ruszamy `contractors.full_name`** — poprawianie
nazwiska w katalogu przy okazji nazywania rozmowy rozjechałoby dopasowania importów (klucze
naturalne, aliasy z Phase 42a). Pole „Tytuł rozmowy" jest pierwszym polem formularza karty;
puste = tytuł domyślny. Jedno źródło tego defaultu: `cardDisplayTitle` / `defaultCardTitle`
w [lib/types/tech-map.ts](COMPASS/lib/types/tech-map.ts) — używają go nagłówek karty, lista kart,
tabela kart na profilu kontraktora i placeholder w formularzu. Wyszukiwarka listy kart przeszukuje
teraz konsultanta ORAZ tytuł (karta z własnym tytułem musi być po nim znajdowalna).

**Limit w app-layer, nie tylko w CHECK-u** (lekcja 46g, [[compass_prod_error_masking]]): `CARD_TITLE_MAX`
zasila `validateCardBase` (client + server) i `maxLength` inputu. Bez tego przekroczenie limitu
wraca w prod jako zamaskowany „Server Components render", a nie „za długi tytuł".

**Sprawy — `renameInboxTicket`** ([lib/actions/support-inbox.ts](COMPASS/lib/actions/support-inbox.ts)):
guard `isCallerHandler` + ta sama bariera `support_inbox_meta` co `moveInboxTicket` (akcja nie tyka
helpdesku ani lustra spraw kontraktorskich), trim + kolaps spacji, limity `TICKET_SUBJECT_MIN/MAX`,
audyt `INBOX_TICKET_RENAMED` z parą `[przed, po]`. UI: ołówek przy
nagłówku (`components/inbox/InboxTicketTitle.tsx`, Enter zapisuje, Escape wycofuje).

Dwie rzeczy, o których trzeba wiedzieć przy zmianach tutaj:
1. **`support_inbox_meta.email_subject` zostaje nietknięty** — to zapis, z czym zgłoszenie przyszło,
   a nie robocza nazwa sprawy. Test tego pilnuje.
2. **Rename revaliduje też `/internal/people`** — kanban Spraw żyje w hubie People Ops, więc bez tego
   stary tytuł zostaje na kafelku mimo poprawnej zmiany w bazie.

## Phase 52 — jedno przypomnienie o timesheecie na miesiąc (2026-08-12)

Kto nie złożył timesheetu, dostawał **~8 maili miesięcznie**: zadania Coolify
`timesheet-mon-nudge` (`0 9 * * 1`) i `timesheet-wed-warning` (`0 9 * * 3`) plus cron GH Actions
25-go. Wszystkie za miesiąc **bieżący**, czyli jeszcze niezamknięty — więc treść mijała się
z prawdą: 12.08 przyszedł mail „timesheet 2026-08, **termin za 3 dni**", choć termin za sierpień
to 5 września. Cztery fazy eskalacji Harvest-style (Phase 17b R9) zwinięte do jednego maila.

### Trasa decyduje o wysyłce, nie wołający

To jest ta zmiana, którą łatwo cofnąć nie znając powodu. Wcześniej
`/api/cron/timesheet-reminder` robiła to, co kazał jej `?phase=`, więc liczba maili zależała od
tego, ile zadań ktoś kiedyś dodał w Coolify. Teraz cała reguła siedzi w trasie:

- **Okres = miesiąc ZAMKNIĘTY** (poprzedni), nigdy trwający — `closedMonthFor`
  w [lib/hr/timesheet-reminder-window.ts](COMPASS/lib/hr/timesheet-reminder-window.ts).
- **Okno = 1.–5. dzień miesiąca** (do dnia terminu włącznie). Poza oknem trasa nie wysyła nic,
  więc stare zadanie z `?phase=mon-nudge` jest **nieszkodliwym no-opem** — nie trzeba było
  zgadywać, czy uda się wyłączyć wszystkie harmonogramy naraz.
- **Okno, a nie jeden dzień**, bo scheduler bywa zawodny (crony Coolify potrafiły nie odpalać
  tygodniami — patrz `coolify_cron_needs_container_name` i Phase 41b). Pięć prób zamiast jednej.
- **Dedup w bazie** — `timesheet_reminder_log` z `UNIQUE (user_id, year, month)`. Cron najpierw
  **rezerwuje** wysyłkę wstawką `ON CONFLICT DO NOTHING` (`upsert` + `ignoreDuplicates` + `.select()`
  zwraca tylko realnie wstawione wiersze), maila wysyła wyłącznie dla nich. Dedup jest atomowy:
  dwa schedulery naraz nie wyślą duplikatu, bo rozstrzyga UNIQUE, a nie odczyt-potem-zapis.
  Nieudana wysyłka **kasuje rezerwację**, żeby jutrzejszy przebieg w oknie ją ponowił.

Skoro dedup jest w bazie, redundancja harmonogramów jest darmowa — GH Actions i Coolify wołają
trasę równolegle codziennie 1.–5. i wychodzi z tego jeden mail.

### Reszta

- **Treść**: jeden szablon zamiast czterech, z **konkretną datą terminu** („Termin: 5 września
  2026") zamiast fałszywego „za 3 dni", i zdaniem „to jedyne przypomnienie za 2026-08".
  Odmiana: `LLLL` (mianownik) dla nazwy miesiąca, `MMMM` (dopełniacz) po liczbie dnia — patrz
  lekcja z Phase 48.
- **Heartbeat** `TIMESHEET_REMINDER_RUN` w `audit_logs`. Przy jednym mailu na miesiąc cichy brak
  przebiegu = cały miesiąc bez sygnału do ludzi, a nikt tego nie zauważy; to jedyny czytelny
  z bazy dowód, że okno zostało obsłużone.
- **`?force=1`** pomija okno (ręczne uruchomienie), `?year=&month=` wskazują inny okres.
  **Dedupu nie pomija nic** — od powtórki jest wskazanie innego okresu, nie obejście gwarancji.
- Alert Teams idzie **po** rezerwacji, nie przed — inaczej HR dostawałby go co przebieg, także
  wtedy, gdy wszystkie maile poszły pierwszego dnia okna.

### Ops po deploy

1. Migracja `phase51_timesheet_reminder_log` zaaplikowana na prod przez MCP (2026-08-12).
   Addytywna: nowa tabela, RLS włączone, **zero polityk** (pisze i czyta wyłącznie cron przez
   service_role — polityka INSERT dla `authenticated` pozwoliłaby komukolwiek zablokować sobie
   przypomnienie podrobioną rezerwacją). Tak, `phase51_` przy fazie 52: migracja poszła na prod,
   zanim numer 51 zajął równolegle zmergowany PR #330, a nazwa zostaje zgodna z tym, co realnie
   zapisane w `supabase_migrations.schema_migrations`.
2. Coolify: wyłączone `timesheet-mon-nudge` i `timesheet-wed-warning`, dodane jedno
   `timesheet-reminder` (`0 9 1-5 * *`). Uwaga: `action=cron-enable` w workflow „Coolify Ops"
   włącza **wszystkie** zadania naraz, więc po każdym takim przebiegu trzeba te dwa wyłączyć
   ponownie (ta sama pułapka co przy `inbox-ingest`, Phase 44).
3. **Dwa schedulery, jeden mail.** Workflow GH Actions „Timesheet reminder (monthly cron)"
   **nigdy wcześniej nie wysłał ani jednego maila** — w repo nie było sekretu `CRON_SECRET`,
   więc każdy przebieg (25.05, 25.06, 25.07) padał na pierwszym kroku i jedynym realnym nadawcą
   był Coolify. Sekret uzupełniony 2026-08-12, więc redundancja jest już prawdziwa; duplikatów
   nie ma, bo o „raz na miesiąc" decyduje rezerwacja w bazie, nie harmonogram. Gdyby sekret
   kiedyś zniknął, workflow kończy się **ostrzeżeniem i zielonym przebiegiem**, nie czerwonym —
   przy harmonogramie 1.–5. brak sekretu dawałby pięć fałszywych alarmów miesięcznie.
4. **Przy rotacji `CRON_SECRET`**: wartość jest w env vault Coolify, a serwer jest osiągalny
   tylko z runnera GH. Nie kopiuj jej ręcznie — jest na to `action=cron-secret-ciphertext`
   w workflow „Coolify Ops", który drukuje sekret **zaszyfrowany kluczem publicznym repo**
   (sealed box; odczyta go wyłącznie GitHub), gotowy do `PUT` na API sekretów. Procedura
   w nagłówku [coolify-ops.yml](.github/workflows/coolify-ops.yml).
5. Brak nowych env-varów.

## Observability

Zobacz `~/.claude/rules/observability.md` dla pełnego standardu (Sentry + Grafana Cloud + Cloudflare). Per-Compass odstępstwa:

- **JSON logger utility** — `COMPASS/lib/logger.ts` (zero-dep) używany zamiast `console.error`. ~50 lokalizacji zmigrowanych w PR #32. Pozostałe ~100 w `lib/actions/` i `components/` migrowane stopniowo gdy pliki są edytowane (hook PostToolUse blokuje nowe `console.*`).
- **Sentry projekt:** `compass` (Next.js 14, App Router + middleware Edge runtime). SDK: `@sentry/nextjs ^8` (^9 wymagałoby Next 15).
- **Source maps:** `withSentryConfig` z `hideSourceMaps: true` + upload przez `SENTRY_AUTH_TOKEN` (build-time only, nigdy w runtime image).
- **GIT_SHA propagation:** `deploy.yml` PATCH-uje Coolify env vault na każdym pushu (nie magic var Coolify). `BUILT_AT = $(date -u +%Y-%m-%dT%H:%M:%SZ)` per deploy. `/api/health` zwraca prawdziwy short SHA, smoke test prefix-match przechodzi bez retry.
- **Replay privacy:** `maskAllText: true, blockAllMedia: true` — Compass trzyma dane HR (RODO).
- **Compose `logging:`** — `json-file 10MB×5 + tag` per service (już ma).
- **Alloy sidecar:** profile-gated (`profiles: [observability]`). Bez `COMPOSE_PROFILES=observability` w Coolify nie startuje. Po dodaniu Grafana creds + profilu → logi w Loki (`{app="compass"}`).
