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

## Phase 26b — Inbox email ingest z administracja@b2bnetwork.pl (2026-05-19)

Automatyczne wciąganie maili przychodzących na shared mailbox `administracja@b2bnetwork.pl` do Kanban Inbox (`/admin/inbox`) jako tickety. Workflow rzeczywiście używany przez handlery (Błażej, Paulina, TCM, admin).

**Scope MVP (świadomie wąski):**
- Tylko `administracja@b2bnetwork.pl` (pierwsza skrzynka — można rozszerzyć kolejnymi rzędami w `inbox_sync_state`)
- Bez backfill — startujemy od momentu deployu (seed: `last_synced_at=NOW()`)
- Bez AI klasyfikacji — wszystko ląduje w kategorii **`inbox_administracja`** (P3 default), handler ręcznie zmienia kategorię/priorytet po review
- Treść + załączniki zapisywane w DB / Storage (pełen widok bez otwierania Outlook)
- Reply matchowany przez Graph `conversationId` → append comment do istniejącego ticketu + auto-reopen jeśli był resolved/closed
- Filtry szumu: NDR/bounce (mailer-daemon, postmaster, noreply), Out-of-Office (Auto-Submitted/X-Auto-Response-Suppress/Precedence headers), internal noise (sentry/github/coolify/m365/azure/supabase/vercel/cloudflare domains). **NIE filtrujemy** maili od pracowników b2bnetwork.pl.

**Migracja `phase26b_inbox_email_ingest`:**
- `support_inbox_meta` += `external_conversation_id`, `email_body_html`, `email_body_text`, `email_headers JSONB`, `email_skip_reason`
- Nowa tabela `inbox_sync_state` (singleton per mailbox): `last_synced_at`, `last_run_at`, `last_error`, statystyki `last_scanned/created/appended/skipped`
- Storage bucket `inbox-attachments` (private), folder `{ticket_id}/`, RLS: SELECT dla handlerów, DELETE dla admin (writes tylko service-role)
- `notifications.type` += `inbox_email_reopened`, `inbox_email_arrived`
- Seed: row dla `administracja@b2bnetwork.pl` z `last_synced_at=NOW()`

**Architektura:**
```
Coolify cron (*/5 min) → /api/cron/inbox-ingest (Bearer $CRON_SECRET)
  ↓ withCronAuth (service-role admin client)
  ↓ ingestMailbox(admin, 'administracja@b2bnetwork.pl')
  ├─ Read cursor: SELECT last_synced_at FROM inbox_sync_state WHERE mailbox=...
  ├─ Graph: GET /users/{mailbox}/messages?$filter=receivedDateTime gt {cursor} (+select+orderby+top=50)
  ├─ Per message: classifyMessage() → skip lub keep
  │    ├─ MATCH external_message_id → already ingested, advance cursor
  │    ├─ MATCH external_conversation_id → append comment + reopen if closed
  │    └─ NEW → INSERT support_tickets + support_inbox_meta + upload załączników
  └─ UPDATE inbox_sync_state z nowym cursor + stats + last_error
```

**Pliki:**
- `lib/mailbox/graph-mail-read.ts` — Graph helper (`listNewMessages`, `listAttachments`) z retry/backoff i Sentry capture
- `lib/inbox/filters.ts` — pure functions (`classifyMessage`, `isNonDeliveryReport`, `isAutoReply`, `isInternalNoise`)
- `lib/inbox/ingest.ts` — `ingestMailbox()` orchestrator
- `app/api/cron/inbox-ingest/route.ts` — endpoint z `withCronAuth` i `maxDuration: 240s`
- UI: `components/inbox/KanbanCard.tsx` (badge "✉ email"), `app/(protected)/admin/inbox/[id]/page.tsx` (sanitized HTML body + lista załączników z signed URLs), `app/(protected)/admin/inbox/page.tsx` (banner sync status)

**Audit log actions:** `INBOX_EMAIL_INGESTED`, `INBOX_EMAIL_THREAD_APPENDED`, `INBOX_EMAIL_REOPENED`, `INBOX_EMAIL_SKIPPED` (z reason details).

**Coolify cron job (do dodania po deploy):**

| Nazwa | Schedule | Komenda |
|---|---|---|
| `inbox-ingest` | `*/5 * * * *` (co 5 min) | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://compass.dynaminds.pl/api/cron/inbox-ingest"` |

**Ops post-merge (KRYTYCZNE — bez tego ingest zwraca 403 RAOP):**

1. **Entra app permission**: dodać `Mail.Read` (Application) do app `Compass` (`17f9ff8c-ac4e-414d-890e-a823722b4c35`) + admin consent
2. **Exchange Online RBAC** (analogicznie do Phase 25 OOF — bez tego Graph blokuje):
   ```powershell
   Connect-ExchangeOnline -UserPrincipalName artur.twardowski@b2bnetwork.pl
   $sp = Get-ServicePrincipal -Identity "Compass"
   New-ManagementRoleAssignment -App $sp.Identity -Role "Application Mail.Read"
   ```
