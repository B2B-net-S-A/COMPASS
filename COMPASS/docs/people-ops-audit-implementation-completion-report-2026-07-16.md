# People Ops + Consultant Success — raport wdrożenia Faz 0–2 audytu (2026-07-16)

> Realizuje plan: `docs/people-ops-consultant-success-audit-and-unification-plan-2026-07-16.md`
> (kolejność startowa §13, podział na PR-y §8).
>
> Zakres tego wdrożenia: **PR 1 (security containment) + PR 2 (poprawność People Ops)
> + quick-winy z PR 4 (Success: P1.9, P1.10)**. Fazy 3–8 (identity, read-modele,
> wspólny shell/profil, cutover) świadomie poza zakresem — patrz „Co dalej".

## 1. Weryfikacja planu (przed implementacją)

Wszystkie twierdzenia sprawdzone przeciwko `origin/main` (660dd0a) i żywym politykom
`compass-prod` (read-only `pg_policies`/`pg_proc`):

| Twierdzenie | Werdykt |
|---|---|
| P0.1 `lifecycle_events` INSERT `WITH CHECK (true)` | ✅ potwierdzone (migracja + live policy) |
| P0.2 komentarz `NOT is_internal` bez sprawdzenia dostępu do ticketu | ✅ potwierdzone (live policy) |
| P1.1/P1.2 kafel liczy `inbox_%+contractor_%`, lista pokazuje inbox+helpdesk; odmowa → `[]` | ✅ potwierdzone |
| P1.3 `in_progress` bez `cancelled_at`; overdue przez `new Date()` | ✅ potwierdzone |
| P1.5 aktywne procesy w „Wymaga uwagi" | ✅ potwierdzone (PulpitPanel) |
| P1.6 fallback `scheduled_for` tylko jako notka obok zera | ✅ potwierdzone |
| P1.8 `listBench` INSERT-uje przy renderze, bez filtra internalizacji | ✅ potwierdzone |
| P1.9 reminder taska → `owner_tcm_id` mimo pobranego `assigned_tcm_id` | ✅ potwierdzone (planner + delivery) |
| P1.10 wykres health liczy przejścia, nie snapshot | ✅ potwierdzone |
| P1.13 mirrory z politykami write; app w ogóle nie używa mirrorów | ✅ potwierdzone (zero referencji w kodzie) |
| P1.14 sync-funkcje EXECUTE dla anon/authenticated | ✅ potwierdzone (`sync_task_ticket` już był revoked) |
| P1.15 `FOR ALL` (z DELETE) na contractors/historii | ✅ potwierdzone; app pisze service-rolem → revoke bez utraty funkcji |

**Znalezisko ponad plan** (z re-run Security Advisora, wymaganego przez Fazę 0):
`admin_hard_delete_user` — SECURITY DEFINER kasujący `auth.users`, **bez wewnętrznego
sprawdzenia aktora**, wykonywalny przez `anon` i `authenticated` przez `/rest/v1/rpc/`.
Aplikacja woła go wyłącznie service-rolem po guardzie Super Admina → REVOKE dołączony
do migracji containment.

## 2. PR #261 — Faza 0: security containment (MERGED)

Migracja `20260716000001_people_ops_security_containment.sql`
(zaaplikowana na prod przez Supabase MCP jako `people_ops_security_containment`):

- **P0.1** — DROP `lifecycle_events_insert_authenticated`; zapis wyłącznie
  service-role / SECURITY DEFINER RPC. `assignBuddy` (jedyna user-context ścieżka;
  wynik insertu i tak był ignorowany) przełączony na service-client.
- **P0.2** — `can_access_support_ticket(uuid)` (SECURITY INVOKER → deleguje do RLS
  `support_tickets` = jeden kontrakt dostępu) obowiązkowy w SELECT **i** INSERT
  `support_ticket_comments`.
- **P1.14** — REVOKE EXECUTE (anon/authenticated/PUBLIC) na `sync_conversation_ticket`,
  `sync_exit_case_*`, `sync_onboarding_case_*`, `block_lifecycle_events_mutation`;
  pin `search_path` na `is_contractor_category`.
- **P1.13 (containment)** — mirrory `onboarding_cases`/`exit_cases` read-only dla ról
  API (pisze tylko sync-trigger; SELECT-y zostają).
- **P1.15 (containment)** — `FOR ALL` → SELECT/INSERT/UPDATE (bez DELETE) na:
  `contractors`, `contractor_conversations`, `contractor_onboarding_interviews`,
  `contractor_exit_interviews`, `client_entries`, `client_departures`,
  `contractor_bench`, `contractor_tasks`.
- **Advisor** — REVOKE `admin_hard_delete_user` dla PUBLIC/anon/authenticated.

**Testy RLS (transakcja + ROLLBACK, symulowane JWT przez `request.jwt.claims`):**

| Scenariusz | Wynik |
|---|---|
| consultant → INSERT `lifecycle_events` (sobie) | ✅ DENY (42501) |
| consultant → komentarz `is_internal=false` do ticketu inbox | ✅ DENY |
| consultant → własny ticket helpdesk + komentarz | ✅ OK (brak regresji) |
| TCM → SELECT `contractors` | ✅ OK |
| TCM → DELETE `contractors` | ✅ 0 rows |
| TCM → INSERT `lifecycle_events` user-kontekstem | ✅ DENY |

Security Advisor po zmianach: brak nowych P0/P1 na zmienionych obiektach.

