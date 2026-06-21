# Talent Community — przebudowa wokół journey kontraktora (Faza 34)

> Zmergowane do `main` ([#205](https://github.com/artur-t-96/compass/pull/205), `d5eb362`). Status: **wdrożone i zweryfikowane na prodzie** (2026-06-03).

## Cel

Dział Talent Community pracuje wg ścieżki osoby: **placement → onboarding → opieka → retencja → exit → analiza zejść**, plus przekrojowo **skrzynka administracja@** i **zadania „naokoło"**. Dotąd ta praca była rozsypana i nazwana technicznie (Rozmowy/Wejścia/Zejścia/Statystyki) oraz rozbita między dwa moduły. Faza 34 układa hub Kontraktorów wg etapów journey, headline'uje właściwy moduł w nawigacji, dodaje proaktywną Retencję i tablicę Zadań, oraz spina skrzynkę z worklistą („Ticket → Zadanie").

## Co się zmieniło

### 1. Sidebar — grupa „Talent Community" wg journey
`COMPASS/components/layout/Sidebar.tsx`. Kolejność: **Skrzynka administracja@ → Kontraktorzy (headline) → Onboarding pracowników (wewn.) → Compliance → News composer**. Link Faza-22 Lifecycle przemianowany na „Onboarding pracowników (wewn.)" by jasno oddzielić populację (pracownicy wewnętrzni vs kontraktorzy u klientów). Standalone grupa „Lifecycle" dla internal/finanse/manager — bez zmian.

### 2. Hub Kontraktorów — zakładki wg etapów
`KontraktorzyHub.tsx` (cienki orchestrator) + panele w `components/internal/kontraktorzy/panels/`:
- **Pulpit** (`PulpitPanel`) — KPI + „wymaga uwagi dziś" (at-risk / follow-up / onboarding / exit) + **liczniki skrzynki** (otwarte/przeterminowane/nieprzypisane) + Import (zwinięty).
- **Onboarding** (`OnboardingPanel`) — kolejka prospect/onboarding + stan wywiadu + Wejścia (intake).
- **Opieka** (`OpiekaPanel`) — roster kontraktorów + log rozmów (dawne Rozmowy + Kontraktorzy).
- **Retencja** (`RetencjaPanel`) — **NOWE**: proaktywna worklista zagrożonych (derived z rozmów, bez migracji).
- **Exit & analiza zejść** (`ExitPanel`) — kolejka exit interview + zejścia + trendy (powody, per klient).
- **Zadania** (`ZadaniaPanel`) — **NOWE**: prosta lista zadań działu.

### 3. Zadania — jedyna nowa tabela
- Migracja `COMPASS/supabase/migrations/20260607000001_phase34a_contractor_tasks.sql`: tabela `contractor_tasks` (status todo/in_progress/done, assignee TCM, due_date, opcjonalny `contractor_id` i `source_ticket_id`), RLS `has_lifecycle_access()`, trigger `updated_at`, indexy.
- Typy + helpery w `lib/types/contractor.ts`; akcje `listTasks/createTask/updateTask/deleteTask` w `lib/actions/contractors.ts`; audit `CONTRACTOR_TASK_CREATED/UPDATED/DELETED`.
- `TaskDialog.tsx` (create/edit, controlled-open dla flow z inboxu).

### 4. Skrzynka ↔ Zadania („Ticket → Zadanie")
- `getInboxSummary()` w `lib/actions/support-inbox.ts` (open/overdue/unassigned) → Pulpit.
- Przycisk **„Utwórz zadanie z tego zgłoszenia"** w `app/(protected)/admin/inbox/[id]/page.tsx` (`components/inbox/TicketToTaskButton.tsx`) — tylko TCM/admin. Tworzy `contractor_tasks` z `source_ticket_id`; zadanie pokazuje odnośnik powrotny do ticketu. Tak email-issue staje się śledzonym zadaniem, które przeżyje zamknięcie ticketu.

### 5. Małe zapytania read-only (bez migracji)
`listOnboardingQueue()`, `listExitInterviewQueue()` w `lib/actions/contractors.ts`; wpięte w `kontraktorzy/page.tsx`.

## Pliki

**Nowe:** `supabase/migrations/20260607000001_phase34a_contractor_tasks.sql`, `components/internal/kontraktorzy/TaskDialog.tsx`, `components/internal/kontraktorzy/panels/{shared,PulpitPanel,OnboardingPanel,OpiekaPanel,RetencjaPanel,ExitPanel,ZadaniaPanel}.tsx`, `components/inbox/TicketToTaskButton.tsx`.
**Zmienione:** `components/layout/Sidebar.tsx`, `components/internal/kontraktorzy/KontraktorzyHub.tsx`, `app/(protected)/internal/kontraktorzy/page.tsx`, `app/(protected)/admin/inbox/[id]/page.tsx`, `lib/types/{contractor,support}.ts`, `lib/actions/{contractors,support-inbox,audit}.ts`, `lib/supabase/database.types.ts` (ręcznie dodany `contractor_tasks` — regen przy shipie).

## Weryfikacja

- ✅ **Typecheck**: `tsc --noEmit` czysty.
- ✅ **Lint**: eslint czysty na dotkniętych plikach.
- ✅ **Build**: `next build` exit 0; CI (gitleaks / lint / typecheck / test / build / review) all pass.
- ✅ **Migracja**: `phase34a_contractor_tasks` zaaplikowana na prod (11 kolumn, RLS on, 1 policy, 5 indexów).
- ✅ **Deploy**: Coolify (merge #205 → `main`), `/api/health` → `healthy`, version `d5eb362`, supabase healthy.
- ✅ **Smoke UI (Chrome, prod)**: 6 zakładek hubu + Opieka (583), Pulpit z inbox KPI (41 / 40 / 40), sidebar, **„Ticket → Zadanie" end-to-end** (utworzenie z ticketu → odnośnik powrotny w Zadaniach → cleanup).

## Ops — wykonane przy shipie (2026-06-03)

1. ✅ Migracja `phase34a_contractor_tasks` zaaplikowana na prod (Supabase MCP).
2. ✅ Deploy przez Coolify (merge #205 → main), smoke `/api/health` version-match OK.
3. ✅ Smoke UI przez Chrome (admin) — pełny flow.

`lib/supabase/database.types.ts` ma ręcznie dodany `contractor_tasks` (zgodny z prod); przy najbliższym pełnym regenie typów zsynchronizują się relacje FK (kosmetyka).

## Świadomie poza zakresem (opcja C / przyszłość)

Automatyzacja handoffu placement→onboarding (dziś sygnał = ticket w inboxie); link ticket↔kontraktor (`support_inbox_meta.contractor_id`); cron SLA breach; wspólna analiza trendów zejść przez obie populacje; scalanie Faz 22/33.