3. **Defense-in-depth** — scope app tylko do `administracja@b2bnetwork.pl` (bez tego app może czytać każdą skrzynkę w tenant):
   ```powershell
   New-ApplicationAccessPolicy -AppId "17f9ff8c-ac4e-414d-890e-a823722b4c35" `
     -PolicyScopeGroupId "administracja@b2bnetwork.pl" `
     -AccessRight RestrictAccess `
     -Description "Compass inbox ingest — only administracja@"
   ```
4. **Coolify schedule** — dodać cron `inbox-ingest` wg tabeli powyżej.
5. **Verify** — po pierwszym tick:
   ```bash
   curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://compass.dynaminds.pl/api/cron/inbox-ingest" | jq
   # expect: {ok:true, mailbox:"administracja@b2bnetwork.pl", scanned, created, ...}
   ```
   I w UI `/admin/inbox` zielony banner "Auto-import z administracja@b2bnetwork.pl · ostatni sync: ..."

**Opcjonalny env var** `INBOX_INGEST_USER_ID` — UUID profilu używanego jako `user_id` w `support_tickets` (bo NOT NULL). Bez niego cron wybiera pierwszego admina/handler chronologicznie. Override przydatny gdy chcesz "system bot" profile.

## Phase 26c — Inbox ingest dla Microsoft 365 Group (2026-05-19)

**Discovery podczas ops setupu Phase 26b:** `administracja@b2bnetwork.pl` to **Microsoft 365 Group** (`Unified` GroupType, primary SMTP `Administracja@b2bnetsa.onmicrosoft.com`, alias `administracja@b2bnetwork.pl`), NIE shared mailbox / user mailbox. Mail.Read User API zwraca `ErrorInvalidUser 404` dla GroupMailbox.

**Architektura przebudowana:** helper `lib/mailbox/graph-mail-read.ts` używa teraz Groups Conversations API:
- `GET /groups/{groupId}/threads?$filter=lastDeliveredDateTime gt {cursor}`
- `GET /groups/{groupId}/threads/{threadId}/posts`
- `GET /groups/{groupId}/threads/{threadId}/posts/{postId}/attachments`

Każdy `post` jest mapowany na syntetyczny `GraphMessage` (zachowany shape z Phase 26b), gdzie `conversationId = thread.id`. Dzięki temu pipeline `lib/inbox/ingest.ts` zostaje bez zmian: dedupe po `internetMessageId` (= `${threadId}/${postId}`), match po `conversationId`, append-or-create.

**Migracja `phase26c_inbox_group_id`:**
- `inbox_sync_state` += `mailbox_kind` (`'user'|'group'`, default `'user'`), `group_id TEXT NULL`
- Backfill row dla `administracja@b2bnetwork.pl`: `mailbox_kind='group'`, `group_id='c5630e8f-7aee-498e-9561-0c4a376ffa79'`

**Permission stack (zaktualizowany):**

| Layer | What | Status |
|---|---|---|
| Entra (Application permissions) | `Mail.Read` ❌ **niewystarczająca** dla GroupMailbox | dodane w Phase 26b ops — zostaje (nie szkodzi) |
| Entra (Application permissions) | `Group.Read.All` ✅ wymagana dla `/groups/.../threads` | dodana 2026-05-19 + admin consent (via `az ad app permission add` + `az rest POST appRoleAssignments`) |
| Exchange Online RBAC | `Application Mail.Read` ✅ wymagana — RAOP traktuje Group mailbox jak mailbox | dodana 2026-05-19 (`New-ManagementRoleAssignment -App $sp -Role "Application Mail.Read"`) |
| ApplicationAccessPolicy | Tenant ma `CompassMailSenders` (RestrictAccess) — Compass może czytać tylko skrzynki w tej grupie | `Administracja@b2bnetsa.onmicrosoft.com` dodana jako member 2026-05-19 (`Add-DistributionGroupMember -Identity CompassMailSenders -Member Administracja@b2bnetsa.onmicrosoft.com`) |

**Gotcha — propagacja AAP:** po `Add-DistributionGroupMember` Microsoft cache RAOP może trzymać stary stan **15-60 minut**. `Test-ApplicationAccessPolicy -AppId ... -Identity administracja@...` zwraca `AccessCheckResult: Granted` natychmiast, ale Graph wciąż 403 RAOP. Cierpliwość. Po propagacji ingest działa.

**Opcjonalny env var** `INBOX_PRIMARY_GROUP_ID` — Graph object id grupy. Helper preferuje tę wartość jeśli ustawiona (skip live `$filter=mail eq ...` lookup). DB column `inbox_sync_state.group_id` jest source of truth — ingest ustawia env per-tick.

**Filters caveat:** Groups Conversations API NIE zwraca `internetMessageHeaders` na postach. Sender-based filters (mailer-daemon, postmaster, noreply localparts; sentry/github/m365/azure noise domains) działają, ale Auto-Submitted/Precedence/X-Auto-Response-Suppress checki są no-op. W praktyce M365 Group nie dostaje typowych NDR/OOF email-side, więc to akceptowalne.

## Phase 26d — Pivot na shared mailbox (RAOP cache nie odświeża się dla GroupMailbox) (2026-05-19)

**Problem:** Phase 26c działa technicznie ale Microsoft RAOP cache po `Add-DistributionGroupMember Administracja → CompassMailSenders` nie odświeża się w >60 min nawet po `Remove-ApplicationAccessPolicy` całkowitej removal i `EnforceExoAppRbacPermissions=False` na poziomie tenant. `Test-ApplicationAccessPolicy` zwraca `Granted` natychmiast, ale Graph wciąż 403 [RAOP].

**Rozwiązanie:** Utworzono shared mailbox `compass-tickets@b2bnetwork.pl` z transport rule kopiującym każdy mail z `administracja@` (BCC). Shared mailbox to klasyczny User mailbox — Graph `/users/{upn}/messages` działa natychmiast, bez RAOP issues. Code branchuje na `mailbox_kind` w `inbox_sync_state`.

**Ops zrobione 2026-05-19:**
```powershell
# 1. Shared mailbox
New-Mailbox -Shared -Name "Compass Tickets" -DisplayName "Compass Tickets" -PrimarySmtpAddress compass-tickets@b2bnetwork.pl
# ExchangeObjectId: 42865e35-78c9-4c23-a4f7-434b80ce4199

