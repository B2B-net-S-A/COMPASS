# Plan naprawy po audycie 2026-08-25 — lista kontrolna

> **To jest plik roboczy, nie raport.** Raport (narracja, wzorce, uzasadnienia) żyje osobno:
> https://claude.ai/code/artifact/058bba05-8256-4e9c-a0c9-e141691c9b8d
>
> Ten plik służy do **wykonania** naprawy i do udowodnienia, że nic nie zostało pominięte.
> Podstawa: audyt `main @217d466`, 94 agenty, 263 znaleziska, 70 zweryfikowanych adwersaryjnie.
> Gotowy SQL hotfixu: `scratchpad/hotfix_rls.sql` z sesji audytowej (skopiować do repo przed użyciem).

---

## Jak używać tego pliku

1. **Zawsze zaczynaj od sekcji „Zasady bezpieczeństwa"** — trzy z kroków etapu A wykonane
   w złej kolejności kładą logowanie wszystkim użytkownikom.
2. Pracuj **etapami A → B → C**, nigdy nie wyprzedzając zależności z grafu na końcu etapu A.
3. Każda pozycja ma **własną weryfikację**. Pozycja bez wykonanej weryfikacji zostaje `☐`,
   nawet jeśli kod jest napisany. „Zrobione" znaczy „zweryfikowane na produkcji".
4. Po każdej ukończonej pozycji dopisz linijkę do **Dziennika postępu** na końcu pliku.
5. **Załączniki 1–3 to gwarancja kompletności.** Zanim ogłosisz koniec, każda pozycja
   z załącznika 1 musi mieć przypisany etap albo świadomą decyzję „nie robimy".
   Załącznik 2 (193 poz.) wymaga triażu, nie wykonania. Załącznika 3 **nie otwieraj ponownie**.

**Legenda wagi:** 🔴 KRYT · 🟠 WYS · 🟡 ŚR · ⚪ NIS
**Legenda statusu:** `☐` do zrobienia · `☑` zrobione i zweryfikowane · `⊘` świadomie odrzucone (z powodem)

---

## Zasady bezpieczeństwa — przeczytać przed pierwszą zmianą

| # | Zasada | Dlaczego |
|---|---|---|
| Z1 | **Nigdy `supabase db push`.** SQL wyłącznie przez MCP `apply_migration` + osobny commit pliku. | Rejestr prod (152 wersje) i katalog repo (210 plików) mają część wspólną **2 wersje**. `db push` próbowałby zaaplikować 208 plików od nowa. |
| Z2 | **A0.1 przed A2.** Przeniesienie `syncRole` na service-role musi być **na produkcji**, zanim odbierzesz `EXECUTE`. | Odwrotna kolejność → nikt się nie zaloguje, ani hasłem, ani przez SSO. |
| Z3 | **A3 po A2.** Trigger pinujący kolumny wdrażać dopiero po odebraniu `EXECUTE`. | Dopóki `sync_user_role` chodzi kluczem użytkownika, `auth.uid()` w jej wnętrzu jest niepuste i trigger **po cichu** cofnie jej legalny UPDATE. Sync ról padnie bez błędu. |
| Z4 | **Nigdy samo `DROP POLICY` na `profiles`.** | Nie istnieje polityka „właściciel widzi swój wiersz". DROP odcina konsultantom własny profil i wywala aplikację. Używać `ALTER POLICY … TO authenticated`. |
| Z5 | **`WITH CHECK (auth.uid() = id)` to no-op.** | Postgres przy braku `WITH CHECK` używa `USING` także dla nowego wiersza. Ograniczenie kolumn wymaga triggera albo grantów kolumnowych. |
| Z6 | **Każda zmiana RLS → test w transakcji z `ROLLBACK`** przed commitem migracji. | Wzorzec z `supabase_rls_jwt_test_technique`: `BEGIN; SET LOCAL request.jwt.claims=…; SET LOCAL ROLE authenticated; …; ROLLBACK;` |
| Z7 | **Po B2 spodziewaj się nowych błędów na ekranach.** Zamiana cichej pustki na rzucony błąd **ujawnia** awarie, które dziś wyglądają jak puste tabele. To jest cel, nie regresja. | Dlatego B2 idzie **po** B1 — żeby ujawniony błąd był czytelny, a nie zamaskowany. |
| Z8 | **Prod nie ma stagingu.** Każda zmiana idzie na żywo do 46 osób. Testy E2E domyślnie celują w produkcję do czasu wykonania A0.5. | `playwright.config.ts:6` fallbackuje na `compass.dynaminds.pl`; w prod `auth.users` jest konto `e2e+consultant@b2bnetwork.pl`. |

---

## Protokół weryfikacji — do powtórzenia po każdym etapie

```bash
# 1. Baseline kodu (musi być zielony PRZED i PO)
cd COMPASS && npx tsc --noEmit && npx vitest run
```

```bash
# 2. Deploy dojechał (short SHA musi się zgadzać)
SHA=$(git rev-parse --short=7 HEAD); curl -fsSL -A "dynaminds-smoke-test/1.0 (+manual)" \
  https://compass.dynaminds.pl/api/health | jq -e ".status != \"unhealthy\" and (.version | startswith(\"$SHA\"))"
```

**3. Bramka bezpieczeństwa** (SQL, w transakcji z `ROLLBACK` — po etapie A musi przechodzić w całości):

```sql
BEGIN;
  SET LOCAL ROLE anon;
  SELECT count(*) FROM public.profiles;                       -- oczekiwane: 0
ROLLBACK;

BEGIN;
  SET LOCAL request.jwt.claims = '{"sub":"<uuid-konsultanta>","role":"authenticated"}';
  SET LOCAL ROLE authenticated;
  UPDATE public.profiles SET role='admin' WHERE id='<uuid-konsultanta>';
  SELECT role FROM public.profiles WHERE id='<uuid-konsultanta>';   -- ma zostać 'consultant'
  SELECT public.sync_user_role('<inny-uuid>','x@x.pl',true);        -- oczekiwane: błąd 42501
ROLLBACK;
```

**4. Logowanie ręcznie OBIEMA ścieżkami** — hasłem i przez SSO Microsoft. Obie wołają `syncRole`.
Automat tego nie sprawdzi, bo E2E są martwe do czasu B5.

---

## ETAP A — ugasić (dni)

