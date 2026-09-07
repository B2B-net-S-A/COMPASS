# CLAUDE.md — COMPASS

> Per-app odstępstwa od globalnego standardu w `~/.claude/rules/deployment.md`.
> Plik ładowany automatycznie przy każdej sesji Claude'a w tym repo.
>
> **Co tu jest:** wyłącznie reguły, których złamanie coś psuje — dziś, w tym kodzie.
> **Czego tu nie ma:** historii wdrożeń. Opisy 54 faz (maj–sierpień 2026) mieszkają
> w [`docs/historia-faz.md`](docs/historia-faz.md). Zaglądaj tam, gdy potrzebujesz
> kontekstu „dlaczego to tak wygląda", a nie „jak tego nie zepsuć".
>
> Rozdzielenie zrobiono w audycie 2026-08-25 (pozycja C9): plik miał 156 KB i szedł
> w całości do kontekstu każdej sesji. Jeśli dopisujesz — zadaj sobie pytanie
> **„czy ktoś dotykający kodu dziś musi to wiedzieć, żeby czegoś nie zepsuć?"**.
> Jeśli nie, miejsce jest w historii albo w raporcie w `docs/`.

**Produkcja bez stagingu, 46 użytkowników, dane kadrowe.** Każdy merge do `main` jedzie
na produkcję. Nie ma środowiska, na którym „się sprawdzi".

---

## Stack & porty

- **Frontend:** Next.js 14.2.35 (App Router, React 18, standalone output) — w katalogu `COMPASS/`.
- **Baza:** Supabase (Postgres + Auth + Storage), projekt `shduiynzemftkqqefscd`.
- **Integracje:** Microsoft Graph (poczta, kalendarz, OOF, SharePoint), Anthropic SDK,
  Voyage (embeddingi), Teams webhook, web push (VAPID). **OpenAI już nie ma** — pakiet i klucz
  zniknęły, embeddingi liczy Voyage; nie wracaj do `OPENAI_API_KEY` ze starych notatek.
- **Testy:** Vitest (unit) + Playwright (e2e, osobny workflow).
- **Menedżer pakietów:** npm (Node 20). **Port:** 10000 (`APP_PORT` w compose).

**Monorepo gotcha:** root repo zawiera tylko `docker-compose.yml` + `.github/`; aplikacja jest
w podkatalogu `COMPASS/`. Wszystkie `npm` odpalaj z `COMPASS/` albo z `--prefix COMPASS`.

**Poczta idzie WYŁĄCZNIE przez Microsoft Graph.** Resend był kanałem przejściowym i został
usunięty (`lib/email/sender.ts`). Nie przywracaj `MAIL_PROVIDER=resend` z żadnego starego
runbooka — ta ścieżka cicho przełączyłaby produkcję na martwy kanał.

## Deploy

- **Hosting:** Coolify v4 na Hetzner CAX21 ARM (compass-prod, 178.104.220.48).
- **Panel Coolify:** `https://coolify-compass.dynaminds.pl`. **App UUID:** `w136dv828ofipvjfnxrqi643`.
- **Zasób:** Docker Compose Application, prywatne repo z deploy key, branch `main`,
  `docker-compose.yml` z blokiem `build:` (Coolify buduje ze źródła, nie ciągnie z registry).
- **Auto-deploy:** `git push origin main` → `.github/workflows/deploy.yml` → webhook Coolify →
  build + restart → smoke test `/api/health` z porównaniem SHA.
- **Rollback:** panel Coolify → Resources → compass → Deployments → poprzedni → Redeploy.
- **Build context:** `./COMPASS` (nie root). Dockerfile w `COMPASS/Dockerfile`.
- Procedury operacyjne: `~/.claude/rules/deployment.md` + `~/.claude/rules/deployment-runbook.md`.

## Healthcheck

- **URL:** `/api/health` (`COMPASS/app/api/health/route.ts`), `dynamic = 'force-dynamic'`.
- **Kształt:** `{status, version, deployedAt, checks: {supabase}}`. `version` = `GIT_SHA` (pełny SHA),
  `deployedAt` = `BUILT_AT`. Smoke test dopasowuje **prefiks** short SHA.
- **Logika:** HEAD na `/rest/v1/?apikey=…` z timeoutem 2 s → `<500` = healthy, `5xx`/timeout = unhealthy.
  Status `unhealthy` zwraca HTTP 503.
- **Compose healthcheck:** `wget --spider http://127.0.0.1:10000/api/health` co 30 s, retries 3, start_period 40 s.
- **UA smoke testu MUSI zawierać `dynaminds-smoke-test`** — bez tego reguła Cloudflare
  `cf.threat_score gt 30` zwraca 403 z IP runnera GH (szczegóły: `~/.claude/rules/observability.md`).

## Env vars (build-time vs runtime)

