# Talent Community — przebudowa wokół journey kontraktora (Faza 34)

> Branch: `claude/infallible-williams-969fa8`. Status: **kod gotowy, niezdeployowany** — czeka na wizualną akceptację + aplikację migracji (per plan).

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

- ✅ **Typecheck**: `tsc --noEmit` czysty (poza 7 pre-existing błędami `exceljs` — artefakt symlinka `node_modules` z głównego checkoutu, nie z tej zmiany).
- ✅ **Lint**: eslint czysty na wszystkich dotkniętych plikach (pozostałe 2 warningi — `Sidebar` `user`, `audit.ts` `any` — są pre-existing).
- ⏳ **Smoke UI (Chrome)**: niewykonany — worktree nie ma `.env.local` (tylko `.example`), więc brak auth/Supabase do lokalnego uruchomienia. Wizualna akceptacja = krok użytkownika przy shipie.
- ⏳ **Migracja**: NIE zaaplikowana (per plan: DDL na prod dopiero po akceptacji).

## Ops przy shipie (do zrobienia)

1. Zaaplikuj migrację `phase34a_contractor_tasks` (Supabase MCP `apply_migration` / `supabase db push`).
2. Zregeneruj `lib/supabase/database.types.ts` (MCP `generate_typescript_types`) — powinno odpowiadać ręcznie dodanemu kształtowi.
3. Wizualny smoke jako admin: 6 zakładek hubu + „Ticket → Zadanie" w `/admin/inbox/{id}` + sidebar (nowa kolejność, „Onboarding pracowników (wewn.)").
4. Regresja: internal/manager nadal widzą standalone „Onboarding & Exit".

## Świadomie poza zakresem (opcja C / przyszłość)

Automatyzacja handoffu placement→onboarding (dziś sygnał = ticket w inboxie); link ticket↔kontraktor (`support_inbox_meta.contractor_id`); cron SLA breach; wspólna analiza trendów zejść przez obie populacje; scalanie Faz 22/33.