## 3. PR #262 — Fazy 1–2: poprawność People Ops + Success

**People Ops:**

- **P1.3** — `listOnboardingQueue`: `in_progress` = `completed_at IS NULL AND
  cancelled_at IS NULL`; overdue liczone względem biznesowego dziś **Europe/Warsaw**
  (`lib/utils/business-date.ts`; kontrakt: due today ≠ overdue).
- **P1.6** — należne exity per-rekord `COALESCE(termination_date, scheduled_for)`
  z deduplikacją po userze i wykluczeniem `cancelled` (`lib/people-ops/exit-due.ts`);
  kafel pokazuje jedną liczbę + jawną notkę, ilu weszło fallbackiem.
- **P1.5** — Pulpit: karta „Aktywne procesy" (neutralna informacja) oddzielona od
  „Wymaga uwagi / uzupełnienia" (wyłącznie braki danych).
- **P1.2** — kafel Spraw liczy **wyłącznie** rodzinę `inbox_%` = dokładnie zakres
  kanbana w zakładce Sprawy (KPI = lista).
- **P1.8** — `listBench` czysto read-only; seeding = jawna idempotentna komenda
  `seedBenchFromRecentDepartures` (`lib/contractors/bench-seed.ts`) wołana z cron
  `tc-sync` i `commitZejsciaImport`; **internalizacja wykluczona** z seedu.
- **P1.1/P1.7 (minimum)** — Sprawy renderują jawny `AccessNotice` (powód + wskazówka)
  zamiast pustego kanbana przy odmowie/awarii; awaria benchu w zakładce Exit pokazuje
  błąd sekcji zamiast udawać pustą listę.

**Consultant Success (quick-winy z PR 4 planu):**

- **P1.9** — planner adresuje reminder taska do `assigned_tcm_id` (owner portfolio
  tylko jako jawny fallback); delivery rewaliduje odbiorcę względem **aktualnego**
  assignee (`recipient_assignee_changed`). Allowlista TCM/admin bez zmian.
- **P1.10** — `healthHistory` = snapshot ostatniego statusu per konsultant na koniec
  okresu (`lib/consultant-success/health-snapshot.ts`); green→amber→green liczy się
  raz; słupek nigdy nie przekracza liczby zmierzonych osób. Opis wykresu w
  `SuccessAnalyticsView` zaktualizowany.

**Testy:** 24 nowe unit testy (business-date 8, exit-due 6, bench-seed 4,
health-snapshot 6); pełna suita **917 passed**; `tsc --noEmit` czysty; nowe pliki
bez warningów ESLint.

## 4. Pliki

Nowe: `lib/utils/business-date.ts`, `lib/people-ops/exit-due.ts`,
`lib/contractors/bench-seed.ts`, `lib/consultant-success/health-snapshot.ts`
(+ 4 pliki testów), `supabase/migrations/20260716000001_people_ops_security_containment.sql`.

Zmienione: `lib/actions/{lifecycle,people-ops,contractors,contractor-import,consultant-success}.ts`,
`lib/consultant-success/{planner,delivery}.ts`, `app/api/cron/tc-sync/route.ts`,
`components/internal/people/{PulpitPanel,SprawyTabPanel,ExitTabPanel}.tsx`,
`components/internal/zgloszenia/ZgloszeniaHub.tsx`,
`components/internal/success/SuccessAnalyticsView.tsx`.

## 5. Ograniczenia / świadome decyzje

- **Bench** doseeduje się przy najbliższym `tc-sync` (05:00 UTC) lub ręcznym imporcie
  Zejść — już nie przy wejściu na zakładkę. Istniejące wiersze internalizacji na
  benchu pozostają (slot zachowany, brak re-seedu).
- **P1.7 w pełni** (kontrakt `DataState ok|empty|partial|error` w całej aplikacji)
  to Faza 4 — tutaj tylko najbardziej mylące miejsca (Sprawy, bench).
- **P1.4** (wiązanie wywiadów po `placement_id`/`departure_id` + backfill) — osobny
  PR 3 planu (wysokie ryzyko, wymaga dry-run + reconcile), nie ruszony.
- **P1.11** (atomowe RPC Success), **P1.15 pełne** (archive-zamiast-DELETE w UI,
  soft-cancel tasków), **P1.16–P1.18**, Fazy 3–8 — patrz plan, nie ruszone.
- **P1.12** dotyczy niezmergowanej gałęzi `feat/consultant-success-final-gaps` —
  na `main` słownik `critical` nie występuje; gałąź nadal NIE nadaje się do merge
  bez rebase + naprawy `urgent` (rekomendacja planu podtrzymana).
- Snapshot health liczy populację „zmierzonych do końca okresu" (konsultanci bez
  żadnej oceny nie zaniżają wykresu wiadrem unknown — ich liczbę pokazuje dashboard).
- Limit 5000 na odczycie historii health zostaje (dziś 0 wierszy na prodzie) —
  paginacja/agregacja SQL to Faza 4.

## 6. Weryfikacja po deploy

- `/api/health` — wersja = short SHA merge-commita, status healthy.
- Chrome (admin): `/internal/people` (Pulpit: kafle + „Aktywne procesy" osobno od
  „Wymaga uwagi"; Onboarding bez cancelled; Sprawy bez cichej pustki) oraz
  `/internal/people/success/analytics` (wykres „Statusy relacji na koniec okresu").
- Advisor security: brak nowych P0/P1 na zmienionych obiektach.