**Build args** (osadzone w bundlu — `NEXT_PUBLIC_*` są **publiczne**, nie wkładaj tam sekretów):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_INVOICES_ENABLED`,
`GIT_SHA`, `BUILT_AT` oraz `SENTRY_AUTH_TOKEN` (**wyłącznie** build-time — nigdy w runtime image).

**Runtime** (env vault Coolify): `SUPABASE_SERVICE_ROLE_KEY`, `SUPER_ADMIN_EMAILS` (CSV),
`CRON_SECRET`, `SENTRY_DSN`, `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL` / `_FAST_` / `_STRONG_`),
`VOYAGE_API_KEY`, `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`
(+ `AZURE_CLIENT_SECRET_EXPIRES_AT` dla `secret-expiry-check`), `GRAPH_REQUEST_TIMEOUT_MS`,
`MAIL_FROM`, `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`, `TEAMS_WEBHOOK_URL`,
`TC_SYNC_FILE_URL` / `TC_SYNC_USER_ID`, `OOF_RECONCILE_ACTOR_ID`, `INVOICES_ENABLED`.

⚠ `ALLOW_BYPASS_LOGIN` + `BYPASS_*` to furtka logowania do testów lokalnych. Jest dodatkowo
przycięta przez `NODE_ENV !== 'production'` (`app/login/actions.ts`), więc sam env var jej nie
otworzy — **ale nie zdejmuj tego warunku** i nie ustawiaj tych zmiennych w vault produkcji.

**Flagi funkcji** (obie muszą być `'true'`, żeby moduł ożył — `lib/feature-flags.ts`):
`NEXT_PUBLIC_INVOICES_ENABLED` (build-time, chowa UI) + `INVOICES_ENABLED` (runtime, guard akcji).
Domyślnie **oba wyłączone** — moduł faktur jest schowany od Fazy 26. Analogicznie
`CONSULTANT_SUCCESS_ENABLED` (+ `_AUTOMATIONS_`/`_SURVEYS_`) w `lib/consultant-success/flags.ts`.

## CI i weryfikacja

- **Baseline musi być zielony przed i po zmianie:** `npx tsc --noEmit` czysto + `npx vitest run` zielone
  (z katalogu `COMPASS/`).
- **W CI:** `npm run test:unit` (nie `npm test` — to odpala też Playwrighta).
- **Lint:** `next lint`. **Typy:** `tsc --noEmit`. **E2E:** osobny workflow `e2e-tests.yml`.
- ⚠ **`next.config.mjs` ma `eslint.ignoreDuringBuilds` i `typescript.ignoreBuildErrors`** — faza
  typów OOM-uje na build-hoście ARM bez swapu. Skutek: **build sam z siebie nie sprawdza typów**.
  Jedyną bramką jest CI, więc każda ścieżka omijająca CI (redeploy z panelu Coolify,
  `workflow_dispatch`) wypuszcza kod nieprzetypowany. Nie polegaj na „przecież build przeszedł".
- **Deploy:** concurrency `deploy-${{ github.ref }}`, `cancel-in-progress: false` — deploye z `main`
  są sekwencyjne.
- **Weryfikacja, że deploy dojechał:**
  ```bash
  SHORT_SHA=$(git rev-parse --short=7 HEAD)
  curl -fsSL -A "dynaminds-smoke-test/1.0" https://compass.dynaminds.pl/api/health \
    | jq -e ".status != \"unhealthy\" and (.version | startswith(\"$SHORT_SHA\"))"
  ```

## Ops cheat sheet

```bash
cd /Users/arturtwardowski/COMPASS      # repo root (aplikacja w COMPASS/)

npm --prefix COMPASS run lint
npm --prefix COMPASS run test:unit
cd COMPASS && npx tsc --noEmit

# lokalnie
cd COMPASS && npm run build && PORT=10000 npm start
docker compose up --build              # z root repo

# deploy
git push origin main && gh run watch