> **STAN 2026-08-25 (PR „Etap A"):** kod `[x]` — zmergowany i wdrożony przez zwykły deploy.
> Migracje `[~]` — pliki są w repo, ale **NIE SĄ ZAAPLIKOWANE**; repo nie ma auto-apply.
> Aplikować ręcznie przez MCP `apply_migration` dopiero **po** zielonym smoke-teście
> `/api/health` z nowym SHA, w kolejności **A1 → A2 → A3 → A3.2 → A4**.
> Przed A3 potwierdzić, że `auth.uid()` wywołane kluczem service-role zwraca `NULL`
> (gdyby zwracało wartość, trigger cicho cofałby zmiany ról — patrz nagłówek migracji).
> Poza zakresem tego PR-a: **A4.5** (wyłączenie martwych zadań cron w Coolify) i
> **A4.6** (limity rozmiaru/MIME na bucketach) — to operacje po stronie panelu i Storage API,
> nie zmiany w repo.
>
> **Legenda:** `[x]` zrobione i zweryfikowane · `[~]` napisane, czeka na ręczne zastosowanie · `[ ]` do zrobienia

### A0 · Paczka kodu — jeden PR, deploy jako pierwszy

- [x] **A0.1 — `syncRole` wołany service-rolą** ⚠️ *blokuje A2*
  `lib/auth/sync-role.ts:16` przyjmuje klienta argumentem → podmienić na `createServiceClient()`
  w `app/login/actions.ts:155` i `app/auth/callback/route.ts:66`.
  **Weryfikacja:** zaloguj się hasłem i przez SSO; sprawdź, że rola w `profiles` się nie zmieniła.

- [x] **A0.2 — usunąć trasę `calendar.ics`** 🟠
  `app/api/internal/calendar.ics/route.ts:21` — „token" to goły UUID profilu, service-role,
  poza matcherem middleware. W zasięgu 72 urlopy + 1368 wpisów timesheet. **Zero linków w repo.**
  **Weryfikacja:** `curl -I https://compass.dynaminds.pl/api/internal/calendar.ics?token=<uuid>` → 404/410.

- [x] **A0.3 — walidacja `?next=` w callbacku** 🟡
  `app/auth/callback/route.ts:84` skleja `${origin}${next}` bez walidacji; `?next=@evil.com`
  przenosi host. Blok `if (code)` jest pomijany bez kodu, więc goły link działa dla każdego.
  Przyjmować wyłącznie `/^\/(?!\/)/` albo sprawdzać `new URL(next, origin).origin === origin`.
  **Weryfikacja:** `curl -sI ".../auth/callback?next=@evil.com" | grep -i location` → host własny.

- [x] **A0.4 — `sendPushToUserId` przestaje być publicznym endpointem** 🟡
  `lib/actions/push-subscriptions.ts:92` — eksport z `'use server'`, service-rolą, na dowolnym
  `userId` i dowolnym `payload.url`, który `public/push-sw.js:49` otwiera przez `clients.openWindow`.
  Przenieść do `lib/push/dispatch.ts` **bez** `'use server'` (wzorzec: `lib/notifications/alert-dispatch.ts`).
  **Weryfikacja:** `grep -rn "sendPushToUserId" app lib components` — zero wywołań przez `'use server'`.

- [x] **A0.5 — E2E przestaje celować w produkcję** 🟡 ⚠️ *blokuje naprawę triggera E2E w B5*
  `playwright.config.ts:6` — usunąć fallback `'https://compass.dynaminds.pl'`, wymagać jawnego
  `BASE_URL`; poprawić `.env.test.example:7-8`. Zestaw zawiera testy **piszące** (`e2e/04` robi `POST /auth/v1/signup`).
  **Weryfikacja:** `npx playwright test --list` bez `BASE_URL` → czytelny błąd, nie cichy start na prod.

- [x] **A0.6 — nie odsyłać ludzi do martwego modułu** ⚪
  `lib/constants/fallback-docs.ts:50` odsyła do „zakładki Wiadomości", a komunikator nie ma RPC w bazie.

### A1 · Odciąć anonimowy odczyt `profiles` 🔴 — *niezależne, ryzyko zero, rób pierwsze*

- [~] **A1.1 — `ALTER POLICY … TO authenticated` + `REVOKE ALL … FROM anon`**
  `supabase/migrations/20240502000000_initial_schema.sql:16`. Polityka `"Public profiles are viewable
  by everyone."` ma `roles=PUBLIC` + `USING(true)`, a `anon` ma `GRANT SELECT`. Klucz anon jest w bundlu
  (`lib/supabase/client.ts:17-19`) → 69 kolumn × 46 osób bez logowania.
  Zweryfikowane, że aplikacja **nigdy** nie czyta `profiles` jako anon: odczyty w `login/actions.ts:139`
  i `auth/callback/route.ts:50` następują **po** uwierzytelnieniu, ankieta pulse idzie service-rolą.
  ⚠️ Patrz **Z4** — nie robić `DROP POLICY`.
  **Weryfikacja:** bramka bezpieczeństwa, blok 1 (`SET LOCAL ROLE anon` → 0 wierszy).

### A2 · Zamknąć RPC z `EXECUTE` dla `authenticated` 🔴 — *wymaga wdrożonego A0.1*

- [~] **A2.1 — `REVOKE EXECUTE ON FUNCTION sync_user_role(uuid,text,boolean) FROM authenticated`**
  `supabase/migrations/20260516000004_phase20d_sync_user_role_v3.sql:69`. `SECURITY DEFINER`,
  a `p_user_id`, `p_email` i `p_is_super_admin` to parametry od wywołującego — zero sprawdzenia `auth.uid()`.
  Trzy nadużycia: `p_is_super_admin=true` → admin; `p_email` z `admin_access_list` → admin bez booleana;
  cudzy `p_user_id` + obcy mail → **degradacja istniejącego admina** do `consultant`.

- [~] **A2.2 — to samo dla dwóch funkcji lifecycle**
  `supabase/migrations/20260517000005_phase22e_helpers_and_seeds.sql:130-131, :236-237` —
  `start_offboarding_for_user` i `start_onboarding_for_user`, obie `SECURITY DEFINER` z `EXECUTE`
  dla `authenticated` i bez sprawdzania uprawnień. Dowolny pracownik może ustawić dowolnej osobie
  `employment_status='offboarding'`. Wszystkie ścieżki aplikacyjne wołają je service-rolą po guardzie,
  więc REVOKE nic nie zabiera. Precedens: `20260716000001_people_ops_security_containment.sql:110-125`.
  ⚠️ Sygnatury sprawdzić przed uruchomieniem (`pg_get_function_identity_arguments`).
  **Weryfikacja:** bramka bezpieczeństwa, blok 2, ostatnia linia (`sync_user_role` → 42501).

### A3 · Zablokować samodzielne nadanie sobie roli 🔴 — *wymaga A2*

- [~] **A3.1 — trigger `BEFORE UPDATE` pinujący 13 kolumn uprawnień**
  `supabase/migrations/20240502000000_initial_schema.sql:22`. RLS jest **wierszowa**, a `authenticated`
  ma `GRANT UPDATE` na wszystkich 69 kolumnach. Jedyny trigger na tabeli
  (`trg_profile_offboarding_reversal`) pilnuje wyłącznie `employment_status`.
  Deny-lista triggerem, **nie** allow-lista grantów kolumnowych — przy grantach każda nowa kolumna
  profilu cicho przestałaby się zapisywać, a błąd wyszedłby jako zamaskowany „Server Components render".
  Warunek: `IF auth.uid() IS NOT NULL AND NOT public.is_admin()` — przepuszcza service-role (16 wywołań
  w `user-admin.ts`) i admina (`admin-management.ts:115,153` pisze `role` klientem cookie).
  ⚠️ Patrz **Z3** i **Z5**. Gotowy kod: `hotfix_rls.sql`, krok 3.
  **Weryfikacja:** bramka bezpieczeństwa, blok 2 (rola ma zostać `consultant`).

- [~] **A3.2 — `audit_logs`: `WITH CHECK (auth.uid() = user_id)`** 🟠
  `supabase/migrations/20260218_auth_v1.sql:52`. Dzisiejszy `WITH CHECK` sprowadza się do
  `auth.uid() IS NOT NULL` → każdy zalogowany dopisuje wpis z **cudzym** `user_id`.
  Poza fałszowaniem dowodów HR to wektor sterujący: throttle samoleczenia forwardów
  (`lib/oof/forward-self-heal.ts:48-56`) czyta wpis `FORWARD_RECONCILE_RUN` — podrzucanie go
  trwale wyłącza sprzątanie osieroconych reguł ze skrzynek.
  Heartbeaty cronów (`user_id` NULL) idą service-rolą, więc ich to nie dotyczy.

### A4 · Reszta gaszenia

- [~] **A4.1 — polityka INSERT dla prefiksu `leave-proofs`** 🔴
  `lib/actions/internal-leave.ts:531-534` wgrywa **klientem użytkownika** pod `leave-proofs/{uid}/…`
  w buckecie `documents`, który ma polityki INSERT tylko dla `cvs`, `app-docs`, `candidates`, `specs`.
  **Dowód: bucket ma 0 obiektów — zwolnienia L4 nigdy nie dało się załączyć.**
  Ten sam problem: `referrals/` (`lib/actions/files.ts:270`) i `public/` (`lib/actions/documents.ts:47,:143`).
  **Weryfikacja:** wgraj PDF przez formularz urlopowy jako konsultant → `SELECT count(*) FROM storage.objects WHERE bucket_id='documents'` > 0.

- [x] **A4.2 — payroll gubi osobę, która odeszła w trakcie miesiąca** 🟠
  `lib/actions/internal-payroll.ts:326` i `:289` filtrują `employment_status !== 'exited'`
  zamiast `filterEmployedInMonth` (`lib/hr/employment-window.ts:45`).
  ⚠️ **Sama podmiana filtra to no-op** — zapytania w liniach 285 i 311 nie pobierają
  `termination_date`, więc `isEmployedInMonth` spadłby na fallback. Najpierw dodać kolumnę do `select`.
  **Weryfikacja:** Elza Grabińska (`termination_date` 2026-06-30, approved 128 h/czerwiec, 152 h/maj)
  ma się pojawić w rozliczeniu obu miesięcy na `/internal/payroll`.

- [x] **A4.3 — podpiąć `checkRateLimit` do logowania** 🟠
  `lib/auth/security.ts:16` i `:47` — obie funkcje martwe; `logLoginAttempt` zaimportowane
  w `app/login/actions.ts:7` i nigdy nie wywołane. `login_attempts` ma **0 wierszy**.
  Osobno: dokument serwowany użytkownikom (`app/api/migrate-compliance/route.ts:157`) deklaruje
  „po 5 próbach blokada na 15 min" — albo podepnij, albo popraw dokument.
  **Weryfikacja:** 6 błędnych logowań → `SELECT count(*) FROM login_attempts` > 0 i szóste odrzucone.

- [x] **A4.4 — bramki roli na `/admin/*`** 🟡
  Katalog `app/(protected)/admin/` ma tylko `error.tsx`/`loading.tsx`; nadrzędny layout sprawdza
  wyłącznie zalogowanie. Helper `requireAdminLayout()` już istnieje (`lib/auth/internal-guard.ts:143`).
  ⚠️ **Nie dawać jednego layoutu na `/admin`** — `inbox`, `compliance`, `news` są celowo otwarte
  dla TCM i grantów (`middleware.ts:120-131`). Dodać 6 osobnych `layout.tsx`:
  `dashboard`, `incubator`, `learning`, `projects`, `settings`, `support`.

- [ ] **A4.5 — wyłączyć martwe zadania cron w Coolify** ⚪
  `inbox-ingest` (endpoint usunięty w Fazie 44, tyka 404 co 5 min) i `tech-map-rotation` (usunięty w 46d).
  `gh workflow run "Coolify Ops" -f action=cron-disable-task -f task_name=…`
  ⚠️ `action=cron-enable` włącza **wszystkie** naraz — po każdym takim przebiegu wyłączyć ponownie.

- [ ] **A4.6 — limity rozmiaru i MIME na bucketach** 🟡
  Wszystkie 9 bucketów ma `file_size_limit = null` i `allowed_mime_types = null`; limity istnieją
  wyłącznie w kodzie, więc żądanie prosto do Storage REST je omija. Polityka UPDATE na publicznym
  `avatars` nie sprawdza właściciela, bo `files.ts:30` zapisuje `user_id` w **nazwie pliku**,
  a nie w folderze (`foldername(name)[2]` nie istnieje).

### Graf zależności etapu A

```
A1  ─────────────────────────────────► niezależne, rób pierwsze (ryzyko zero)

A0 (deploy całej paczki kodu)
     │
     └──► A2.1 + A2.2 (REVOKE EXECUTE)        ← MUSI być po deployu A0.1
                │
                └──► A3.1 (trigger)            ← MUSI być po A2, inaczej sync ról pada po cichu
                          │
                          └──► B5 (testy RLS)

A4.2 (payroll + termination_date) ──► B4 (jedna reguła rosteru)
A4.4 (6 layoutów pod /admin)      ──► B3 (guard-by-default + reguła CI)
A0.5 (BASE_URL)                   ──► B5 (naprawa triggera E2E)
```

---

## ETAP B — zatrzymać krwawienie (1–2 tygodnie)

Każda pozycja kasuje **całą klasę** błędów. Kolejność wg zwrotu z inwestycji.

- [ ] **B1 · Jeden wrapper server actions** — *wysiłek M+L, kolejność 1*
  Dwie klasy, jedna przyczyna: `throw` z `'use server'` jest w prod zamieniany na „An error occurred
  in the Server Components render", a `@sentry/nextjs` 8.55.2 **nie instrumentuje** `'use server'`
  (wrapping loader zna tylko page/api-route/server-component/route-handler/middleware;
  `instrumentation.ts:17` to świadomy no-op na Next 14).
  Skala: 63 pliki `'use server'`, 489 akcji, 805–871 `throw`, **zero wrapperów**.
  Wrapper musi rozróżniać: **oczekiwany** (walidacja, guard) → `{success:false, error}` jako dane,
  bez Sentry · **nieoczekiwany** → `captureException` + generyczny komunikat.
  Migrować modułami: `internal-leave.ts` (limit urlopu w :599 — gałąź osiągalna, 5 profili UoP
  z ustawionym limitem), `internal-timesheet.ts`, `internal-bonus.ts`, `tech-map.ts`.
  **Weryfikacja:** przekrocz limit urlopu w UI na produkcji → widzisz treść komunikatu, nie bełkot.

- [ ] **B2 · Jeden wzorzec zapytań listowych** — *wysiłek M+L, kolejność 2, po B1 (patrz Z7)*
  Naprawa incydentu z 25.08 objęła **jeden plik** (`support-inbox.ts:173-186`: `META_CHUNK=60`
  + `if (err) throw` + `if (data === null) throw`). Reszta repo ma wzorzec-anty:
  - **150** wywołań `.in()` w `lib/actions/*.ts`, chunkowanie tylko w `support-inbox.ts`.
    Najgorsze: `contractors.ts:148` (**683 id**, ~26 kB URL przy progu ~15 kB), `:993` (349/356 id).
  - **334** destrukturyzacje `const { data } = await …` bez sprawdzenia `error`.
    Top: `internal-leave.ts` (42), `contractors.ts` (22), `internal-timesheet.ts` (19),
    `placements.ts` (16), `lifecycle.ts` (16).
    Najgroźniejsza: `contractors.ts:1058-1062` — `client_departures` przez `select('*')` bez `error`,
    `rows.length === 0 → return []` zamienia awarię w **pustą tabelę Zejść bez komunikatu**.
  - **159** `select('*')` — istotne tylko przy ≥100 wierszach lub ciężkich kolumnach.
  Zrobić: helper `selectInChunks(table, column, ids, columns)` w `lib/supabase/` + zasada
  „jawne kolumny, chunk ≤60, `if (error) throw`". Sweep **po jednym ekranie**, nie całym repo naraz.

- [ ] **B3 · Guard-by-default dla akcji i tras** — *wysiłek M, kolejność 3*
  **42 eksporty akcji bez guarda.** Po odsianiu fałszywych trafień zostają m.in.:
  `knowledge-base.ts:16` `createEmbedding()` (publiczny endpoint palący OpenAI — koszt/DoS) ·
  `course-embeddings.ts:47` `regenerateCourseEmbedding()` (service-role + OpenAI) ·
  `files.ts:394` `adminGenerateProfileFromCV()` (pobiera dowolną ścieżkę ze storage → LLM) ·
  `maintenance.ts:8` `cleanDuplicateCandidates()` (celuje w **nieistniejącą** tabelę).
  `app/api`: 35 tras, 13 bez `withAuth`/`withCronAuth`; po A0.2 zostaje `migrate-compliance`
  (sekret w query stringu) i `clock/*`.
  **Dołożyć krok w CI**, który wywala build, gdy nowy eksport w `lib/actions/` nie woła guarda —
  inaczej za dwa miesiące lista znów urośnie.

- [ ] **B4 · Jedna reguła „kto jest na liście"** — *wysiłek M, kolejność 4, po A4.2*
  **36** ręcznych filtrów (`neq('employment_status','exited')`) wobec **2** użyć kanonicznego
  `filterEmployedInMonth`. Obie reguły są potrzebne i **mylenie ich boli w obie strony** (A4.2 to
  dokładnie ten błąd). Wystawić dwie jawne funkcje w `lib/hr/employment-window.ts`:
  `activeRoster()` („tu i teraz": adresaci, dropdowny, crony) i `employedInMonth()` (raporty miesięczne),
  potem przejść 36 miejsc z jawną decyzją.

- [ ] **B5 · Testy pilnujące etapu A** — *wysiłek S, po A1–A3*
  Jeden plik testowy jako `anon`/`authenticated`: (a) `profiles` dla anon → 0 wierszy,
  (b) `rpc('sync_user_role', {p_is_super_admin:true})` → odmowa, (c) `UPDATE profiles SET role='admin'`
  własnego wiersza → rola niezmieniona. **Bez tego pierwsza „porządkująca" migracja RLS cicho odtworzy dziurę.**
  Przy okazji: `.github/workflows/e2e-tests.yml:5` nasłuchuje `workflows: ["Deploy to Hetzner"]` —
  nazwy usuniętej 2026-05-04 (realna: `Deploy`). Nawet po naprawie triggera zestaw nie wystartuje,
  bo `e2e/04-rls-database.spec.ts:14` woła `requireEnv` **na poziomie modułu** i kładzie kolekcję
  wszystkich 59 testów. ⚠️ Nie naprawiać triggera przed A0.5 — włączysz testy piszące przeciw produkcji.

- [ ] **B6 · Odblokować zależności** — *wysiłek M*
  Najpierw **skasować błędną notatkę w `CLAUDE.md:1775`** („`@sentry/nextjs ^9` wymagałoby Next 15" —
  peer dep Sentry 9 i 10 to `^13.2 || ^14 || ^15 || ^16`). Ta jedna linijka zamraża **20 z 43 podatności**
  i spowodowała odrzucenie PR-ów #228, #278, #307.
  Potem: 14 PR-ów dependabota w zatorze do 89 dni (7 HIGH naprawialnych bez majora), brak `npm audit`
  w CI, `renovate.json` z zerem PR-ów od 3 miesięcy. Next 14.2.35 poza wsparciem — 21 advisories,
  w tym HIGH SSRF/DoS trafiające w Server Actions i App Router. Plan migracji: `docs/next-15-16-migration-plan.md`.

---

## ETAP C — spłata strukturalna (w tle, po jednej pozycji między pracą produktową)

- [ ] **C1 · Migracje odtwarzalne** — *wysiłek L, po całym etapie A*
  210 plików / 152 wpisy w rejestrze / **2 wersje wspólne**. Bazy **nie da się odtworzyć z repo**:
  trzy tabele komunikatora nie mają żadnej migracji tworzącej je, a trzy migracje danych
  kadrowo-płacowych istnieją wyłącznie na produkcji. 71 plików ma prefiks, którego CLI nie uzna.
  Plan: `supabase db dump` → jeden `00000000000000_baseline.sql`, stare 210 do `_archive/`
  (historia, nie ścieżka wykonania), i jedna reguła od teraz: `apply_migration` przez MCP + commit
  pliku o **tej samej** wersji, którą zwrócił rejestr.

- [ ] **C2 · Domknąć Fazę 37** — *wysiłek M*
  Mirror vs legacy: `onboarding_cases` 2 = `onboarding_progress` 2, `exit_cases` 4 = `exit_interviews` 4,
  `support_contractor_meta` 147 = `contractor_conversations` 147. Utrzymuje to 6 triggerów, a backend
  czyta legacy — **mirror ma zero czytelników**. Przy 6 wierszach lifecycle tańsze jest **usunięcie
  mirrora**, nie migracja backendu na niego.
  ⚠️ `support_tickets` (544) miesza trzy populacje — każdy szeroki czytelnik poza inboxem/analityką
  musi wykluczać `inbox_%` **i** `contractor_%`.

- [ ] **C3 · Martwy kod** — *wysiłek M*
  ~52 pliki / ~7,2 tys. linii nieosiągalnych z żadnego page/layout/route/middleware.
  Klastry: **Work Clock** (~2,9 tys. lin. — UI wyłączone w `app/(protected)/layout.tsx:24-25,157`,
  ale 5 tras `app/api/clock/*` i 4 crony **żywe**, więc obszar jest większy, nie mniejszy) ·
  **Lojalność** (~1,4 tys. lin., `loyalty_transactions` = 0 wierszy) · **hub Kontraktorów** (~840 lin.,
  `page.tsx` to sam `redirect()`, a CLAUDE.md „Faza 38" opisuje go jako żywy) · **kit DS** (~690 lin.,
  barrel `components/ds/index.ts` ma 0 importerów) · **Akademia AI** (~640 lin., 0 wywołań).
  ⚠️ **Skan po grafie importów MUSI mieć allowlistę.** `public/push-sw.js` jest rejestrowany
  **stringiem** (`lib/hooks/usePushSubscription.ts:104`) — skasowanie wyłącza web push.
  `next-env.d.ts` wymagany przez Next. Krok w CI zostawić jako report-only.
  ⚠️ `RetencjaPanel` jest jedynym konsumentem agregatu z `contractors.ts:141-153` — usuwając panel,
  usuń też agregat (tańsze niż chunkowanie tego zapytania w B2).

- [ ] **C4 · Decyzja o komunikatorze** — *wysiłek S–M*
  `create_direct_conversation` i `create_broadcast_conversation` **nie istnieją w bazie** —
  migracja `20260223_fix_communicator_rls_v2.sql` nigdy nie weszła (brak w rejestrze, nietypowy
  8-cyfrowy prefiks). `conversations`/`messages` = 0 wierszy, `/messages` bez linku w nawigacji,
  a `(supabase as any).rpc` w `communicator.ts:169/355/397` zdejmuje kontrolę typów.
  Albo zaaplikować migrację i usunąć `as any`, albo usunąć moduł. **Nie zostawiać stanu pośredniego** —
  dziś testy jednostkowe są zielone, bo mockują nieistniejące RPC.

- [ ] **C5 · Warstwa RODO** — *ryzyko prawne, nie techniczne*
  `app/privacy-policy/page.tsx:38` mówi „Strona w przygotowaniu", choć regulamin warunkuje rejestrację
  akceptacją tej polityki. `um_user_consents` = **0 wierszy**. `um_legal_documents` ma **inny schemat
  niż kod, który go zasila** (`migrate-compliance/route.ts:172-176` robi `upsert` po nieistniejącej
  kolumnie `slug`) → seed pada. **Brak jakiegokolwiek mechanizmu usuwania danych osoby** przy
  deklaracji „prawo do zapomnienia: usunięcie w 30 dni". `audit_logs` rośnie bez retencji przy
  deklarowanych 12 miesiącach.

- [ ] **C6 · Wydajność bazy** — *453 trafienia advisora*
  145× `auth.uid()` bez `(select …)` na 66 tabelach (re-ewaluacja per wiersz) · 134 nieindeksowane
  klucze obce · 113 nieużywanych indeksów · 59 zdublowanych polityk permisywnych · limit 10 połączeń Auth.
  Objaw: `support_categories` — 1,13 mln skanów sekwencyjnych i 11 mln odczytanych krotek
  na **13-wierszowej** tabeli, bo polityka `support_tickets` woła dwie funkcje per wiersz.
  Przy 46 użytkownikach nie boli, ale koszt rośnie z każdą dopisaną polityką.

- [ ] **C7 · Nawigacja mobilna** — *wysiłek S*
  `components/layout/MobileMenu.tsx:130` deklaruje 6 ról, renderuje linki dla 3 — pomija `manager`
  i `talent_community`; `AppLayout.tsx:72` nie przekazuje `hasTcmAccess`/`isInboxHandler`.
  Osobno `:151-162` renderuje martwy link „Faktury do akceptacji" do wyłączonego modułu. 8 osób na prodzie.

- [ ] **C8 · Nagłówki bezpieczeństwa i konfiguracja builda** — *wysiłek S*
  `next.config.mjs:96-107` ustawia HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy —
  **bez `Content-Security-Policy`** (0 trafień w całym repo).
  `next.config.mjs:8-9` ma `ignoreDuringBuilds` i `ignoreBuildErrors` z **uczciwym uzasadnieniem**
  (OOM fazy typów na build-hoście ARM bez swapu). Problem jest węższy niż się wydaje: każda ścieżka
  omijająca CI (redeploy z panelu Coolify, `workflow_dispatch`) buduje bez sprawdzenia typów.
  `:16` dopuszcza obrazy z `txzflesacqvlyhxwfjxk.supabase.co` — **innego projektu** niż produkcyjny.

- [ ] **C9 · `CLAUDE.md` (156 KB, 54 fazy)** — *wysiłek M*
  Rozdzielić na żywe reguły (zostają) i historię faz (do `docs/historia-faz.md`).
  Zweryfikowane rozjazdy do naprawy przy okazji: notatka o Sentry (B6) · „Alloy sidecar: profile-gated"
  (w `docker-compose.yml` nie ma klucza `profiles:`) · komentarz `user-admin.ts:338` o `sync_user_role` ·
  komentarz `communicator.ts:167` („funkcja istnieje, brakuje w typach" — nie istnieje) ·
  „Faza 38" opisująca hub Kontraktorów jako żywy · tabela cronów Fazy 50 z zadaniem, którego nigdy nie dodano.

- [ ] **C10 · Odporność integracji zewnętrznych** — *5 znalezisk*
  `lib/graph/client.ts:57-58` — `Client.init()` bez middleware i **bez per-request timeoutu**;
  jedyny `AbortSignal` w całej warstwie integracji jest w `lib/teams/webhook.ts:98`. Konsumenci to
  sekwencyjne pętle po ~37 skrzynkach, więc jedna zawieszona zjada budżet czasu całej trasy —
  to jest dokładnie ten wzorzec, który w Fazie 41b kazał przestawić kolejność w `oof-reconcile`.
  `lib/oof/forward-rules.ts:229` — sprzątacz osieroconych reguł buduje listę skrzynek wyłącznie
  z `HR_ROLES` i odrzuca `exited`/`offboarding`, mimo że pass 1 zakłada reguły szerzej;
  osierocony forward u osoby po offboardingu nigdy nie zostanie skasowany.
  `lib/actions/internal-leave.ts:3616` — `transactionId` z `Date.now()` łamie idempotencję
  zadeklarowaną w `lib/calendar/graph-events.ts`.
  `lib/email/sender.ts:66,101-117` — martwy kanał Resend nadal w kodzie i w `package.json`,
  mimo że `docs/microsoft-graph-email-setup.md` ogłasza go usuniętym.

- [ ] **C11 · Obserwowalność zadań cyklicznych** — *4 znaleziska*
  **13 z 19 tras cron nie zostawia w bazie żadnego śladu wykonania** — cicha awaria harmonogramu
  jest niewykrywalna bez SSH. Dodać heartbeat `*_RUN` (`phase: start` / `done`) wzorem
  `FORWARD_RECONCILE_RUN`; od 2026-08-25 `logAudit` pisze service-rolą przy Bearer `CRON_SECRET`,
  więc RLS już tego nie blokuje.
  `app/api/cron/legal-monitor-alerts/route.ts:153` — stempluje `alerted_at` i `reminded_at`
  **bezwarunkowo**, po liczbie prób, nie po udanych dostarczeniach → nieudany alert nigdy się nie ponowi.
  `app/api/cron/tc-sync/route.ts:56` — zwraca HTTP 200 również przy awarii pobrania z SharePointa
  i przy braku `TC_SYNC_FILE_URL`; nie raportuje nic do Sentry i nie zostawia heartbeatu.
  `app/api/cron/oof-reconcile/route.ts:11` — `export const maxDuration` jest **martwe** w 10 trasach:
  Next 14.2.35 czyta ten eksport tylko w czasie builda i tylko dla platform serverless.
  W kontenerze nie robi nic, więc ochrona przed ubiciem żądania jest pozorna.

- [ ] **C12 · Integralność danych kontraktorów** — *3 znaleziska*
  `lib/actions/placements.ts:253-288` — `commitPlacementImport` **nie ustawia `contractor_id`**,
  w odróżnieniu od importera Wejść/Zejść (`lib/contractors/import-core.ts:196`). Na `placements`
  nie ma triggera, więc jedyne wypełnienie FK to jednorazowy backfill z Fazy 33a.
  Stan prod: **17/17 zlinkowanych z backfillu, 0/52 ze wszystkich późniejszych importów**.
  Skutek: placement nie pokazuje się na profilu kontraktora ani w Consultant Success.
  Dobra wiadomość — 51 z 52 nielinkowanych ma już wiersz w `contractors` o identycznej
  znormalizowanej nazwie, więc backfill po `lower(btrim(full_name))` domyka to bez zgadywania.
  `supabase/migrations/20260606000004_phase33d_client_movements.sql:54` — `client_entries` ma
  COMMENT „Read-only analytics; Live entries use placements", a cron `tc-sync` dopisuje do niej
  bieżące dane codziennie. Komentarz albo kod jest nieprawdziwy — rozstrzygnąć który.
  `lib/supabase/lifecycle-client.ts:24,29` — klienty Supabase typu `any`; powód ich istnienia
  wygasł, bo wszystkie tabele i RPC z komentarza już są w `database.types.ts`.

---

## Świadomie NIE robimy

| ⊘ | Pozycja | Powód |
|---|---|---|
| ⊘ | **Staging / osobny projekt Supabase** | Drugi serwer, drugi Coolify, drugi komplet sekretów i drugi dryf schematu. Przy 40 użytkownikach i jednym devie trwały koszt większy niż eliminowane ryzyko. Tańsze rozwiązanie jest w A0.5 + lokalny `next start`. |
| ⊘ | **Migracja wszystkich 489 akcji na wrapper** | Wartość jest w formularzach, na które użytkownik może zareagować. Guardy autoryzacyjne **mają** być zamaskowane — to cecha. |
| ⊘ | **`captureException` na wszystkich 871 `throw`** | Większość to celowe błędy walidacji. Hurtowe raportowanie utopi realne awarie w szumie i wypali limit 5k zdarzeń/mies. na free tier. |
| ⊘ | **`select('*')` → jawne kolumny we wszystkich 159 miejscach** | Tylko przy ≥100 wierszach albo ciężkich kolumnach (`client_departures` 365, `contractors` 683, `support_tickets` 544). Reszta to kosmetyka. |
| ⊘ | **Sprzątanie 233 warningów ESLint** | Zero wpływu na działanie, realne ryzyko przypadkowej zmiany zachowania hooków. Naprawiać wyłącznie w plikach i tak dotykanych. |
| ⊘ | **Flaky `legal-monitor.test.ts:77`** | Zimny `await import()` przy limicie 10 s; wrażliwy na obciążenie, nie deterministycznie zepsuty (mój przebieg: 1272/1272 zielone). Naprawić przy okazji następnej zmiany w monitoringu prawnym. |
| ⊘ | **Przenumerowanie historycznych migracji** | Po C1 71 plików z 8-cyfrowym prefiksem to archiwum, którego nikt nie wykonuje. |
| ⊘ | **Zmiana źródła prawdy o rolach na `admin_access_list`** | 91 polityk RLS woła `is_admin()`, które czyta `profiles.role`. Po A2+A3 kolumna przestaje być zapisywalna przez użytkownika — problem znika bez przebudowy modelu. |

---

## Czego audyt NIE objął — świadome białe plamy

Zanim ogłoszę „nic nie pominięte", to musi być przeczytane. Poniższe obszary **nie mają ani jednego
znaleziska** — co znaczy „nie sprawdzone", a nie „czyste":

**Moduły bez wzmianki:** `lib/ai/` (LLM Anthropic — `llm.ts`, `embeddings.ts`), `lib/i18n/`, `lib/pdf/`,
`lib/html/`, `lib/teams/`, `lib/rates/`, `lib/clock/`, `lib/consultant-success/`,
`components/{incubator,league,learning,news,documents}`,
`app/(protected)/{league,learning,incubator,projects,docs,consent,settings,more}`, `scripts/`, `data/`.

**Trasy API:** przejrzano **1 z 35** poza cronami (`calendar.ics`). Nietknięte m.in.
`app/api/migrate-compliance/route.ts` (DDL service-rolą), `app/api/admin/snapshot/route.ts`,
`app/api/digest/route.ts`, `app/api/akademia/{attachment,certificate}`.

**Klasy problemów nieobecne ani razu:** limity rozmiaru żądań/odpowiedzi · prompt injection
i koszty LLM · dostępność (a11y) · i18n · offline/PWA · backup i disaster recovery ·
strefy czasowe (wzmianki w cytatach, ale żaden wymiar ich nie badał).

**Sprawdzone i CZYSTE** (nie szukać drugi raz): `exec_sql` nie istnieje w bazie ·
`app/api/auth/auto-login/route.ts` zwraca 403 · `/api/digest` deleguje autoryzację do sesji (IDOR zamknięty) ·
`/api/akademia/*` mają `withAuth` · `/api/public/consultant-pulse` ma rate limit i walidację Zod ·
hooki realtime sprzątają subskrypcje (`removeChannel` w cleanupie).

---

## Załącznik 1 — 55 znalezisk zweryfikowanych adwersaryjnie

Każde przeszło przez osobnego agenta z zadaniem **obalenia**. Kolumna „Etap" musi być wypełniona
dla wszystkich, zanim ogłoszę koniec — `☐` znaczy „jeszcze nieprzypisane".

| # | Waga | Rodzaj | Znalezisko | Plik | Etap |
|---|---|---|---|---|---|
| 1 | 🔴 KRYT | awaria | Funkcja nie sprawdza, czy `p_email` należy do `p_user_id` — wystarczy podać w `p_email` adres dowolnego admina z `admin_access_list` (a `profiles` ma politykę SELECT „Public profiles… | `COMPASS/supabase/migrations/20260516000004_phase20d_sync_user_role_v3.sql:69` | **A2.1** |
| 2 | 🔴 KRYT | awaria | Nieścisłość: „brak WITH CHECK" nie jest tu przyczyną. Postgres przy braku WITH CHECK w polityce FOR UPDATE używa klauzuli USING także dla nowego wiersza, więc dopisanie `WITH CHECK… | `COMPASS/supabase/migrations/20240502000000_initial_schema.sql:22` | **A3.1** |
| 3 | 🔴 KRYT | awaria | Polityka RLS `"Public profiles are viewable by everyone."` (SELECT, `using (true)`, rola PUBLIC — czyli także `anon`) nadal obowiązuje na produkcji i w połączeniu z grantem… | `COMPASS/supabase/migrations/20240502000000_initial_schema.sql:16` | **A1.1** |
| 4 | 🔴 KRYT | awaria | profiles: polityka SELECT `USING(true)` dla roli `public` + GRANT SELECT dla `anon` = nieuwierzytelniony odczyt całego katalogu 46 pracowników przez /rest/v1/profiles kluczem anon z… | `COMPASS/supabase/migrations/20240502000000_initial_schema.sql:16` | **A1.1** |
| 5 | 🔴 KRYT | awaria | profiles: polityka UPDATE bez WITH CHECK i bez ograniczenia kolumn — każdy ZALOGOWANY użytkownik może z przeglądarki nadpisać własną rolę i flagi uprawnień. | `COMPASS/supabase/migrations/20240502000000_initial_schema.sql:22` | **A3.1** |
| 6 | 🟠 WYS | awaria | /api/internal/calendar.ics przyjmuje jako „token" goły UUID profilu i po jego dopasowaniu service-rolą (createServiceClient, route.ts:27-32) zwraca bez żadnego uwierzytelnienia… | `COMPASS/app/api/internal/calendar.ics/route.ts:21` | **A0.2** |
| 7 | 🟠 WYS | awaria | `start_offboarding_for_user` ORAZ `start_onboarding_for_user` (COMPASS/supabase/migrations/20260517000005_phase22e_helpers_and_seeds.sql:130-131 i :236-237) są SECURITY DEFINER (owner… | `COMPASS/supabase/migrations/20260517000005_phase22e_helpers_and_seeds.sql:237` | **A2.2** |
| 8 | 🟠 WYS | dług | **~52 pliki / ~7,2 tys. linii w `components/` i `lib/` są nieosiągalne z jakiegokolwiek page/layout/route/middleware.** Zweryfikowane niezależnym BFS po grafie importów (54 pliki /… | `COMPASS/components/ds/index.ts:1` | **C3** |
| 9 | 🟠 WYS | dług | Wyjątki rzucane w server actions nie generują zdarzeń w Sentry. | `COMPASS/instrumentation.ts:8` | **B1** |
| 10 | 🟠 WYS | awaria | `getPayrollSummaryAll` (COMPASS/lib/actions/internal-payroll.ts:326) i `getPayrollSummaryForManager` (tamże:289) filtrują listę przez `employment_status !== 'exited'` zamiast reguły… | `COMPASS/lib/actions/internal-payroll.ts:326` | **A4.2** |
| 11 | 🟠 WYS | awaria | audit_logs: polityka INSERT ma martwy pierwszy człon — WITH CHECK sprowadza się do 'auth.uid() IS NOT NULL', więc każdy ZALOGOWANY użytkownik (dowolna rola, w tym consultant) może… | `COMPASS/supabase/migrations/20260218_auth_v1.sql:52` | **A3.2** |
| 12 | 🟠 WYS | dług | Import placementów (`commitPlacementImport`, COMPASS/lib/actions/placements.ts:254-288) nie ustawia `placements.contractor_id` — w odróżnieniu od importera Wejść/Zejść, który woła… | `COMPASS/lib/actions/placements.ts:253` | **C12** |
| 13 | 🟠 WYS | awaria | Komunikaty walidacyjne rzucane z server actions są w produkcji zastępowane generycznym „An error occurred in the Server Components render…", bo w repo nie ma wrappera zamieniającego… | `COMPASS/lib/actions/internal-leave.ts:599` | **B1** |
| 14 | 🟠 WYS | awaria | latestInterviewByContractor (COMPASS/lib/actions/contractors.ts:990-995) wysyła `.in('contractor_id', ids)` z ~349 id (Onboarding) i 356 id (Exit) — potwierdzone na prodzie — czyli URL… | `COMPASS/lib/actions/contractors.ts:993` | **B2** |
| 15 | 🟡 ŚR | awaria | Brak `app/(protected)/admin/layout.tsx` — katalog zawiera tylko `error.tsx`/`loading.tsx`, a `app/(protected)/layout.tsx` sprawdza wyłącznie zalogowanie. | `COMPASS/app/(protected)/admin/settings/page.tsx:11` | **A4.4** |
| 16 | 🟡 ŚR | awaria | sendPushToUserId (COMPASS/lib/actions/push-subscriptions.ts:92) jest eksportem modułu 'use server' bez jakiejkolwiek autoryzacji, działającym service-rolą na dowolnym userId i dowolnym… | `COMPASS/lib/actions/push-subscriptions.ts:92` | **A0.4** |
| 17 | 🟡 ŚR | awaria | Open redirect w GET /auth/callback: parametr `?next=` (route.ts:24) jest sklejany stringiem z originem (route.ts:85) bez walidacji, więc wartości zaczynające się od `@` lub `.`… | `COMPASS/app/auth/callback/route.ts:84` | **A0.3** |
| 18 | 🟡 ŚR | awaria | Blokada zarchiwizowanych kont (`isArchivedAccount`) nie obowiązuje na trasach `/api/**` poza dwiema (`akademia/attachment`, `akademia/certificate`), bo matcher middleware wycina `api`… | `COMPASS/middleware.ts:168` | **B2** |
| 19 | 🟡 ŚR | dług | loadAuthContext (COMPASS/lib/auth/internal-guard.ts:54) nie czyta `employment_status`, więc żaden z 20 guardów require*Action/Layout nie odrzuca konta `exited` — reguła archiwizacji… | `COMPASS/lib/auth/internal-guard.ts:54` | **A0.3** |
| 20 | 🟡 ŚR | awaria | middleware.ts nie odróżnia „nie udało się odczytać profilu" od „profil bez roli": `error` z `.single()` nie jest destrukturyzowany (middleware.ts:62-67), a klient nie dostaje `global:… | `COMPASS/middleware.ts:62` | **B3** |
| 21 | 🟡 ŚR | awaria | `loadAuthContext` (COMPASS/lib/auth/internal-guard.ts:54-66) ignoruje `error` z SELECT-a na `profiles` i przy awarii zapytania degraduje rolę do `'consultant'` (`profile?.role ??… | `COMPASS/lib/auth/internal-guard.ts:54` | **B3** |
| 22 | 🟡 ŚR | awaria | Trasa `legal-monitor-alerts` stempluje `alerted_at` (sekcja 1) i `reminded_at` (sekcja 4) bezwarunkowo po wywołaniu `dispatchGenericAlert`, który zwraca liczbę PRÓB, nie udanych… | `COMPASS/app/api/cron/legal-monitor-alerts/route.ts:153` | **C11** |
| 23 | 🟡 ŚR | dług | 13 z 19 tras cron (nie 16) nie zostawia w bazie żadnego śladu wykonania — cicha awaria harmonogramu jest niewykrywalna bez SSH. | `COMPASS/app/api/cron/lifecycle-checkins/route.ts:24` | **C11** |
| 24 | 🟡 ŚR | dług | Klient Microsoft Graph (`COMPASS/lib/graph/client.ts:57`, `Client.init({ authProvider })`) jest tworzony bez middleware i bez per-request timeoutu, a konsumenci to sekwencyjne pętle po… | `COMPASS/lib/graph/client.ts:57` | **C10** |
| 25 | 🟡 ŚR | dług | `export const maxDuration` w 10 trasach (9 cronów + `app/api/public/consultant-pulse/[token]/route.ts:11`) jest w tym wdrożeniu martwe: Next 14.2.35 czyta ten eksport wyłącznie w… | `COMPASS/app/api/cron/oof-reconcile/route.ts:11` | **C11** |
| 26 | 🟡 ŚR | dług | Faktury (Faza 26): 2422 linie kodu + tabela z 24 kolumnami, 7 politykami RLS, 3 triggerami i bucketem utrzymywane w limbo od 2026-05-19 dla 0 wierszy. | `COMPASS/lib/feature-flags.ts:12` | **A4.6** |
| 27 | 🟡 ŚR | awaria | Endpoint /api/admin/snapshot raportuje 5 z 8 pól KPI jako stałe zero, bo odwołuje się do zarchiwizowanego legacy i nieistniejącej kolumny. | `COMPASS/lib/admin/snapshot-metrics.ts:51` | **C3** |
| 28 | 🟡 ŚR | awaria | Rola finanse widzi dwa nieaktualne ślady wyłączonego modułu faktur (Phase 26): (a) `components/layout/MobileMenu.tsx:151-162` renderuje link „Faktury do akceptacji" →… | `COMPASS/components/layout/MobileMenu.tsx:154` | **C3** |
| 29 | 🟡 ŚR | awaria | Utwórz zadanie z tego zgłoszenia" jest osiągalne na karcie każdego zgłoszenia (admin/talent_community/has_tcm_access), ale jego dedykowany widok listy jest martwy: ZadaniaPanel… | `COMPASS/components/inbox/TicketToTaskButton.tsx:27` | **C3** |
| 30 | 🟡 ŚR | awaria | Smart Work Clock (Faza 17): warstwa prezentacji martwa, ale warstwa akcji ŻYWA i stale zwracająca zero — plus przycisk w timesheecie, który nigdy nie zadziała. | `COMPASS/app/(protected)/layout.tsx:157` | **C3** |
| 31 | 🟡 ŚR | dług | Consultant Success jest na prodzie WŁĄCZONY (dowód: `contractor_success_job_state.consultant_success_plan`, run_count=15, last_started_at 2026-08-25 04:10 — planner zapisuje stan… | `COMPASS/lib/actions/consultant-success.ts:72` | **C3** |
| 32 | 🟡 ŚR | awaria | payroll-export połyka błędy wszystkich czterech zapytań o dane (timesheets, leave_requests, attendance_records — route.ts:150-155 — oraz timesheet_entries — route.ts:168) i przy awarii… | `COMPASS/app/api/internal/payroll-export/route.ts:168` | **B2** |
| 33 | 🟡 ŚR | awaria | Roster kontraktorów (`listContractorRoster`, COMPASS/lib/actions/contractors.ts:1091) deduplikuje po kluczu zawierającym datę startu, więc gdy `placements` i `client_entries` mają to… | `COMPASS/lib/actions/contractors.ts:1091` | **B2** |
| 34 | 🟡 ŚR | awaria | Trasa `/api/cron/tc-sync` zwraca HTTP 200 również przy awarii pobrania pliku z SharePointa (oraz przy braku `TC_SYNC_FILE_URL` i braku aktora importu), nie raportuje nic do Sentry i… | `COMPASS/app/api/cron/tc-sync/route.ts:56` | **C11** |
| 35 | 🟡 ŚR | awaria | Sprzątacz osieroconych reguł (pass 3, COMPASS/lib/oof/forward-rules.ts:216+229) buduje listę skrzynek wyłącznie z ról HR_ROLES i odrzuca `exited`/`offboarding`, mimo że pass 1 w tym… | `COMPASS/lib/oof/forward-rules.ts:229` | **C10** |
| 36 | 🟡 ŚR | awaria | Wywolania Microsoft Graph nie maja wlasnego timeoutu — jedyny AbortSignal w calej warstwie integracji to lib/teams/webhook.ts:98. | `COMPASS/lib/graph/client.ts:58` | **C10** |
| 37 | 🟡 ŚR | awaria | Moduł komunikatora (`/messages`) jest na prodzie trwale niesprawny, ale bez wejścia z nawigacji, więc nie dotyka dziś użytkowników. | `COMPASS/supabase/migrations/20260220_fix_conversation_rls.sql:18` | **C4** |
| 38 | 🟡 ŚR | dług | Bucket `chat-attachments` jest publiczny (`storage.buckets.public=true` na prodzie), a polityka SELECT (`"Users can view chat attachments"`, qual: `bucket_id = 'chat-attachments'`) nie… | `COMPASS/supabase/migrations/20260216_chat_attachments.sql:19` | **A4.6** |
| 39 | 🟡 ŚR | awaria | Mobile: manager i talent_community nie mają skrótów do swoich narzędzi zespołowych. | `COMPASS/components/layout/MobileMenu.tsx:130` | **B3** |
| 40 | 🟡 ŚR | awaria | Komunikator (`/messages`) jest martwy end-to-end, a `(supabase as any).rpc(...)` to ukrywa. | `COMPASS/lib/actions/communicator.ts:169` | **C1** |
| 41 | 🟡 ŚR | dług | Akcje listowe w module lifecycle/kontraktorzy zamieniają awarię zapytania na pustą listę — UI nie odróżnia „zero danych" od „nie udało się odczytać". | `COMPASS/lib/actions/lifecycle.ts:283` | **B2** |
| 42 | 🟡 ŚR | dług | `client_entries` ma na produkcji COMMENT opisujący ją jako archiwum wejść z 2024 („Read-only analytics; Live entries use placements”), a codzienny cron `tc-sync` (`0 5 * * *`) dopisuje… | `COMPASS/supabase/migrations/20260606000004_phase33d_client_movements.sql:54` | **C12** |
| 43 | 🟡 ŚR | dług | `COMPASS/lib/supabase/lifecycle-client.ts:24,29` eksportuje klienty Supabase o typie `any` dla modułu Onboarding & Exit. | `COMPASS/lib/supabase/lifecycle-client.ts:24` | **C12** |
| 44 | 🟡 ŚR | dług | Katalog `COMPASS/supabase/migrations/` (210 plików) nie jest odtwarzalnym źródłem schematu prod: ledger `supabase_migrations.schema_migrations` ma 152 wersje, a przecięcie z prefiksami… | `COMPASS/supabase/migrations/README.md:103` | **C1** |
| 45 | 🟡 ŚR | awaria | Żaden błąd rzucony z server action nie trafia do Sentry — SDK 8.55.2 nie instrumentuje `'use server'` automatycznie (wrappingLoader zna tylko… | `COMPASS/instrumentation.ts:17` | **B1** |
| 46 | 🟡 ŚR | awaria | Server actions konsumują wynik zapytania Supabase bez sprawdzenia `error` w ~340–460 miejscach w `lib/actions/*.ts`, w tym w zapytaniach, które są PRZESŁANKĄ DECYZJI. | `COMPASS/lib/actions/internal-leave.ts:1195` | **B1** |
| 47 | 🟡 ŚR | awaria | E2E domyślnie celuje w produkcję (`playwright.config.ts:6` fallback na `https://compass.dynaminds.pl`, `.env.test.example:7-8` i `e2e-tests.yml:35` też prod), a zestaw zawiera testy… | `COMPASS/playwright.config.ts:6` | **A0.5** |
| 48 | 🟡 ŚR | awaria | listContractors (COMPASS/lib/actions/contractors.ts:141-153) pyta `contractor_conversations` przez `.in('contractor_id', ids)` z KOMPLETEM id kontraktorów (prod: 683 → query string ~26… | `COMPASS/lib/actions/contractors.ts:148` | **B2** |
| 49 | 🟡 ŚR | dług | getPayrollSummaryAll (COMPASS/lib/actions/internal-payroll.ts:329-332) i getPayrollSummaryForManager (:292-295) budują podsumowania w pętli `for ... | `COMPASS/lib/actions/internal-payroll.ts:330` | **A4.2** |
| 50 | ⚪ NIS | awaria | `checkRateLimit` i `logLoginAttempt` (COMPASS/lib/auth/security.ts:16, :47) to martwy kod — jedyne wystąpienie poza definicją to nieużywany import w COMPASS/app/login/actions.ts:7. | `COMPASS/lib/auth/security.ts:16` | **A4.3** |
| 51 | ⚪ NIS | awaria | Martwy stub `/internal/onboarding` (COMPASS/app/(protected)/internal/onboarding/page.tsx:10) kieruje na nieaktualny adres `/internal/kontraktorzy?tab=onboarding`, a ten route jest już… | `COMPASS/app/(protected)/internal/kontraktorzy/page.tsx:6` | **C3** |
| 52 | ⚪ NIS | awaria | Niespójny `transactionId` w `retryLeaveGraphSync` (COMPASS/lib/actions/internal-leave.ts:3616 — `leave-retry-${id}-${Date.now()}`) łamie idempotencję zadeklarowaną w… | `COMPASS/lib/actions/internal-leave.ts:3616` | **C10** |
| 53 | ⚪ NIS | dług | Martwy kanał Resend nadal jest w kodzie i w produkcyjnych zależnościach (COMPASS/lib/email/sender.ts:66 `return 'resend'`, sendViaResend w sender.ts:101-117, `resend: ^6.9.2` w… | `COMPASS/lib/email/sender.ts:66` | **C10** |
| 54 | ⚪ NIS | awaria | Trzy tabele mirrora Fazy 37 (`onboarding_cases` 2 wiersze, `exit_cases` 4, `support_contractor_meta` 147) nie mają ANI JEDNEGO czytelnika — ani w kodzie (`lib`/`app`/`components` = 0… | `COMPASS/supabase/migrations/20260608000003_phase37c_sync_triggers.sql:1` | **C2** |
| 55 | ⚪ NIS | awaria | Komunikator (`/messages`): 3 akcje odczytowe zwracają `{data, error}`, a 5 wywołań w `MessagesPageClient.tsx` (:86, :120, :144, :164, :211, :598) ignoruje `error`, więc awaria… | `COMPASS/components/messages/MessagesPageClient.tsx:86` | **B1** |
---

## Załącznik 2 — 193 znaleziska do triażu (NIE zweryfikowane)

To znaleziska, które nie zmieściły się w limicie 70 pozycji weryfikacji — **mogą zawierać
fałszywe alarmy**. Zanim któreś naprawisz, potwierdź je w kodzie. 38 z nich ma wagę „wysoki".
Grupowane po pliku, najpilniejsze pliki na górze.

<details><summary><code>CLAUDE.md</code> — 11 poz.</summary>

- ☐ 🟠 WYS — CLAUDE.md nadal opisuje rotację bloków i cron tech-map-rotation jako żywe — usunięte 4 miesiące temu
- ☐ 🟠 WYS — CLAUDE.md i komentarz w compose twierdzą, że Alloy jest odgrodzony profilem — guard usunięto commitem 4d75c0e
- ☐ 🟠 WYS — Procedura rollbacku w CLAUDE.md opiera się o zmienną IMAGE_TAG, której nie ma w compose
- ☐ 🟡 ŚR — Rozjazd macierzy trasa × harmonogram:
- ☐ 🟡 ŚR — Sekcja healthcheck w CLAUDE.md przeczy sekcji Observability tego samego pliku i wskazuje usunięty workflow
- ☐ 🟡 ŚR — Consultant Success Hub — ~4300 linii kodu, 2 crony i 5 flag środowiskowych bez ani jednej sekcji w CLAUDE.md
- ☐ 🟡 ŚR — Pięć cronów produkcyjnych nie występuje w CLAUDE.md ani razu — nie da się zweryfikować, czy mają zadania w Coolify
- ☐ 🟡 ŚR — CLAUDE.md:
- ☐ ⚪ NIS — CLAUDE.md odsyła do raportu w docs/, którego tam nie ma (leży w COMPASS/docs/)
- ☐ ⚪ NIS — CLAUDE.md w sekcji „Specyfika tej apki” każe sprawdzić katalog i plik, które nie istnieją
- ☐ ⚪ NIS — CLAUDE.md twierdzi, że w kodzie zostało ~100 niezmigrowanych console.* — są dwa

</details>

<details><summary><code>lib/actions/internal-leave.ts</code> — 9 poz.</summary>

- ☐ 🟠 WYS — Urlopy:
- ☐ 🟠 WYS — Edycja urlopu przez managera nie przelicza podziału płatny/bezpłatny ani limitu UoP
- ☐ 🟠 WYS — Podział płatny/bezpłatny jest zamrażany przy składaniu wniosku i nigdy nie odświeżany przy akceptacji
- ☐ 🟠 WYS — Urlop na przełomie roku w całości obciąża pulę roku rozpoczęcia; saldo pobiera święta tylko z jednego roku
- ☐ 🟡 ŚR — Badge zużycia puli urlopowej w kolejce akceptacji liczy się z zapytania, którego błąd jest ignorowany
- ☐ 🟡 ŚR — Brak jakiejkolwiek kontroli nakładania się urlopów w ścieżce samoobsługowej i w bazie
- ☐ 🟡 ŚR — Sprzątanie po urlopie działa po zakresie dat, nie po identyfikatorze wniosku
- ☐ 🟡 ŚR — Automat usuwa godziny z zaakceptowanego timesheetu i po cichu przepisuje pdf_hash — gwarancja integralności jest pozorna
- ☐ ⚪ NIS — leave_requests.paid_days/unpaid_days bez triggera spójności — 18 wniosków ma 0/0 mimo dni roboczych

</details>

<details><summary><code>lib/actions/contractors.ts</code> — 6 poz.</summary>

- ☐ 🟠 WYS — contractors.status ma w całej tabeli jedną wartość — 339 „aktywnych" już zeszło z projektu
- ☐ 🟠 WYS — 28 wywołań revalidatePath kontraktorów celuje w wycofaną trasę-zaślepkę
- ☐ 🟡 ŚR — resolveOrCreateContractor unieważnia własną normalizację — prefiltr ilike jest ostrzejszy niż porównanie w JS
- ☐ 🟡 ŚR — getContractorDashboard:
- ☐ 🟡 ŚR — listDepartures / listExitDepartures / listEntries:
- ☐ 🟡 ŚR — Siedem wyeksportowanych server actions bez żadnego wywołania — w tym assignInboxTicket i getInboxSummary

</details>

<details><summary><code>lib/actions/internal-timesheet.ts</code> — 5 poz.</summary>

- ☐ 🟠 WYS — 11 z 16 statusów urlopowych NIE blokuje wpisywania godzin do timesheetu
- ☐ 🟠 WYS — Timesheety:
- ☐ 🟠 WYS — Nadgodziny admina psują hash zaakceptowanego timesheetu — PDF zwróci 409
- ☐ 🟠 WYS — Zaakceptowany timesheet jest edytowalny przez zwykłe updateEntry/deleteEntry admina (RLS `OR is_admin()`)
- ☐ 🟡 ŚR — listAllTimesheetsForMonth:

</details>

<details><summary><code>lib/supabase/database.types.ts</code> — 3 poz.</summary>

- ☐ 🟠 WYS — Wygenerowane database.types.ts (116 tabel) jest praktycznie nieużywane — 3 wystąpienia Tables<> wobec 443 ręcznie pisanych interfejsów
- ☐ 🟡 ŚR — inbox_sync_state:
- ☐ 🟡 ŚR — inbox_sync_state:

</details>

<details><summary><code>lib/actions/internal-payroll.ts</code> — 3 poz.</summary>

- ☐ 🟠 WYS — Wyliczanie wynagrodzeń (godziny × stawka + premie, agregacja walut, CSV) siedzi inline w akcji bez testu i bez czystego helpera
- ☐ 🟡 ŚR — Waluta stawki w payrollu pobierana innym zapytaniem niż sama stawka — możliwy rozjazd
- ☐ 🟡 ŚR — Rozliczenie pokazuje kwotę godzin z timesheetu w dowolnym statusie, także szkicu

</details>

<details><summary><code>lib/types.ts</code> — 2 poz.</summary>

- ☐ 🟠 WYS — Unia NotificationType jest 26 wartości za bazą i zawiera typ, którego CHECK odrzuci
- ☐ 🟠 WYS — NotificationType:

</details>

<details><summary><code>lib/supabase/lifecycle-client.ts</code> — 2 poz.</summary>

- ☐ 🟠 WYS — lib/supabase/lifecycle-client.ts zwraca `any` — cały moduł lifecycle (2214 linii, 0 testów) pracuje bez typów mimo że plan usunięcia jest wykonany
- ☐ ⚪ NIS — lifecycle-client.ts:

</details>

<details><summary><code>lib/actions/internal-rates.ts</code> — 2 poz.</summary>

- ☐ 🟠 WYS — 22 zapytania do tabel pieniężnych przez `.from('...' as any)` z nieaktualnym uzasadnieniem „types not yet regenerated”
- ☐ 🟡 ŚR — hourly_rate typowany w trzech niezgodnych wariantach w jednym module; kolumna jest numeric

</details>

<details><summary><code>lib/actions/internal-bonus.ts</code> — 2 poz.</summary>

- ☐ 🟠 WYS — `as unknown as never` w insert/update — całkowite wyłączenie sprawdzania payloadu zapisu
- ☐ 🟠 WYS — Kwota premii rekrutera i DL nie jest weryfikowana wobec zapisanej marży — 14 wierszy w prodzie się rozjeżdża

</details>

<details><summary><code>lib/auth/internal-guard.ts</code> — 2 poz.</summary>

- ☐ 🟠 WYS — 19 guardów autoryzacji z internal-guard.ts nigdy nie wykonuje się w testach — 6 plików podmienia je własną re-implementacją
- ☐ 🟡 ŚR — Guard nie jest memoizowany — sześć duplikatów auth.getUser + SELECT profilu na jeden render zakładki

</details>

<details><summary><code>middleware.ts</code> — 2 poz.</summary>

- ☐ 🟠 WYS — middleware.ts — macierz 8 przekierowań plus blokada zarchiwizowanych kont — 0 testów i poza pomiarem pokrycia
- ☐ 🟡 ŚR — Osierocona strona /consent:

</details>

<details><summary><code>test/mocks/supabase.ts</code> — 2 poz.</summary>

- ☐ 🟠 WYS — Mock Supabase ignoruje listę kolumn i embedy — klasa błędów, która dwukrotnie wywaliła produkcję, jest dla testów niewidoczna
- ☐ 🟠 WYS — Mock Supabase traktuje upsert jak insert — gwarancja „jeden mail na miesiąc” (dedup ON CONFLICT) jest nietestowalna, a cron nie ma testu

</details>

<details><summary><code>supabase/migrations/20260517000003_phase22c_exit_interview_tables.sql</code> — 1 poz.</summary>

- ☐ 🟠 WYS — ON DELETE SET NULL łamie niezmiennik „user_id NULL = wywiad anonimowy"

</details>

<details><summary><code>lib/actions/maintenance.ts</code> — 1 poz.</summary>

- ☐ 🟠 WYS — Trzy tabele używane w kodzie nie istnieją w bazie (candidates, consultant_assignments, match_results) — każda za castem `as any`

</details>

<details><summary><code>lib/actions/dispatch-to-ticket.ts</code> — 1 poz.</summary>

- ☐ 🟠 WYS — Przeniesienie czatu do zgłoszenia zawsze trafia w kategorię „other” — zapytanie o opiekuna odbija się od nieistniejącej tabeli

</details>

<details><summary><code>next.config.mjs</code> — 1 poz.</summary>

- ☐ 🟠 WYS — next.config.mjs wyłącza typecheck i lint w produkcyjnym buildzie — obraz Coolify powstaje bez żadnej weryfikacji typów

</details>

<details><summary><code>e2e/05-loyalty.spec.ts</code> — 1 poz.</summary>

- ☐ 🟠 WYS — e2e/05-loyalty.spec.ts testuje trasę /loyalty, która nie istnieje — 5 martwych testów

</details>

<details><summary><code>app/(protected)/internal/onboarding/page.tsx</code> — 1 poz.</summary>

- ☐ 🟠 WYS — /internal/onboarding gubi docelową zakładkę przez podwójny redirect

</details>

<details><summary><code>app/(protected)/messages/page.tsx</code> — 1 poz.</summary>

- ☐ 🟠 WYS — Trzy pełne moduły (/documents, /projects, /messages) nie mają żadnego wejścia z nawigacji

</details>

<details><summary><code>app/(protected)/internal/admin/role-defaults/page.tsx</code> — 1 poz.</summary>

- ☐ 🟠 WYS — Panel admina „Domyślne opisy timesheet" nieosiągalny z nawigacji

</details>

<details><summary><code>app/api/internal/payroll-export/route.ts</code> — 1 poz.</summary>

- ☐ 🟠 WYS — Kolumny obecności w eksporcie payrollowym są zawsze zerowe — filtrują po nieistniejącym statusie 'present'

</details>

<details><summary><code>lib/placements/import.ts</code> — 1 poz.</summary>

- ☐ 🟠 WYS — Prognoza 168h liczy dni robocze bez polskich świąt — 42 z 69 placementów ma datę za wcześnie

</details>

<details><summary><code>app/api/cron/placement-hours-reminder/route.ts</code> — 1 poz.</summary>

- ☐ 🟠 WYS — Przypomnienie o potwierdzeniu 168h ma okno 30 dni — po nim premie milkną na zawsze

</details>

<details><summary><code>e2e/helpers/test-users.ts</code> — 1 poz.</summary>

- ☐ 🟠 WYS — Konfiguracja testów E2E odsyła do skryptu usuniętego z repo — zestawu nie da się uruchomić wg instrukcji

</details>

<details><summary><code>.cursor/rules/agent-ustalenia.mdc</code> — 1 poz.</summary>

- ☐ 🟠 WYS — Reguła Cursora ładowana do każdej sesji (alwaysApply) opisuje strukturę i workflow sprzed rebrandu z maja

</details>

<details><summary><code>lib/actions/lifecycle.ts</code> — 4 poz.</summary>

- ☐ 🟡 ŚR — addAdhocOnboardingTask rzutuje enumy z FormData przez `as` bez whitelisty — walidację robi dopiero CHECK w bazie
- ☐ 🟡 ŚR — addTemplateItem / updateTemplateItem:
- ☐ 🟡 ŚR — lifecycle.ts (53 mutacje) i internal-leave.ts (35) nie wołają revalidatePath ani razu — świeżość zależy od router.refresh w konkretnym komponencie
- ☐ 🟡 ŚR — Read-model Fazy 37 (onboarding_cases / exit_cases) nie ma ani jednego czytelnika w kodzie — dwie tabele i dwa triggery utrzymywane w próżni

</details>

<details><summary><code>lib/actions/communicator.ts</code> — 4 poz.</summary>

- ☐ 🟡 ŚR — getConversations:
- ☐ 🟡 ŚR — Rozsyłka ogłoszeń strzela N równoległych maili do Graph, omijając sekwencyjny sendEmailMany (który ma 0 wywołań)
- ☐ 🟡 ŚR — Server actions komunikatora zwracają `any[]` — granica RSC→client bez żadnego typu
- ☐ ⚪ NIS — Bucket chat-attachments jest publiczny i czytelny dla każdego zalogowanego, choć nic go nie używa

</details>

<details><summary><code>components/layout/Sidebar.tsx</code> — 4 poz.</summary>

- ☐ 🟡 ŚR — Link „Timesheety zespołu" niesie parametr scope=team, którego strona nie stosuje
- ☐ 🟡 ŚR — Sidebar liczy aktywną zakładkę z domyślną wartością 'rozmowy', która nie istnieje w żadnym hubie
- ☐ 🟡 ŚR — Prop isInboxHandler przewożony przez trzy warstwy do komponentu, który go nie odbiera
- ☐ ⚪ NIS — Grant can_view_legal_monitor otwiera hub, ale rola 'internal' nie dostaje do niego linku

</details>

<details><summary><code>supabase/migrations/20240502000000_initial_schema.sql</code> — 3 poz.</summary>

- ☐ 🟡 ŚR — Naprawa anonimowego wycieku profiles zepsuje 3 polityki team-scope, które czytają cudze wiersze profiles
- ☐ 🟡 ŚR — Wszystkie 333 polityki są PERMISSIVE — nie ma warstwy, która mogłaby cokolwiek zabronić globalnie
- ☐ 🟡 ŚR — 15 polityk duplikuje inline 'SELECT 1 FROM profiles WHERE role = admin' zamiast wołać is_admin()

</details>

<details><summary><code>lib/actions/support-inbox.ts</code> — 3 poz.</summary>

- ☐ 🟡 ŚR — Moduły z kopertą wynikową pokazują użytkownikowi surowy komunikat Postgresa (nazwy tabel i constraintów)
- ☐ 🟡 ŚR — 178 martwych ticketów mailowych (45% wszystkich wierszy skrzynki) jest pobieranych select('*') przy każdym renderze tablicy i odrzucanych w JS
- ☐ ⚪ NIS — support_inbox_meta denormalizuje dane konsultanta bez mechanizmu synchronizacji

</details>

<details><summary><code>app/api/cron/contractor-followup-reminder/route.ts</code> — 3 poz.</summary>

- ☐ 🟡 ŚR — Dwie trasy liczą powiadomienia jako wysłane bez sprawdzenia błędu INSERT-a
- ☐ 🟡 ŚR — Fallbackowe listy odbiorców w cronach nie odsiewają zarchiwizowanych pracowników
- ☐ 🟡 ŚR — Dwa crony przypominające są niemal kopiami (99 i 101 linii), a wspólny dispatcher alertów obsługuje tylko 2 z 5 ścieżek powiadomień

</details>

<details><summary><code>lib/oof/forward-rules.ts</code> — 3 poz.</summary>

- ☐ 🟡 ŚR — Sprzątanie osieroconych reguł przekierowania ma limit 100 bez kursora — ogon listy nigdy nie zostanie posprzątany
- ☐ 🟡 ŚR — Sprzątacz reguł ma sztywny limit 100 skrzynek bez rotacji, a komunikat sugeruje że reszta pójdzie w kolejnym przebiegu
- ☐ 🟡 ŚR — Reguły przekierowania poczty (551 linii pisania do skrzynek Outlook) bez testów

</details>

<details><summary><code>components/internal/kontraktorzy/KontraktorzyHub.tsx</code> — 3 poz.</summary>

- ☐ 🟡 ŚR — Sieroty po Fazie 38 w module Kontraktorzy:
- ☐ 🟡 ŚR — KontraktorzyHub i 5 paneli to martwy kod — hub nie jest importowany, a route go zastąpił przekierowaniem
- ☐ 🟡 ŚR — 37 komponentów nieosiągalnych z żadnej trasy — trzy całe wyspy martwego UI

</details>

<details><summary><code>lib/email.ts</code> — 3 poz.</summary>

- ☐ 🟡 ŚR — Polskie nazwy miesięcy skopiowane w 6 miejscach (dwa razy w tym samym pliku), a AttendanceDayPopover ma znany błąd odmiany
- ☐ 🟡 ŚR — Pięć kopii escapeHtml w budowaniu maili, w dwóch wariantach zachowania
- ☐ 🟡 ŚR — lib/email.ts:

</details>

<details><summary><code>lib/actions/placements.ts</code> — 3 poz.</summary>

- ☐ 🟡 ŚR — placements.contractor_id NULL w 52 z 69 wierszy — relacja trzymana na tekstowym nazwisku
- ☐ 🟡 ŚR — Potwierdzenie 168h nie sprawdza, czy placement w ogóle wystartował ani czy data 168h minęła
- ☐ ⚪ NIS — Import placementów:

</details>

<details><summary><code>supabase/migrations/20260516000003_phase20c_invoice_2stage.sql</code> — 2 poz.</summary>

- ☐ 🟡 ŚR — bonuses:
- ☐ ⚪ NIS — 17 funkcji triggerowych egzekwujących reguły biznesowe ma mutable search_path

</details>

<details><summary><code>components/internal/panels/AdminLeaveRequestsPanel.tsx</code> — 2 poz.</summary>

- ☐ 🟡 ŚR — Samoleczenie przekierowań odpalane jako floating promise w renderze strony admina
- ☐ 🟡 ŚR — Samoleczenie przekierowań odpalane z renderu strony, a jego throttle stoi na zapisie, który nigdy nie zgłasza błędu

</details>

<details><summary><code>supabase/migrations/20260517000005_phase22e_helpers_and_seeds.sql</code> — 2 poz.</summary>

- ☐ 🟡 ŚR — exit_interviews:
- ☐ 🟡 ŚR — start_onboarding_for_user:

</details>

<details><summary><code>app/api/admin/snapshot/route.ts</code> — 2 poz.</summary>

- ☐ 🟡 ŚR — /api/admin/snapshot tworzy własny klient service-role — bez hardenedFetch i bez współdzielonego cache
- ☐ ⚪ NIS — /api/admin/snapshot:

</details>

<details><summary><code>app/api/cron/lifecycle-checkins/route.ts</code> — 2 poz.</summary>

- ☐ 🟡 ŚR — Check-in onboardingowy:
- ☐ 🟡 ŚR — Zero testów dla 19 tras cron przy logice okien i dedupu wpisanej wprost w trasy

</details>

<details><summary><code>lib/graph/client.ts</code> — 2 poz.</summary>

- ☐ 🟡 ŚR — Retry-After z Graph nigdy nie jest odczytany — pole headers to obiekt Headers, nie mapa
- ☐ 🟡 ŚR — Cała warstwa integracji poza OOF/regułami nie ma żadnych testów — dlatego błąd Retry-After przeżył

</details>

<details><summary><code>supabase/migrations/20260507120001_phase11b_hr_internal_schema.sql</code> — 2 poz.</summary>

- ☐ 🟡 ŚR — 9 par redundantnych indeksów dublujących UNIQUE constrainty
- ☐ 🟡 ŚR — public_holidays kończą się na 2027 i nikt ich nie dosypuje

</details>

<details><summary><code>lib/types/contractor.ts</code> — 2 poz.</summary>

- ☐ 🟡 ŚR — contractor_tasks:
- ☐ 🟡 ŚR — Unie statusów rozjeżdżają się z CHECK-ami bazy w obie strony (contractor_tasks, onboarding_templates)

</details>

<details><summary><code>supabase/migrations/20260714183425_consultant_success_hub.sql</code> — 2 poz.</summary>

- ☐ 🟡 ŚR — 62 ze 115 tabel są puste — ponad połowa schematu to moduły bez ani jednego wiersza
- ☐ 🟡 ŚR — 683 wiersze konfiguracji contractor_success_settings dla modułu z zerowym ruchem

</details>

<details><summary><code>tsconfig.json</code> — 2 poz.</summary>

- ☐ 🟡 ŚR — tsconfig.json nie ustawia `target` — kompilator pracuje w domyślnym ES5, stąd 46 obejść `Array.from(...)`
- ☐ 🟡 ŚR — tsconfig bez noUncheckedIndexedAccess — indeksowanie tablic i map udaje, że nigdy nie zwraca undefined

</details>

<details><summary><code>lib/types/lifecycle.ts</code> — 2 poz.</summary>

- ☐ 🟡 ŚR — Kanoniczna unia EmploymentStatus jest wyeksportowana i nieużywana; 57 miejsc porównuje surowy string 'exited'
- ☐ ⚪ NIS — ~46 nieużywanych eksportów typów i stałych w lib/types — najwięcej w lifecycle.ts (18)

</details>

<details><summary><code>lib/types/role.ts</code> — 2 poz.</summary>

- ☐ 🟡 ŚR — DB_ROLES ręcznie duplikuje enum user_role, a dwa zapytania filtrują po rolach spoza enuma za `as unknown as`
- ☐ ⚪ NIS — Trzy predykaty ról bez testu, mimo że reszta pliku ma komplet — w tym jedyna reguła kto może przyznać premię

</details>

<details><summary><code>components/layout/MobileMenu.tsx</code> — 2 poz.</summary>

- ☐ 🟡 ŚR — Mobilny link finansów „Faktury do akceptacji" prowadzi do zakładki wyłączonej flagą
- ☐ 🟡 ŚR — Pierwsza pozycja dolnej nawigacji mobilnej to /home — dla 4 z 6 ról gwarantowane przekierowanie

</details>

<details><summary><code>app/api/cron/clock-idle-reaper/route.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Brak zabezpieczenia przed nakładającymi się przebiegami we wszystkich trasach poza jedną

</details>

<details><summary><code>app/api/cron/legal-monitor-alerts/route.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Tygodniowy digest prawny nie ma dedupu, a trzy mechanizmy potrafią wywołać trasę drugi raz

</details>

<details><summary><code>lib/teams/webhook.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Awarie webhooka Teams są niewidoczne — tylko logger.warn, zero Sentry i zero sygnału w UI

</details>

<details><summary><code>lib/actions/internal-clock/corrections.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Odrzucenie korekty zegara nadpisuje godziny bez sprawdzenia statusu i bez przeliczenia hasha

</details>

<details><summary><code>lib/actions/files.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Osiem server actions w modułach 'use server' bez żadnego guarda — autoryzacja stoi wyłącznie na RLS

</details>

<details><summary><code>app/(protected)/admin/settings/layout.tsx</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Podstrony /admin/* poza inbox/compliance/news nie mają guarda serwerowego — chroni je tylko ukrywanie linków w komponencie klienckim

</details>

<details><summary><code>app/(protected)/admin/inbox/page.tsx</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Rozjazd autoryzacji skrzynki:

</details>

<details><summary><code>lib/actions/user-admin.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Pięć flag grantów nie ma w kodzie żadnej ścieżki nadawania — a pisać je może każdy właściciel konta

</details>

<details><summary><code>supabase/migrations/20260223_fix_communicator_rls_v2.sql</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Dryf migracji:

</details>

<details><summary><code>lib/validators/common.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Walidacja schematem praktycznie nieużywana:

</details>

<details><summary><code>lib/actions/internal-clients.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Dwie ścieżki zapisu do tabeli clients — jedna kanonizuje nazwę (Faza 42a), druga nie; UNIQUE jest case-sensitive

</details>

<details><summary><code>lib/actions/loyalty.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — loyalty.ts po nieudanym pobraniu reguł podstawia dane demonstracyjne z identyfikatorami mock-N

</details>

<details><summary><code>lib/hooks/useRealtimeInboxTickets.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Realtime skrzynki:

</details>

<details><summary><code>lib/actions/internal-invoice.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — 172 zapytania z select('*') — jawne kolumny wprowadzono tylko w skrzynce i monitoringu prawnym

</details>

<details><summary><code>app/api/cron/lifecycle-reminders/route.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Przypomnienia lifecycle i kontraktorskie bez żadnego dedupu — nękają codziennie w nieskończoność

</details>

<details><summary><code>app/api/cron/tc-sync/route.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Trasy zwracają HTTP 200 przy braku konfiguracji i przy awarii — wołający widzi zielono

</details>

<details><summary><code>lib/api/with-auth.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Legacy `?secret=` nadal działa i jest JEDYNĄ udokumentowaną formą wywołania trzech tras

</details>

<details><summary><code>app/api/cron/course-inactivity/route.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Cron kursów wysyła do 500 maili sekwencyjnie z retry — przebieg bez górnego limitu czasu i bez śladu

</details>

<details><summary><code>components/dashboard/loyalty/MyPointsTab.tsx</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Dwa równoległe zestawy UI lojalności — 1675 linii starszego jest nieosiągalne, a system nigdy nie przyznał ani jednego punktu

</details>

<details><summary><code>lib/actions/course-embeddings.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Akademia AI (Faza 5) i moduł knowledge-base:

</details>

<details><summary><code>lib/actions/favorites.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — 74 martwe eksporty w lib/actions — całe moduły (knowledge-base, admin, favorites w większości) bez ani jednego wywołania

</details>

<details><summary><code>components/ds/index.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Kit designu components/ds:

</details>

<details><summary><code>lib/utils/business-days.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Święta państwowe wpisane na sztywno w kodzie, równolegle do tabeli public_holidays — lista kończy się w 2027

</details>

<details><summary><code>lib/types/support.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Cztery różne definicje „co należy do skrzynki" — hardcoded lista slugów obok trzech wariantów LIKE 'inbox_%'

</details>

<details><summary><code>lib/contractors/name-normalization.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Słownik clients i CLIENT_ALIASES rozjechały się — 21 z 52 używanych nazw klientów nie ma odpowiednika w słowniku

</details>

<details><summary><code>lib/utils/business-date.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Pięć niezależnych implementacji „dzisiaj w Warszawie", a dwa crony i tak liczą datę w UTC

</details>

<details><summary><code>supabase/migrations/20260606000003_phase33c_contractor_interviews.sql</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Wywiady onboarding/exit istnieją w dwóch równoległych implementacjach; kontraktorska ma zero wierszy w prod

</details>

<details><summary><code>app/global-error.tsx</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Granice błędów UI nie zgłaszają nic do Sentry, a global-error dodatkowo przekierowuje na /login

</details>

<details><summary><code>lib/m365/people-sync.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Konto nieistniejące w tenancie blokuje slot cotygodniowej synchronizacji z Graph na zawsze

</details>

<details><summary><code>supabase/migrations/20260606000001_phase33a_contractors.sql</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — contractors.profile_id:

</details>

<details><summary><code>supabase/migrations/20260520000001_phase27a_timesheet_overtime_override.sql</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Dwa CHECK-i zostały NOT VALID — gwarancja jest słabsza, niż wygląda w schemacie

</details>

<details><summary><code>lib/legal-monitor/alerts.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Odbiorcy alertów trzymani jako CSV UUID w system_settings bez żadnego klucza obcego

</details>

<details><summary><code>lib/types/bonus.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — bonuses:

</details>

<details><summary><code>components/documents/UnifiedDocumentManager.tsx</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — 27× `catch (e:

</details>

<details><summary><code>lib/actions/development.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Semantyczne dopasowanie projektów jest martwe — RPC match_projects nie istnieje, fallback maskuje brak

</details>

<details><summary><code>e2e/06-public-pages.spec.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Dwa testy w repo opisują sprzeczny kontrakt /api/health — e2e sprawdza pole, którego endpoint nie zwraca

</details>

<details><summary><code>e2e/04-rls-database.spec.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Testy RLS asertują „nie 500” / „nie 404” zamiast realnego wyniku polityki i pokrywają 3 tabele z kilkudziesięciu

</details>

<details><summary><code>e2e/12-bonuses-assigned.spec.ts</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Zestaw e2e zamrożony od 2026-05-19 — od tego czasu 174 commity i 60 migracji bez jednego nowego scenariusza

</details>

<details><summary><code>package.json</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — `npm test` — komenda z package.json — uruchamia Playwright i kończy się błędem zbierania testów

</details>

<details><summary><code>components/internal/AssignBonusForm.tsx</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — 256 komponentów, 4 testy — formularze pieniężne i kadrowe (1031 i 793 linie) bez pokrycia i poza pomiarem

</details>

<details><summary><code>components/internal/HubTabs.tsx</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — HubTabs kasuje wszystkie parametry zapytania przy przełączeniu zakładki

</details>

<details><summary><code>components/layout/AppLayout.tsx</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Martwa instalacja nawigacji mobilnej:

</details>

<details><summary><code>app/(protected)/admin/inbox/[id]/page.tsx</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Ze szczegółu zgłoszenia wychodzi się do drugiej, nieosiągalnej z nawigacji tablicy Kanban

</details>

<details><summary><code>components/inbox/ConsultantTypeahead.tsx</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Dwa komponenty pobierające dane w useEffect bez try/catch — awaria zostawia wieczny spinner

</details>

<details><summary><code>components/internal/TimesheetEditor.tsx</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — 15 przycisków ikonowych bez etykiety — w tym przełącznik menu mobilnego i edycja/usuwanie wpisu timesheetu

</details>

<details><summary><code>app/login/page.tsx</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Przełącznik pokazywania hasła nieosiągalny z klawiatury i bez etykiety; pole nowego hasła bez <label>

</details>

<details><summary><code>README.md</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — README to niezmieniony boilerplate create-next-app, a INSTRUCTIONS_PL odsyła do nieistniejącego skryptu

</details>

<details><summary><code>supabase/migrations/README.md</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Migracje w repo i na produkcji rozjechały się:

</details>

<details><summary><code>docs/next-15-16-migration-plan.md</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — Plan migracji Next.js uzasadnia odkładanie łatek wersją 14.2.36, która nie istnieje

</details>

<details><summary><code>docs/modules/DOC-M12_Right_to_Hire.md</code> — 1 poz.</summary>

- ☐ 🟡 ŚR — docs/modules — 13 specyfikacji modułów opisuje produkt „Qualrix”, trzy z nich nie mają śladu w kodzie

</details>

<details><summary><code>lib/actions/consultant-success.ts</code> — 1 poz.</summary>

- ☐ ⚪ NIS — consultant-success:

</details>

<details><summary><code>app/api/cron/oof-reconcile/route.ts</code> — 1 poz.</summary>

- ☐ ⚪ NIS — maxDuration w trasach cron to na tym wdrożeniu no-op, a projekt kolejności przebiegów opiera się na nim

</details>

<details><summary><code>lib/clock/time-zones.ts</code> — 1 poz.</summary>

- ☐ ⚪ NIS — Doba zegara pracy liczona w UTC — sesje z godzin nocnych wpadają do poprzedniego dnia i miesiąca

</details>

<details><summary><code>lib/auth/require-super-admin.ts</code> — 1 poz.</summary>

- ☐ ⚪ NIS — Trzy niezależne kopie requireSuperAdmin — jedna wyeksportowana, dwie prywatne, dwa różne komunikaty

</details>

<details><summary><code>app/login/actions.ts</code> — 1 poz.</summary>

- ☐ ⚪ NIS — Martwa ścieżka awaryjnego logowania:

</details>

<details><summary><code>supabase/migrations/20260208_profile_updates.sql</code> — 1 poz.</summary>

- ☐ ⚪ NIS — storage:

</details>

<details><summary><code>supabase/migrations/20260213_notifications_system.sql</code> — 1 poz.</summary>

- ☐ ⚪ NIS — notifications:

</details>

<details><summary><code>supabase/migrations/20260516000002_phase20b_manager_id_and_helpers.sql</code> — 1 poz.</summary>

- ☐ ⚪ NIS — Cztery funkcje SECURITY DEFINER wykrywające uprawnienia są wywoływalne bez logowania (rola anon)

</details>

<details><summary><code>supabase/migrations/20260825120000_inbox_email_archive_and_drop.sql</code> — 1 poz.</summary>

- ☐ ⚪ NIS — support_inbox_email_archive:

</details>

<details><summary><code>e2e/10-invoices.spec.ts</code> — 1 poz.</summary>

- ☐ ⚪ NIS — Trzy pliki e2e testują funkcje wyłączone lub usunięte (faktury, work clock, lojalność)

</details>

<details><summary><code>components/internal/kontraktorzy/InterviewForm.tsx</code> — 1 poz.</summary>

- ☐ ⚪ NIS — Wywiady onboardingowe i exit dla kontraktorów:

</details>

<details><summary><code>lib/oof/reconcile.ts</code> — 1 poz.</summary>

- ☐ ⚪ NIS — Powtórzone listy ról i identyczne helpery uprawnień zamiast lib/types/role.ts

</details>

<details><summary><code>app/api/cron/secret-expiry-check/route.ts</code> — 1 poz.</summary>

- ☐ ⚪ NIS — Alarm o wygasającym sekrecie Azure milknie, gdy nie ustawiono zmiennej z datą

</details>

<details><summary><code>lib/actions/leave-forward-admin.ts</code> — 1 poz.</summary>

- ☐ ⚪ NIS — Opis osieroconej reguły przekierowania liczy „dziś” w UTC, niespójnie z regułą okna

</details>

<details><summary><code>supabase/migrations/20260608000003_phase37c_sync_triggers.sql</code> — 1 poz.</summary>

- ☐ ⚪ NIS — Sześć triggerów lustra Fazy 37 połyka wyjątki — rozjazd mirrora byłby niewidoczny

</details>

<details><summary><code>components/ds/Kanban.tsx</code> — 1 poz.</summary>

- ☐ ⚪ NIS — Kanban podaje KeyboardEvent w miejsce MouseEvent przez `as unknown as`

</details>

<details><summary><code>test/mocks/next.ts</code> — 1 poz.</summary>

- ☐ ⚪ NIS — test/mocks/next.ts to martwy plik — nikt go nie importuje od czasu wprowadzenia globalnego setupu

</details>

<details><summary><code>app/(protected)/internal/lifecycle/components/MarkExitedButton.tsx</code> — 1 poz.</summary>

- ☐ ⚪ NIS — Osiem plików używa natywnego confirm() zamiast ConfirmDialog

</details>

<details><summary><code>Dockerfile</code> — 1 poz.</summary>

- ☐ ⚪ NIS — Komentarz w Dockerfile mówi, że token Sentry nie jest eksportowany jako ENV — następna linia go eksportuje

</details>

<details><summary><code>docs/operations/PROCEDURA_TESTY.md</code> — 1 poz.</summary>

- ☐ ⚪ NIS — docs/operations/PROCEDURA_TESTY.md instruuje `npm run sync` — takiego skryptu nie ma; mówi też o 3 testach E2E zamiast 59

</details>

---

## Załącznik 3 — 15 znalezisk ODRZUCONYCH w weryfikacji

**Nie otwierać ponownie.** Każde zbadane i obalone z dowodem. Zapisane po to, żeby kolejny audyt
(albo ja za miesiąc) nie zmarnował na nie czasu.

**Żaden .env.*.example nie wymienia AZURE_* — bez nich cała poczta, OOF i przekierowania milczą**  
`COMPASS/.env.local.example`  
→ Znalezisko myli fakty i deklaruje nieprawdziwy skutek.

**docs/microsoft-graph-email-setup.md twierdzi „Resend usunięty całkowicie” — Resend jest żywym fallbackiem poczty**  
`docs/microsoft-graph-email-setup.md`  
→ Znalezisko upada na trzech niezależnych dowodach.

**Guard na deploy skew (result?.success) zastosowano w 7 miejscach na ~248 — reszta krzyczy TypeError po każdym deployu**  
`COMPASS/components/inbox/InboxTicketTitle.tsx`  
→ (1) METRYKA TO SZUM GREPA.

**regenerateCourseEmbedding:**  
`COMPASS/lib/actions/course-embeddings.ts`  
→ Trzy niezależne dowody obalają znalezisko w formie, w jakiej je zgłoszono.

**storage.objects:**  
`COMPASS/supabase/migrations/20260216_document_system_storage.sql`  
→ Fakt (brak USING) jest prawdziwy, ale deklarowany skutek — "brak USING = USING(true) = można zaktualizować dowolny wiersz w dowolnym buckecie" — jest fałszywy i obalony planem zapytania z produkcji.

**markPostRead zawsze raportuje sukces, getUnreadNewsCount przy awarii zwraca 0 nieprzeczytanych**  
`COMPASS/lib/actions/news.ts`  
→ Mechanizm "połykania" błędu istnieje w kodzie, ale trzy niezależne fakty obalają znalezisko jako "nie_dziala / wysoki / pewne".

**Ścieżki update nie powtarzają walidacji minimalnej długości, którą wymusza CHECK w bazie (create ją ma)**  
`COMPASS/lib/actions/contractors.ts`  
→ Deklarowany skutek („wyczyszczenie nazwiska/tytułu w formularzu edycji → naruszenie CHECK-a → zamaskowany błąd serwera") jest niemożliwy:

**Wzorzec `if (error || !row) throw 'nie istnieje'` — awaria bazy raportowana użytkownikowi jako brak rekordu**  
`COMPASS/lib/actions/internal-leave.ts`  
→ Znalezisko opiera się na błędnym założeniu o semantyce `.single()` w PostgREST.

**requires_file na zadaniu onboardingu egzekwowane wyłącznie atrybutem required w HTML — serwer przyjmuje zadanie bez pliku**  
`COMPASS/lib/actions/lifecycle.ts`  
→ Wymóg pliku jest egzekwowany w bazie, nie tylko atrybutem `required` w HTML.

**Brak jednego kontraktu zwrotki:**  
`COMPASS/lib/types/support.ts`  
→ Liczby autora się zgadzają (120× `Promise<void>` w lib/actions/*.ts, 24× `Promise<string>`, 11× `Promise<boolean>`, 4 identyczne aliasy:

**Badge'e w sidebarze:**  
`COMPASS/app/(protected)/layout.tsx`  
→ Autor poprawnie odczytał kod (layout.tsx:108-129 faktycznie robi Promise.all z 7 wywołaniami, a layout ma `export const dynamic = 'force-dynamic'` — linia 5), ale **przypisał 1,13 mln seq scanów niewłaściwej przyczynie** i błędnie oszacował koszt.

**Dzienne podsumowanie pracy liczy przerwy z CAŁEJ historii — zły warunek nakładania się sesji**  
`COMPASS/app/api/cron/clock-daily-summary/route.ts`  
→ Autor ma rację co do semantyki PostgREST (`.or()` ANDuje się z `.eq()`, więc warunek `started_at<=koniec_wczoraj OR ended_at>=początek_wczoraj` jest de facto zawsze prawdziwy, a zapytanie o pauzy w liniach 116-118 nie ma filtra dat) — ale deklarowany SKUTEK jest nieosiągalny:

**KPI „Otwarte zgłoszenia" pokazuje 45, a kanban Spraw ma 39 — analityka nie filtruje kategorii contractor_%**  
`COMPASS/lib/actions/zgloszenia-analytics.ts`  
→ Brak filtra jest ŚWIADOMĄ decyzją projektową, udokumentowaną w trzech niezależnych miejscach, a nie przeoczeniem:

**Data należności premii (168h) liczona bez świąt — 42 z 69 placementów ma termin o dzień za wczesny**  
`COMPASS/lib/placements/import.ts`  
→ Fakt arytmetyczny autora się potwierdza, ale teza „nie działa / wysoki” upada na czterech dowodach.

**23 grupy plików migracji dzielą ten sam numer wersji (12 z pełnym timestampem)**  
`COMPASS/supabase/migrations/20260727120000_phase41c_forward_mail_optin.sql`  
→ Deklarowany skutek („tylko jedna zostanie zarejestrowana — druga albo nie pójdzie, albo pójdzie bez śladu w ledgerze") jest empirycznie obalony dla dokładnie tych par, które autor cytuje.

---

## Dziennik postępu

Format: `RRRR-MM-DD · ID · co zrobione · jak zweryfikowane · commit/PR`

| Data | ID | Co | Weryfikacja | Ślad |
|---|---|---|---|---|
| 2026-08-25 | — | Audyt wykonany, nic nie zmienione | 94 agenty, 70 znalezisk zweryfikowanych adwersaryjnie | `docs/audyt-2026-08-plan-naprawy.md` |
| 2026-08-25 | A0.1–A0.6, A4.2–A4.4 | Kod Etapu A | `tsc` czysty, 1278/1278 testów, 6 nowych testów `safeNextPath`, przegląd 6 obiektywów | PR „Etap A" |
| 2026-08-25 | A1.1, A2.1, A2.2, A3.1, A3.2, A4.1 | Migracje napisane, **niezaaplikowane** | walidacja składni + `DO $$` self-check w plikach | 5 plików `supabase/migrations/20260825140*` |
| 2026-08-25 | — | Flaky `legal-monitor.test.ts` naprawiony u przyczyny (rozgrzewka importu w `beforeAll`) | 3× pełny przebieg zielony | PR „Etap A" |