# 2. Transport rule: każdy mail na administracja@ → BCC compass-tickets@
New-TransportRule -Name "Mirror Administracja to Compass Inbox" -SentTo "administracja@b2bnetwork.pl" -BlindCopyTo "compass-tickets@b2bnetwork.pl" -Mode Enforce

# 3. Defense-in-depth — member of Group i DL
Add-UnifiedGroupLinks -Identity "Administracja@b2bnetsa.onmicrosoft.com" -LinkType Members -Links compass-tickets@b2bnetwork.pl
Add-DistributionGroupMember -Identity CompassMailSenders -Member compass-tickets@b2bnetwork.pl
```

Test Graph `/users/compass-tickets@b2bnetwork.pl/messages` → **HTTP 200** od ręki (zero opóźnienia, brak RAOP block).

**Zmiany kodu:**
- `lib/mailbox/graph-mail-read.ts` — dodano `kind: 'user' | 'group'` w `ListNewMessagesInput` i `ListAttachmentsInput`. User mode: `/users/{upn}/messages`. Group mode: `/groups/{id}/threads/posts` (Phase 26c logika zachowana).
- `lib/inbox/ingest.ts` — czyta `mailbox_kind` z `inbox_sync_state`, przekazuje do helpera, propaguje do attachments fetch.
- Migracja `phase26d_pivot_to_shared_mailbox`: UPDATE row z `administracja@b2bnetwork.pl` → `compass-tickets@b2bnetwork.pl`, `mailbox_kind='user'`, `group_id=NULL`, reset stats, `last_synced_at=NOW()`.

**Skutki dla użytkownika:**
- **Bez zmian dla nadawców** — wszyscy nadal piszą na `administracja@b2bnetwork.pl`.
- **Bez zmian dla Outlook Groups UI** — pracownicy nadal widzą wątki w Outlook Groups (transport rule BCC kopiuje, nie redirectuje).
- **Compass widzi każdy nowy mail** — przez Mail.Read na shared mailbox. Tickety pojawiają się w `/admin/inbox`.

**Filters zachowują headers:** User mailbox API zwraca `internetMessageHeaders` (Auto-Submitted/Precedence/X-Auto-Response-Suppress), więc NDR/OOF detection wraca do pełnej skuteczności (Phase 26c caveat odpada dla `compass-tickets@`).

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

## Observability

Zobacz `~/.claude/rules/observability.md` dla pełnego standardu (Sentry + Grafana Cloud + Cloudflare). Per-Compass odstępstwa:

- **JSON logger utility** — `COMPASS/lib/logger.ts` (zero-dep) używany zamiast `console.error`. ~50 lokalizacji zmigrowanych w PR #32. Pozostałe ~100 w `lib/actions/` i `components/` migrowane stopniowo gdy pliki są edytowane (hook PostToolUse blokuje nowe `console.*`).
- **Sentry projekt:** `compass` (Next.js 14, App Router + middleware Edge runtime). SDK: `@sentry/nextjs ^8` (^9 wymagałoby Next 15).
- **Source maps:** `withSentryConfig` z `hideSourceMaps: true` + upload przez `SENTRY_AUTH_TOKEN` (build-time only, nigdy w runtime image).
- **GIT_SHA propagation:** `deploy.yml` PATCH-uje Coolify env vault na każdym pushu (nie magic var Coolify). `BUILT_AT = $(date -u +%Y-%m-%dT%H:%M:%SZ)` per deploy. `/api/health` zwraca prawdziwy short SHA, smoke test prefix-match przechodzi bez retry.
- **Replay privacy:** `maskAllText: true, blockAllMedia: true` — Compass trzyma dane HR (RODO).
- **Compose `logging:`** — `json-file 10MB×5 + tag` per service (już ma).
- **Alloy sidecar:** profile-gated (`profiles: [observability]`). Bez `COMPOSE_PROFILES=observability` w Coolify nie startuje. Po dodaniu Grafana creds + profilu → logi w Loki (`{app="compass"}`).