# rollback
git revert HEAD && git push origin main   # albo Redeploy poprzedniego w panelu Coolify
```

---

## Role, dostęp i archiwizacja

**Jedna rola na osobę + addytywne flagi grantów.** Nie mnóż ról, żeby komuś dołożyć jedno
uprawnienie — od tego są flagi na `profiles`.

| Rola | Kto (stan prod 2026-08-25) | Landing | Zakres |
|---|---|---|---|
| `admin` | 2 | `/home` | wszystko |
| `internal` | 30 | `/internal` | HR Hub (timesheet, urlopy, premie) |
| `manager` | 4 | `/internal` | + HR zespołu (`profiles.manager_id = ja`) |
| `finanse` | 4 | `/internal` | + akceptacja faktur, monitoring prawny |
| `talent_community` | 4 | `/internal` | + People Ops, skrzynka, mapa technologiczna |
| `consultant` | 2 | `/home` | platforma, **bez** `/internal` |

**Flagi grantów na `profiles`** (5): `can_log_overtime`, `has_tcm_access`, `is_inbox_handler`,
`can_view_tech_map`, `can_view_legal_monitor`. Każdą egzekwuj **i** w guardzie aplikacji,
**i** w RLS — sama flaga bez polityki to dekoracja.

**Rola `admin` NIE jest wyprowadzana z `profiles.role`.** `sync_user_role()` przy każdym logowaniu
nadaje `admin` wyłącznie z `admin_access_list` / `SUPER_ADMIN_EMAILS`, a `admin` nie jest na liście
ról zachowywanych (zachowywane: `internal`/`finanse`/`manager`/`talent_community`). Zmiana roli
musi ruszać **obie** rzeczy naraz — inaczej pierwszy login cofnie zmianę. Szczegóły w komentarzu
nad `syncAdminAccessList` (`lib/actions/user-admin.ts`).

**Archiwizacja (`employment_status = 'exited'`) odbiera dostęp do aplikacji natychmiast.**
Trzy warstwy: callback/login (przed powstaniem sesji), `middleware.ts` (każde żądanie — **jedyna**
warstwa łapiąca server actions), `lib/api/with-auth.ts` (trasy `/api/**`). Blokuje jawny akt
archiwizacji, **nie** `termination_date < dziś` (offboarding trwa po ostatnim dniu pracy).
`offboarding` przechodzi wszędzie. Brak profilu / brak statusu **nie** blokuje — inaczej awaria
odczytu wylogowałaby całą firmę.

### Guardy

Guardy są w `lib/auth/internal-guard.ts` (`require*Action` dla server actions, `require*Layout`
dla stron). **Każdy nowy eksport w `lib/actions/` musi zawołać guard w pierwszej linii ciała.**
Nie ma kroku CI, który tego pilnuje — pilnujesz Ty i review. Guardy rzucają `ExpectedError`
(patrz niżej), bo najczęstszy przypadek to wygasła sesja, a nie awaria.

---

## Reguły z audytu 2026-08 — nowe, łatwe do złamania

Pięć rzeczy wprowadzonych w Etapach A/B/C. Każda zastępuje wzorzec, który był w repo wcześniej,
więc kopiowanie „jak w sąsiednim pliku" może cofnąć naprawę.

### 1. Kontrakt server action: `runAction` + `ExpectedError`

`lib/actions/action-result.ts`. **Nie rzucaj gołych wyjątków z `'use server'`.**

```ts
export async function createThing(input: Input): Promise<ActionResult<{ id: string }>> {
    return runAction('createThing', async () => {
        const ctx = await requireInternalOrAdminAction()
        if (!input.name) throw new ExpectedError('Podaj nazwę.')
        return { id: await insert(input, ctx) }
    })
}
```

Dwa powody, oba niewidoczne lokalnie:
- Next w produkcji zamienia treść rzuconego wyjątku na „An error occurred in the Server Components
  render". Komunikat dociera do użytkownika **tylko wtedy, gdy jest zwrócony jako dane**.
- `@sentry/nextjs` **nie instrumentuje** plików `'use server'` (sprawdzone ponownie na SDK 10.71).
  Bez `runAction` awaria akcji nie generuje żadnego zdarzenia w Sentry.

**Rozróżnienie jest istotne, bo od niego zależy limit 5k zdarzeń/mies.:**
`ExpectedError` (walidacja **oraz** guardy) → treść trafia do użytkownika, do Sentry **nie**.
Cokolwiek innego → `captureException` + komunikat ogólny, bez wycieku szczegółów bazy.

### 2. Zapytania listowe: `selectInChunks` / `requireRows` i reguła TREŚĆ vs DEKORACJA

`lib/supabase/select-in-chunks.ts`. Powód: incydent 25.08 („zniknął nam cały kanban") —
`.in()` z 397 identyfikatorami budowało query string ~15 kB, ucinany w drodze do kontenera.
Zapytanie **nie wracało z błędem, wracało z pustką**, a `rows.length === 0 → return []`
zamieniało awarię w pusty ekran bez słowa komunikatu.

- `.in()` z listą, która może urosnąć → **`selectInChunks`** (paczki ≤60 id).
- Rozpakowując wynik listowy: **`requireRows`**, gdy wiersze są **TREŚCIĄ** ekranu.
  Rzuca przy `error` **oraz** przy `data === null` — `null` bez błędu to nie pusta lista,
  tylko sygnał, że odpowiedź się nie zmaterializowała.
- **DEKORACJA** (nazwiska do etykiet, liczniki poboczne) → `requireRows` **NIE**. Tam awaria ma
  degradować wyświetlanie, a nie zamieniać działający ekran w komunikat o błędzie.
- `selectInChunks` rzuca zwykłym `Error`, nie `ExpectedError` — to awaria infrastruktury,
  ma iść do Sentry, nie do użytkownika.
- ⚠ `.order()` działa **w obrębie paczki**. Do „globalnych pierwszych N wierszy" ta funkcja
  się nie nadaje; jest bezpieczna tylko gdy klucz grupowania u wywołującego = kolumna dzielenia.
- Serwerowe klienty Supabase używają `hardenedFetch` (`lib/supabase/fetch-hardening.ts`:
  `no-store` + retry) — nie omijaj go własnym `fetch`.

### 3. Audyt: `logAudit` vs `logSystemAudit`

Polityka INSERT na `audit_logs` to `WITH CHECK (auth.uid() = user_id)`
(migracja A3.2, plik `20260825140300_audit_a3b_audit_logs_no_spoofing.sql`). Poprzednia
sprowadzała się do „ktokolwiek zalogowany" i pozwalała podrzucić wpis z **cudzym** `user_id`.

- **`logAudit`** (`lib/actions/audit.ts`, `'use server'`) — wpis w imieniu zalogowanego użytkownika.
- **`logSystemAudit`** (`lib/audit/system-log.ts`, zwykły moduł `server-only`) — wpisy, których
  RLS nie przepuści: heartbeaty maszynowe (`user_id = null`) i wpisy o korekcie **cudzego**
  dokumentu (`user_id` = właściciel, sesja = akceptujący). Pisze service-rolą.
- **Nie dodawaj `'use server'` do `system-log.ts`** i nie rób z tego parametru w `logAudit` —
  każdy eksport z pliku `'use server'` jest publicznym endpointem, więc flaga „pisz service-rolą"
  byłaby wołalna z przeglądarki i odtworzyłaby dokładnie tę możliwość fałszowania audytu,
  którą A3.2 zamyka. `logSystemAudit` nigdy nie rzuca — audyt nie może wywrócić operacji,
  którą opisuje.
- **Crony:** owijaj handler w `withCronHeartbeat` (`lib/audit/cron-heartbeat.ts`) — para wpisów
  `*_RUN` (`phase: 'start'` / `'done'`). Diagnoza z samej bazy: `start`+`done` = przebieg się wykonał ·
  `start` bez `done` = żądanie ubite w locie · brak `start` = harmonogram nie dosięgnął trasy.
  Nie dopisuj `done` ręcznie w każdej gałęzi — trasy mają po kilka punktów wyjścia i któryś zostanie
  pominięty, dając fałszywy sygnał „ubity w locie".

### 4. Kto jest na liście: `activeRoster` vs `employedInMonth`

`lib/hr/employment-window.ts`. Dwie reguły, **pomyłka boli w obie strony**:

- **`activeRoster()`** — listy „TU I TERAZ": dropdowny przypisania, odbiorcy powiadomień i maili
  z cronów, katalogi ludzi. Pytanie: „czy ta osoba **dziś** u nas pracuje".
- **`employedInMonth()` / `filterEmployedInMonth()`** — widoki i raporty **MIESIĘCZNE**: payroll,
  kalendarz zespołu, ewidencja. Pytanie: „czy pracowała **w tym miesiącu**". Wypada dopiero
  od miesiąca **po** ostatnim dniu pracy.

Reguła miesięczna na liście „tu i teraz" → osoba, która odeszła pół roku temu, zostaje w dropdownie
na zawsze (tak wyglądał bug kalendarza zespołu). Reguła „tu i teraz" w raporcie miesięcznym →
kto odszedł 20-go, znika z rozliczenia miesiąca, który w większości przepracował.
Nie wklejaj `.neq('employment_status','exited')` inline — na poziomie buildera jest `excludeExited(query)`,
na poziomie tablicy `activeRoster(rows)` / `isActiveNow(row)`. Wołaj je i podejmij jawną decyzję.
Pierwszy dzień miesiąca licz przez `monthStart(year, month)`, nie własnym szablonem —
`isEmployedInMonth` porównuje daty ISO jako stringi, więc inny format cicho zaczyna kłamać.

### 5. Migracje

- **Baza produkcyjna jest READ-ONLY dla sesji Claude'a.** Migracje pisz jako **pliki** w
  `COMPASS/supabase/migrations/` — nie aplikuj ich.
- **Każda migracja kończy się blokiem `DO $$` z `RAISE EXCEPTION`** jako samosprawdzeniem
  (wzorzec: `20260825140000_audit_a1_profiles_anon_readable.sql`). Migracja, która „przeszła",
  ale nic nie zmieniła, jest gorsza niż migracja, która padła.
- **Kolejność migracji audytowych jest wiążąca: A0 (kod) → A1 → A2 → A3.**
  - **A0 musi być na produkcji PRZED A2.** A2 odbiera `authenticated` prawo wykonania
    `sync_user_role()`; zastosowana przed wdrożeniem kodu, w którym `lib/auth/sync-role.ts`
    tworzy klienta service-role, **odcina logowanie wszystkim** — hasłem i przez SSO.
  - **A3 musi iść PO A2.** Dopóki `sync_user_role` jest osiągalna kluczem użytkownika,
    `auth.uid()` w jej wnętrzu jest niepuste, więc trigger cofnąłby jej legalny UPDATE
    i synchronizacja ról przestałaby działać **bez żadnego błędu**.
  - Stan na 2026-08-25: pliki `20260825140*` i `20260825150000`/`160*` **nie są zaaplikowane**
    na produkcji (sprawdź `supabase_migrations.schema_migrations`).
- **Prefiks pliku ≠ wersja w rejestrze.** Aplikując przez MCP, zacommituj plik o **tej samej**
  wersji, którą zwrócił rejestr — dziś repo i rejestr są rozjechane (pozycja C1 audytu),
  a bazy nie da się odtworzyć z samych plików.
- Sprawdzaj **realny schemat**, nie nazwy z dokumentacji: `information_schema` /
  `pg_get_constraintdef` zamiast wiary w ten plik.

---

## Gotchas, których złamanie coś psuje

- **NIGDY `supabase db push`.** Rejestr migracji na produkcji i katalog
  `COMPASS/supabase/migrations/` to praktycznie rozłączne zbiory: 210+ plików w repo,
  ~152 wpisy w `supabase_migrations.schema_migrations`, część wspólna to **2 wersje**.
  `db push` próbowałby zaaplikować od nowa prawie wszystko. SQL wjeżdża wyłącznie przez
  MCP `apply_migration` (stempluje rejestr) + osobny commit pliku. Plik w repo jest
  dokumentacją, nie ścieżką wykonania. 71 plików ma zresztą 8-cyfrowy prefiks,
  którego CLI i tak nie uzna za wersję.

- **W compose dla Coolify `context: .`, nigdy `context: ..`.** Coolify ustawia
  `--project-directory` na root repo, więc `..` wychodzi poza drzewo i build pada na
  `failed to read dockerfile`. Dotyczy też compose'ów leżących w podkatalogu.


### Microsoft Graph / Exchange

- **RBAC for Applications (RAOP).** Tenant `b2bnetwork.pl` ma włączony mechanizm, który wymaga
  **jawnego przypisania roli w Exchange Online** — same uprawnienia w Entra nie wystarczą.
  Objaw: `403 ErrorAccessDenied — [RAOP] : Blocked by tenant configured AppOnly AccessPolicy settings`.
  Naprawa wymaga PowerShella i uprawnień EXO (`New-ServicePrincipal` + `New-ManagementRoleAssignment`
  dla ról `Application Mail.Send` / `Calendars.ReadWrite` / `MailboxSettings.ReadWrite`).
  ⚠ `-ServiceId` to **ObjectId service principala w Entra**, nie Application ID — niejasne w docs MS.
  **Każdą nową operację Graph app-only smoke-testuj na jednej skrzynce PRZED merge.**
- **Konsumenci Graph to sekwencyjne pętle po ~37 skrzynkach** (`oof-reconcile`, `forward-reconcile`,
  `people-sync`), więc jedna zawieszona skrzynka potrafiła zjeść budżet czasu całej trasy — bez
  wyjątku i bez śladu. Audyt C10 dołożył twardy deadline per żądanie w `lib/graph/client.ts`
  (`GRAPH_REQUEST_TIMEOUT_MS`, domyślnie 20 s, dopuszczalne 1–120 s) i przyciął retry SDK do 2 prób,
  bo wywołujący mają własne pętle ponowień. **Nie omijaj tego klienta własnym `Client.init()`.**
  Dokładając krok do trasy, która już czyta skrzynki — postaw go **przed** skanem, nie za nim.
- **Reguła skrzynki (forward) nie ma warunków czasowych.** `messageRulePredicates` nie zna żadnego
  pola daty — reguła jest niezależna od `automaticRepliesSetting`. Okno otwiera i zamyka cron,
  więc **sprzątacz osieroconych reguł jest częścią systemu, nie opcją**, a ID reguły musi być
  trwale zapisane (`leave_requests.outlook_forward_rule_id`; `displayName` niesie UUID urlopu
  jako zapasową kotwicę). Nieudane zamknięcie = przekierowanie cudzej poczty w nieskończoność.
- **Daty urlopowe licz w `Europe/Warsaw`** (`warsawDate()`), nie `toISOString().slice(0,10)` —
  serwer chodzi w UTC i wieczorem pomyliłby się o dobę.

### PostgREST / Supabase

- **Nie używaj embed-by-FK-hint na tabelach z self-FK.** `profiles.manager_id → profiles.id`
  zwraca `PGRST200 „Could not find a relationship… using hint"` mimo istniejącego constraintu;
  `NOTIFY pgrst, 'reload schema'` nie pomaga. Tak samo przy **kilku FK do tej samej tabeli**
  (`bonuses` ma trzy do `profiles`) — embed jest wieloznaczny. **Rozbij na dwa zapytania.**
- **Każdy szeroki czytelnik `support_tickets` poza skrzynką i analityką musi wykluczać
  `inbox_%` ORAZ `contractor_%`.** Tabela miesza trzy populacje (Faza 37) — pominięcie
  drugiego prefiksu zanieczyszcza helpdesk lustrem rozmów kontraktorskich.

### Importy i nazwy

- **Kanonizacja nazw klientów i osób** siedzi w `lib/contractors/name-normalization.ts` i jest
  wpięta w **parsery**, nie w akcje. Nowy wariant = jedna linijka + deploy.
- ⚠ **`external_key` zawiera nazwę klienta**, więc zmiana aliasu zmienia klucz idempotencji.
  Bez przeliczenia w bazie ponowny wgrany plik wstawi **duplikaty**. Zmiana samej wielkości liter
  jest bezpieczna (hash liczy po `lower()`), zmiana treści nazwy — nie.
  Wzorzec bezpiecznego backfillu: `20260727120000_phase42a_*` (odtwarza FNV-1a w SQL i **przed**
  jakąkolwiek zmianą sprawdza zgodność repliki z każdym istniejącym kluczem).
- **Słownik `clients` zasila dropdown premii** — literówka w nim wycieka do danych finansowych.
  Poprawiając nazwę tam, sprawdź `bonuses.client_name`.
- **Nie zgaduj przy imionach bez nazwiska.** „Klaudia" i „Marcin" mają po dwóch właścicieli;
  scalenie zafałszowałoby ranking per rekruter.

### Drobne, ale kosztowały już czas

- **Pełna nazwa miesiąca po polsku po liczbie dnia to `MMMM` (dopełniacz), nie `LLLL`**
  (mianownik: „10 sierpień 2026"). Dla skrótów `LLL` i `MMM` dają to samo.
- **`for…of` po `Set` łamie tsconfig target** (TS2802) — iteruj `Array.from(set)`.
- **Radix `ScrollArea` w `Dialog`** z `max-h-[90vh]` i `height: auto` **nie scrolluje** —
  użyj zwykłego `overflow-y-auto` albo definitywnego `h-[Nvh]`.
- **Worktree nie ma `node_modules`** — symlinkuj z main, żeby odpalić `tsc`/`eslint`.
- **Nie rób `git stash` w tym repo** — leży tu stash z innej gałęzi i `pop` zanieczyści drzewo.

---

## Integracja z NEXUSEM (kontraktorzy + roster cyklu życia)

Compass wymienia z NEXUSEM (ATS) dwie rzeczy poza dniami roboczymi z D5.
**Kod wdrożony (#366/#367/#369), migracja `20260906205803` na prodzie.**

**Dwa kierunki, dwa różne sekrety — łatwo pomylić:**

| Przepływ | Trasa | Sekret | Uwaga |
|---|---|---|---|
| Kontraktorzy: **Compass ← NEXUS** | cron `/api/cron/nexus-contractors-sync` | `NEXUS_CONTRACTORS_API_KEY` (`X-API-Key` do NEXUSA) | pobiera + dopasowuje po e-mailu |
| Cykl życia: **NEXUS ← Compass** | `/api/internal/roster` | `ROSTER_EXPORT_SECRET` (`Bearer`, czyta NEXUS) | oddaje TYLKO email+status |

- **`/api/internal/roster`** (`app/api/internal/roster/route.ts`) — eksport rosteru
  dla NEXUSA (Etap 5). Zwraca WYŁĄCZNIE `email` + `employment_status` przez funkcję
  `nexus_roster_export()` (SECURITY DEFINER) — kontrakt wymusza SYGNATURA funkcji SQL,
  nie handler; `profiles` to pełna kartoteka kadrowa. Własny `ROSTER_EXPORT_SECRET`,
  **nie `CRON_SECRET`** (tamten odblokowuje `/api/migrate-compliance` = DDL na bazie).
  Header-only, 503 „Not configured" ≠ 401 „zły sekret". **Pusta lista = 500** (odmowa),
  bo po stronie NEXUSA `count:0` wpada do pętli DEAKTYWUJĄCEJ konta.
- **Cron `/api/cron/nexus-contractors-sync`** (`app/api/cron/…/route.ts`) — pobiera
  eksport kontraktorów z NEXUSA i pisze `contractors.nexus_match_status`. Zapis
  grupowany po werdykcie (4 zapytania, nie 689). **Nie nadpisuje `contractors.email`**
  (to adres kandydata; `activateSuccessMonitoring` wysyła na niego ankiety pulse).
  Env: `NEXUS_CONTRACTORS_URL`, `NEXUS_CONTRACTORS_API_KEY`. Cron wymaga **nazwy
  kontenera** w Coolify (bez niej pada mimo schedulera).
- **Reguła dopasowania** (`lib/contractors/nexus-match.ts`, czysta funkcja) — automat
  linkuje WYŁĄCZNIE po jednoznacznym e-mailu. Nazwisko → `pending`; wiele trafień →
  `ambiguous`; `not_found` (decyzja człowieka) NIE jest cofane przy kolejnym cronie
  (strażnikiem jest `nexus_match_status`, nie sam `nexus_contract_id`). Dopasowanie po
  nazwisku jest ZABRONIONE — patrz `20260714183425_consultant_success_hub.sql`
  („Name matching is intentionally forbidden"); 689 kontraktorów ma 0 e-maili, więc po
  starcie prawie wszystko wpada do ręcznej kolejki.
- **Kolejka ręczna** — People Ops → zakładka **„Tożsamość NEXUS"**
  (`components/internal/people/NexusIdentityTabPanel.tsx` + akcje `lib/actions/nexus-identity.ts`).
  Akcje przez `runAction`+`ExpectedError`; lista przez `requireRows` (TREŚĆ ekranu).
  Rozpoznaje `42703 undefined_column` → „czeka na migrację" zamiast błędu.
- **Migracja `20260906205803_nexus_contractor_identity.sql`** — kolumny `contractors.nexus_*`
  + częściowy UNIQUE + `nexus_roster_export()`. Nazwa pliku = wersja z rejestru
  (repo↔rejestr rozjechane, patrz „NIGDY `supabase db push`").

## Zadania cykliczne (crony)

Trasy w `COMPASS/app/api/cron/` (`ls app/api/cron` = aktualna lista — nie utrzymuję jej kopii tutaj,
bo się rozjeżdża). Autoryzacja: `withCronAuth` (Bearer `CRON_SECRET`; legacy `?secret=` działa
z ostrzeżeniem). Nowa trasa cron **zawsze** przez `withCronHeartbeat` — patrz reguła 3 wyżej.

**Harmonogramy są w DWÓCH miejscach i żadne z nich nie jest w tym repo w całości:**

| Scheduler | Co | Uwaga |
|---|---|---|
| **Coolify** → Resources → compass → Schedules | większość tras | źródło prawdy to `scheduled_tasks` w `coolify-db`, nie ten plik |
| **GH Actions** | `cron-legal-monitor-alerts.yml` (`23 8 * * *`), `cron-timesheet-reminder.yml` (`0 8 1-5 * *`) | redundancja jest bezpieczna tylko tam, gdzie trasa ma dedup w bazie |

**Pięć pułapek, każda już raz zabolała:**

1. **Zadanie Coolify wymaga nazwy kontenera.** Compose ma >1 serwis; puste `scheduled_tasks.container`
   = zadanie pada mimo działającego schedulera. To była przyczyna martwych cronów przez tygodnie.
2. **`action=cron-enable` w workflow „Coolify Ops" włącza WSZYSTKIE zadania naraz.** Po każdym takim
   przebiegu trzeba ręcznie wyłączyć te, które mają zostać martwe. Lista zadań **bez trasy**
   (włączone tikają w 404): `inbox-ingest` (Faza 44), `tech-map-rotation` (Faza 46d),
   `clock-*` (audyt C3) oraz bliźniak `legal-monitor-alerts` (harmonogram żyje w GH Actions).
   Zanim uznasz, że któreś zadanie jest potrzebne — sprawdź `ls COMPASS/app/api/cron`.
3. **Nie stawiaj drugiego schedulera dla trasy bez dedupu.** Tygodniowy digest monitoringu prawnego
   nie ma stempla — dwa schedulery = dwa maile. Przypomnienie o timesheecie **ma** rezerwację
   w `timesheet_reminder_log` (UNIQUE per user/rok/miesiąc), więc tam redundancja jest darmowa.
4. **`export const maxDuration` jest martwe** w tych trasach — Next 14.2.35 czyta ten eksport tylko
   przy buildzie i tylko dla platform serverless. W kontenerze nie robi nic; ochrona przed ubiciem
   żądania jest pozorna. Nie licz na nią przy projektowaniu długich przebiegów.
5. **Rotacja `CRON_SECRET`:** wartość jest w env vault Coolify, a serwer widać tylko z runnera GH.
   Nie kopiuj ręcznie — `action=cron-secret-ciphertext` w „Coolify Ops" drukuje sekret zaszyfrowany
   kluczem publicznym repo, gotowy do `PUT` na API sekretów.

**Heartbeaty `*_RUN` sprzed 2026-08-25 nie są dowodem historii cronów.** Do tej daty `logAudit`
pisał klientem cookie'owym, a RLS odrzucał wpisy z crona (anon) — brak wpisu nic nie znaczy.
Od 2026-08-25 heartbeat idzie service-rolą przy Bearer `CRON_SECRET`.

---

## Observability

Pełny standard: `~/.claude/rules/observability.md` (Sentry + Grafana Cloud + Cloudflare).
Odstępstwa Compassa:

- **Logger:** `COMPASS/lib/logger.ts` (zero-dep JSON) zamiast `console.*`. Hook PostToolUse blokuje
  nowe `console.*`.
- **Sentry:** projekt `compass`, SDK `@sentry/nextjs ^10.71`.
  > ⚠ **Sprostowanie (audyt B6).** Do 2026-08-25 stało tu, że „^9 wymagałoby Next 15" — **nieprawda**.
  > `peerDependencies` SDK 9 i 10 to `next: ^13.2 || ^14 || ^15 || ^16`. Ta jedna linijka zamroziła
  > SDK na 8.55.2 na pół roku, trzymała **20 z 43** podatności i posłużyła jako uzasadnienie
  > odrzucenia trzech PR-ów dependabota (#228, #278, #307). Po podniesieniu do 10.71 zostało 7
  > podatności — wszystkie wymagają majora. **Zanim zapiszesz „X wymaga Y", sprawdź
  > `npm view <pkg> peerDependencies`** — notatka bez źródła żyje dłużej niż powód, dla którego powstała.
- **Source maps:** `withSentryConfig` + `SENTRY_AUTH_TOKEN` (build-time only). Od SDK 10 zamiast
  `hideSourceMaps` jest `sourcemaps.deleteSourcemapsAfterUpload: true`.
- **Replay:** `maskAllText: true, blockAllMedia: true` — Compass trzyma dane kadrowe (RODO).
- **`GIT_SHA`:** `deploy.yml` PATCH-uje env vault Coolify przy każdym pushu (nie magic var).
- **CSP:** `next.config.mjs` wystawia `Content-Security-Policy` (enforced) + `…-Report-Only`
  obok HSTS / X-Frame-Options / nosniff / Referrer-Policy / Permissions-Policy.
- **Alloy (log shipper do Loki) NIE jest bramkowany profilem.** W `docker-compose.yml` nie ma
  klucza `profiles:` — guard usunięto świadomie w `4d75c0e` („Coolify doesn't honor
  COMPOSE_PROFILES"), więc kontener wstaje przy każdym `docker compose up`, niezależnie od
  `COMPOSE_PROFILES`. **Nie przywracaj `profiles:`** — poprzednio to po cichu wyłączyło shipping.
  Bez `GRAFANA_LOKI_*` w env vault kontener nie ma dokąd wysyłać logów. Zanim zaczniesz debugować
  „czemu nie ma logów w Loki", sprawdź jedno i drugie.

---

## Moduły wyłączone i usunięte — nie odtwarzaj ich z pamięci

| Co | Stan | Uwaga |
|---|---|---|
| **Komunikator / Wiadomości** | **USUNIĘTY** (audyt C4) | `/messages`, `lib/actions/communicator.ts`, `conversations`/`messages` — nie ma. Nie dodawaj odwołań. |
| **Auto-import maili do skrzynki** | **USUNIĘTY** (Faza 44) | wątkowanie po `conversationId` nie scalało wątków → 178 ticketów w dwie doby. Tickety wpisuje się ręcznie. Kolumny `email_*` w bazie zostały celowo. |
| **Faktury** | schowane flagą | tabela `invoices` i akcje żyją, ale `INVOICES_ENABLED` = `false`. |
| **Hub Kontraktorów** (`/internal/kontraktorzy`) | sam `redirect()` | bieżący ekran to **People Ops** (`/internal/people`). Panele `KontraktorzyHub` (~840 lin.) są nieosiągalne. |
| **Compliance** (`/admin/compliance`) | redirect na `/home` | tabele `um_*` zostały (RODO). |
| **Work Clock** | **USUWANY** (audyt C3) | UI, trasy `app/api/clock/*` i crony `clock-*` znikają. Tabele `work_clock_*` zostają w bazie (eksport RODO w `lib/gdpr/subject-data.ts` z nich czyta). ⚠ Po deployu **wyłącz zadania `clock-*` w Coolify** — inaczej tikają w 404. |

### Odwrotna pułapka: Consultant Success **żyje** na produkcji

`lib/consultant-success/` + `components/consultant-success/` + 2 trasy cron ≈ **4000 linii**.
Domyślne wartości flag w `lib/consultant-success/flags.ts` to `false`, więc z samego kodu moduł
wygląda na wyłączony — **na produkcji jest włączony i tika**. Dowód (odczyt z prod 2026-08-25):
`contractor_success_job_state` ma wiersz `consultant_success_plan`, `run_count = 15`,
`last_success_at = 2026-08-25 04:10`. Obie trasy stemplują `job_state` **dopiero po** przejściu
guardu flag, więc ten wiersz dowodzi, że `CONSULTANT_SUCCESS_ENABLED`
i `CONSULTANT_SUCCESS_AUTOMATIONS_ENABLED` są w vaulcie ustawione na `true`.

Dziś nic z tego nie wychodzi na zewnątrz, ale **nie dlatego, że kod jest martwy — dlatego, że nikt
nie jest objęty monitoringiem**: `contractor_success_settings` ma 683 wiersze i **wszystkie**
z `monitoring_status = 'inactive'`, a planner wybiera wyłącznie `'active'`
(`planner.ts`, `.eq('monitoring_status','active')`). Stąd `contractor_success_deliveries` /
`contractor_pulse_requests` / `contractor_pulse_responses` = **0 wierszy**.
**Przełączenie jednego kontraktora na `active` uruchamia realną wysyłkę maili do ludzi.**

Czego z bazy **nie widać**: stanu `CONSULTANT_SUCCESS_SHADOW_MODE` i tego, czy
`consultant-success-dispatch` ma w ogóle zadanie w Coolify (nie ma własnego wiersza w `job_state`,
co pasuje zarówno do „brak zadania", jak i do „wychodzi na `skipped`"). Sprawdź w env vault
i w `scheduled_tasks`, zanim cokolwiek włączysz.

⚠ **Nie kasuj tego katalogu jako „martwego kodu" na podstawie domyślnych wartości flag.**
Stan flag jest w env vault Coolify, nie w `flags.ts`.

---

## Gdzie szukać dalej

- [`docs/historia-faz.md`](docs/historia-faz.md) — opisy 54 faz, „dlaczego to tak wygląda".
- [`docs/audyt-2026-08-plan-naprawy.md`](docs/audyt-2026-08-plan-naprawy.md) — lista kontrolna
  audytu, dziennik postępu, świadome białe plamy.
- `docs/next-15-16-migration-plan.md` — Next 14.2.35 jest poza wsparciem (21 advisories).
- `~/.claude/rules/deployment.md`, `deployment-runbook.md`, `observability.md`, `ci-cd-unified.md`.
