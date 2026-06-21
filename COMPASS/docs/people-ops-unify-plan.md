# Plan: unifikacja people-ops w jeden moduł „People Ops"

> Status: **PLAN DO PRZEGLĄDU** (nie wdrożony). Utworzony 2026-06-21.
> Cel biznesowy (słowa Artura): jeden moduł, w którym TCM i admin w 5 sekund widzą — dla danego miesiąca —
> ile **onboardingów** jest należnych i ile zrobionych, ile **exit interviews** należnych i zrobionych,
> oraz status **bieżących spraw na kanbanie**. Niezależnie czy chodzi o pracownika wewnętrznego (z kontem)
> czy zewnętrznego kontraktora.
>
> Zastępuje rozproszone obszary: Talent Community (`/internal/kontraktorzy`), Zgłoszenia (`/internal/zgloszenia`),
> Pracownicy wewnętrzni (`/internal/lifecycle`), kolejka ticketów (`/admin/inbox`) + analityka (`/internal/analityka`).
>
> Podstawa: analiza 5 map kodu + odpytanie żywej bazy prod (`shduiynzemftkqqefscd`, 2026-06-21) + adwersarialna krytyka metryk.

---

## 0. Zasady naczelne (z Waszego wzorca, `~/.claude/rules` + Phase 37)

- **Additive over rewrite** — nowe migracje tylko dodają; legacy tabele zostają źródłem prawdy.
- **Read-model over rewrite** — dashboard czyta mirror Fazy 37 (`onboarding_cases`, `exit_cases`, zunifikowany `support_tickets`), nie przepisuje backendu.
- **Redirect over delete** — stare route'y → `301-style` redirecty na nowy moduł, nie kasowanie.
- **Reuse komponentów 1:1** — `KanbanBoard`, `OnboardingPanel`, `ExitPanel`, `RetencjaPanel`, panele templates.
- **Weryfikacja UI przez Chrome MCP po deploy** (autonomous-verification §2).

---

## 1. ⚠️ Stan faktyczny danych (prod, 2026-06-21) — czytaj PRZED budową pulpitu

To jest sedno. Sam ładny dashboard **pokaże 0/0**, bo pola napędzające metryki są dziś puste/rozjechane.
Konsolidacja UI + kanban są bezpieczne od ręki; **metryki wymagają najpierw naprawy fundamentu danych**.

| Obiekt | Stan live | Konsekwencja dla metryk |
|---|---|---|
| `profiles` | 41 wierszy, **wszyscy `employment_status='active'`**, **`termination_date` NULL u 100%**, 3× `hired_at` NULL | exit-pracowników „należne" = **0 na zawsze**; status NIE jest źródłem prawdy o lifecycle |
| `onboarding_progress` | 2 (1 cancelled, 0 completed) | onboarding-pracowników „zrobione" w VI = 0 |
| `exit_interviews` | 1 (status=scheduled, **`user_id=NULL` i `is_anonymous=FALSE`**) | założenie „NULL ⇒ anonim" jest **już fałszywe**; join person_id→profiles gubi ten wiersz |
| `placements` | 17, **wszystkie start w kwietniu 2026**, **7/17 cancelled (41%)**, **brak `end_date`** | onboarding-kontraktorów w VI = 0/0; brak `end_date` ⇒ „należne exity" tylko z `client_departures` |
| `contractor_onboarding_interviews` | 0 | onboarding-kontraktorów „zrobione" = 0 |
| `contractor_exit_interviews` | 0, **brak FK do `client_departures`** | exit-kontraktorów done↔due nie da się sparować 1:1 |
| `contractors` | 588, **wszyscy `status='active'`** (pole nie napędza lifecycle) | nie liczyć onboarding/exit ze `status` |
| `client_departures` | 333 (329 datowane, 4 bez daty; zakres 2021..2026); **VI: 11** (klient 4 / kandydat 4 / nieznany 1 / **internalizacja 2**) | „należne exity" filtruj po `departure_date` w oknie m-ca; **internalizacja = konwersja, nie odejście** |
| `contractor_bench` | 44 | najbardziej operacyjna lista TCM — nie gubić jej |
| `support_tickets` | 188 (45 open / 1 in_progress / 142 resolved) | gotowy zunifikowany store kanbanu |
| `support_inbox_meta` | 41 (skrzynka administracja@) | rodzina „Skrzynka" |
| `support_contractor_meta` | 147 (**wszystkie `kind=conversation`, 0 task**) | rodzina „Kontraktorzy" = log rozmów, mapowanie statusu stratne |

**Pułapki typów/nazw (potwierdzone):**
- `hired_at` / `start_date` / `termination_date` / `departure_date` = `DATE`; `*_at` (completed/submitted) = `TIMESTAMPTZ` → zawsze `date_trunc`, nie mieszaj typów.
- `exit_interviews.cancellation_reason` vs `onboarding_cases/exit_cases.cancelled_reason` — **różne nazwy kolumn**; filtr na złej = ciche zero.
- Dwa enumy priorytetu: `support_tickets.priority` (low/normal/high/urgent) vs `support_inbox_meta.priority_level` (P1/P2/P3) — kanban wybiera jeden kanon.
- `due_date` na dwóch tabelach: `support_inbox_meta.due_date` (TIMESTAMPTZ) i `support_contractor_meta.due_date` (DATE) → `coalesce` z castem.

---

## 2. Architektura docelowa

**Jeden wpis w sidebarze: „People Ops" → `/internal/people`** (gate: `requireTalentCommunityOrAdminLayout` = `talent_community` + `admin`; patrz decyzja D5 o `is_inbox_handler`).

```
/internal/people
  ?tab=pulpit      (default) — 3 kafle north-star + "Wymaga uwagi dziś"
  ?tab=onboarding  — kolejka, toggle [Pracownicy | Kontraktorzy]
  ?tab=exit        — kolejka, toggle [Pracownicy | Kontraktorzy] + Bench
  ?tab=sprawy      — KANBAN (rodziny: Skrzynka administracja@ | Kontraktorzy | Helpdesk)
  ?tab=analityka   — trendy (scala /internal/analityka + /internal/lifecycle/analytics)
  ?tab=szablony    — CRUD onboarding/exit templates (TCM/admin)

Szczegóły (reuse istniejących):
  /internal/people/onboarding/[progressId]
  /internal/people/exit/[interviewId]
  /internal/people/kontraktorzy/[contractorId]
  /admin/inbox/[id]   — zostaje (deep-linki z maili); lista przeniesiona do ?tab=sprawy
```

**Pulpit (kafle north-star)** — każdy kafel pokazuje **Pracownicy | Kontraktorzy** (+ „Razem" tylko po regule dedup, patrz §3.4):
1. **Onboarding — <miesiąc>**: Należne X / Zrobione Y + pasek postępu → strzałka do `?tab=onboarding`.
2. **Exit interviews — <miesiąc>**: Należne X / Zrobione Y → `?tab=exit`.
3. **Bieżące sprawy**: open / overdue / unassigned + mini-kanban → `?tab=sprawy`.
- Month-picker domyślnie na **ostatni miesiąc z danymi** (nie ślepo bieżący — inaczej zawsze 0/0).
- „Wymaga uwagi dziś": overdue sprawy + zaległe onboardingi/exity + 4 zejścia bez daty + 3 pracowników bez `hired_at`.

**Kanban (`?tab=sprawy`)** — jedna tabela `support_tickets`, kolumny `open → in_progress → waiting_user → resolved` (closed zwinięty). Filtr rodziny u góry; karta = ticket. Drag-drop reużywa `moveInboxTicket`/`updateTicketStatus`. „Ticket → Zadanie" (Phase 34) zostaje.

---

## 3. Definicje metryk (po korektach krytyki) — kontrakt SQL

> Wszystkie liczniki idą z read-modelu (`onboarding_cases`/`exit_cases` person_type) dla „zrobione",
> a „należne" z tabel intencji (`profiles` / `placements` / `client_departures`).
> **„Zrobione" liczymy WYŁĄCZNIE po `submitted_at`/`completed_at` + `status` — NIGDY przez `person_id`** (bo NULL ≠ anonim).

### 3.1 Onboarding — należne vs zrobione
```sql
WITH m AS (SELECT date_trunc('month', :asof::timestamptz) AS s)
SELECT
  (SELECT count(*) FROM profiles p, m
     WHERE p.hired_at >= m.s::date AND p.hired_at < (m.s + interval '1 month')::date) AS emp_due,
  (SELECT count(*) FROM onboarding_cases oc, m
     WHERE oc.person_type='employee' AND oc.completed_at IS NOT NULL
       AND oc.completed_at >= m.s AND oc.completed_at < m.s + interval '1 month') AS emp_done,
  -- należne kontraktorów: placements (mirror nie zna intencji niezałożonego wywiadu)
  (SELECT count(*) FROM placements pl, m
     WHERE pl.start_date >= m.s::date AND pl.start_date < (m.s + interval '1 month')::date
       AND pl.status <> 'cancelled') AS ctr_due,
  (SELECT count(DISTINCT oc.id) FROM onboarding_cases oc, m
     WHERE oc.person_type='contractor' AND oc.submitted_at IS NOT NULL
       AND oc.submitted_at >= m.s AND oc.submitted_at < m.s + interval '1 month') AS ctr_done;
```
Korekty: 7/17 placementów cancelled — **pokaż anulowane osobną linią** (strike-through), żeby trzymać `due ≥ done`. Kontraktor z 2 placementami = 2 należne / 1 wywiad → `DISTINCT`, brak założenia 1:1.

### 3.2 Exit interviews — należne vs zrobione
```sql
WITH m AS (SELECT date_trunc('month', :asof::timestamptz) AS s)
SELECT
  -- PRACOWNICY: po naprawie Fazy 0 należne = termination_date; do tego czasu fallback scheduled_for
  (SELECT count(*) FROM profiles p, m
     WHERE p.termination_date >= m.s::date AND p.termination_date < (m.s + interval '1 month')::date) AS emp_due,
  (SELECT count(*) FROM exit_cases ec, m
     WHERE ec.person_type='employee' AND ec.submitted_at IS NOT NULL
       AND ec.status IN ('submitted','reviewed','archived')
       AND ec.submitted_at >= m.s AND ec.submitted_at < m.s + interval '1 month') AS emp_done,
  -- KONTRAKTORZY: należne = zejścia datowane w m-cu, BEZ konwersji
  (SELECT count(*) FROM client_departures cd, m
     WHERE cd.departure_date >= m.s::date AND cd.departure_date < (m.s + interval '1 month')::date
       AND coalesce(cd.who_resigned,'') NOT IN ('internalizacja')) AS ctr_due,
  (SELECT count(DISTINCT ec.id) FROM exit_cases ec, m
     WHERE ec.person_type='contractor' AND ec.submitted_at IS NOT NULL
       AND ec.status IN ('submitted','reviewed','archived')
       AND ec.submitted_at >= m.s AND ec.submitted_at < m.s + interval '1 month') AS ctr_done;
```
Korekty krytyki:
- **`emp_due` jest dziś strukturalnie 0** (termination_date NULL u 100%). Naprawa = Faza 0 (krok A). Do tego czasu UI używa `scheduled_for` jako „należne" i pokazuje data-quality tile.
- Brak FK `contractor_exit_interviews → client_departures` → **kafel exit-kontraktorów pokazuje DWIE niezależne liczby** („Zejścia: N | Exit interviews złożone: M"), **nie** stosunek done/due. % dopiero po `placements.end_date` lub `departure_id` (Faza 5).
- **Internalizacja wykluczona** z należnych (to konwersja kontraktor→pracownik, nie odejście).

### 3.3 Bieżące sprawy (kanban)
```sql
SELECT
  CASE WHEN sc.slug LIKE 'inbox_%' THEN 'inbox'
       WHEN sc.slug LIKE 'contractor_%' THEN 'contractor'
       ELSE 'helpdesk' END AS family,
  t.status,
  count(*) AS n,
  count(*) FILTER (WHERE t.assignee_id IS NULL) AS unassigned,
  count(*) FILTER (WHERE coalesce(im.due_date, cm.due_date::timestamptz) < now()
                     AND t.status NOT IN ('resolved','closed')) AS overdue
FROM support_tickets t
JOIN support_categories sc ON sc.id = t.category_id
LEFT JOIN support_inbox_meta im ON im.ticket_id = t.id
LEFT JOIN support_contractor_meta cm ON cm.ticket_id = t.id
GROUP BY 1,2 ORDER BY 1,2;
```
„Bieżące sprawy" z north-star = `open + in_progress + waiting_user` w rodzinach `inbox` + `contractor`.
Znany gotcha (#217): helpdesk reader MUSI wykluczać `inbox_%` **i** `contractor_%`. Badge'y licz per rodzina, nie sumuj na ślepo.

### 3.4 „Razem" — reguła dedup (obowiązkowa)
Suma Pracownicy+Kontraktorzy **NIE jest czystą unią** z powodu „internalizacji" (ta sama osoba = exit kontraktora + onboarding pracownika w tym samym miesiącu). Reguła:
- Domyślnie pokazuj **dwie liczby** (Prac. | Kontr.), „Razem" tylko gdy włączony i z odjęciem konwersji.
- Konwersje (`who_resigned='internalizacja'`) → osobny licznik „Konwersje (kontraktor→pracownik): N", poza exitami i poza onboardingiem-należnym.

---

## 4. Fazy wdrożenia

### Faza 0 — Naprawa fundamentu danych (PRZED pulpitem; inaczej liczniki kłamią)
Cel: żeby „należne" i „zrobione" miały realne źródło. Wszystko additive + backfill, zero rewrite.

- **A. `termination_date`** — zweryfikować, że `start_offboarding_for_user` realnie ustawia `profiles.termination_date`; backfill istniejących offboardingów; dodać data-quality check „offboarding bez termination_date". Do czasu naprawy UI liczy `emp_due` z `exit_interviews.scheduled_for`.
- **B. Semantyka anonimizacji** — w każdym zapytaniu „zrobione" liczyć po `submitted_at` + `status`, nigdy gate'ować na `person_id`. NULL person = „niepodpięty z dowolnego powodu" (anonim LUB scheduled LUB bug), nie synonim anonima.
- **C. Źródło prawdy lifecycle** — przestać opierać widoki/redirecty na `employment_status` (rozjechany: 41× active vs 2 onboarding + 1 exit). Prawda = tabele lifecycle. Dodać reconcile-query (status vs otwarte wiersze lifecycle) do worklisty data-quality.
- **D. Internalizacja** — wykluczyć `who_resigned='internalizacja'` z exitów-należnych; osobny licznik konwersji.
- **E. Reconcile mirror↔legacy** — zaplanowany job `count(legacy) vs count(mirror)` per person_type (triggery Fazy 37 są SECURITY DEFINER + swallow errors → ciche niedoszacowanie przy skali).
- **F. Empty-state ≠ error-state** — month-picker default = ostatni miesiąc z danymi; jawne „Brak nowych onboardingów w tym miesiącu" vs „metryka niepodłączona".

Decyzja D2 (`placements.end_date`) — jeśli „teraz", to tu dochodzi migracja `placements.end_date` (czysto rozwiązuje exit-kontraktorów-należne bez `client_departures`); dotyka też `bonus_eligible_date`, więc wymaga ostrożności.

### Faza 1 — Read-model KPI (1 migracja additive, read-only)
- Nowy VIEW `people_ops_monthly_summary` kapsułujący SQL z §3.1–3.2 (6 liczb per miesiąc) + widok/akcja kanbanu z §3.3.
- Można zacząć od server-action liczącej w locie; widok dodać dla wydajności.
- Zero `ALTER` na istniejących tabelach.

### Faza 2 — Nowy moduł `/internal/people` + Pulpit (additive UI)
- Nowy route `app/(protected)/internal/people/page.tsx` + `?tab=pulpit` (3 kafle + „Wymaga uwagi dziś") czytający Fazę 1.
- Stare route'y **nietknięte**. Sidebar dostaje jeden link „People Ops"; stare zostają tymczasowo.

### Faza 3 — Przeniesienie zakładek (reuse paneli)
- `?tab=onboarding` / `?tab=exit` — toggle populacji, reuse `OnboardingPanel`/`ExitPanel`/`RetencjaPanel` + Bench.
- `?tab=sprawy` — osadzić `KanbanBoard` z 3 rodzinami (filtr) + „Ticket→Zadanie".
- `?tab=analityka` — scalić `getContractorDashboard` + `getLifecycleAnalytics` + `getTicketTypeAnalytics`.
- `?tab=szablony` — reuse templates CRUD.
- Test: `listTickets` dalej wyklucza `inbox_%` I `contractor_%`.

### Faza 4 — Redirecty + cleanup sidebara
- `/internal/lifecycle|kontraktorzy|analityka|zgloszenia` → `/internal/people?tab=…` (redirect, nie delete).
- Detail routes (`/admin/inbox/[id]`, `/internal/people/onboarding/[id]`) działają dalej.
- Sidebar: usunąć zdublowane linki (m.in. dwie ścieżki managera do timesheetów/urlopów — sąsiedni cleanup, formalnie poza People Ops bo to `/internal/admin`).

### Faza 5 — (PÓŹNIEJ, osobna decyzja) CONTRACT / drop legacy
- `placements.end_date` (jeśli nie w Fazie 0) + `departure_id` FK na `contractor_exit_interviews` → umożliwia realny % done/due exitów kontraktorów.
- Ewentualny drop legacy po 1–2 sprintach weryfikacji mirror. Dotyka źródła prawdy + premii — osobne planowanie.

---

## 5. Pliki (orientacyjnie; potwierdzić przy realizacji)

**Nowe:**
- `COMPASS/supabase/migrations/<ts>_people_ops_monthly_summary.sql` (Faza 1; ew. `placements_end_date` w Fazie 0/5)
- `COMPASS/app/(protected)/internal/people/page.tsx` + `[onboarding|exit|kontraktorzy]/[id]/page.tsx`
- `COMPASS/components/internal/people/PeopleOpsHub.tsx` + `panels/PulpitPanel.tsx` (+ reuse istniejących paneli)
- `COMPASS/lib/actions/people-ops.ts` (KPI + kanban aggregation, czyta read-model)

**Edytowane:**
- `COMPASS/components/layout/Sidebar.tsx` (jeden link „People Ops", usunięcie duplikatów)
- `COMPASS/lib/auth/internal-guard.ts` (gate `/internal/people`; rozwiązać mismatch `is_inbox_handler` vs rola TCM — D5)
- `COMPASS/app/(protected)/internal/{lifecycle,kontraktorzy,analityka,zgloszenia}/page.tsx` → redirecty
- `COMPASS/lib/actions/{lifecycle,contractors,zgloszenia-analytics,support-inbox}.ts` (reuse; ujednolicić filtry kategorii)

**Bez zmian (zostają źródłem prawdy):** wszystkie tabele legacy + triggery transition/anonimizacji/RLS, auto-ingest maila (Phase 26b-d), `start_onboarding_for_user`/`start_offboarding_for_user`, `contractor_bench`, read-model Phase 37.

---

## 6. Decyzje otwarte (domyślne — do potwierdzenia)

| # | Pytanie | Domyślna propozycja |
|---|---|---|
| D1 | „Należne" wg daty intencji (hired_at/start_date/termination_date/departure_date) czy daty wywiadu (scheduled_for)? | **Data intencji** (scheduled_for tylko jako fallback dla emp-exit do czasu naprawy termination_date) |
| D2 | Dodać `placements.end_date` teraz czy później? | **Później (Faza 5)** — chyba że zależy Ci na realnym % exitów kontraktorów od startu |
| D3 | Helpdesk konsultantów w kanbanie People Ops czy poza modułem? | **Schowana rodzina** w kanbanie (i tak `/support` zostaje dla konsultantów) |
| D4 | „Razem" sumować obie populacje czy zawsze rozbite? | **Rozbite (Prac. \| Kontr.)** + osobny licznik konwersji; „Razem" tylko z dedup |
| D5 | `is_inbox_handler` (nie-TCM) po przeniesieniu listy do People Ops | **Rozszerzyć gate** `/internal/people?tab=sprawy` o `is_inbox_handler`, by handler nie stracił skrzynki |
| D6 | 4 zejścia bez `departure_date` + 3 pracowników bez `hired_at` | **Worklista „wymaga uzupełnienia"** na pulpicie; uzupełnić ręcznie |
| D7 | Szablony + analityka w tym module czy węższy moduł (Pulpit+Onboarding+Exit+Sprawy)? | **W module** jako zakładki |

---

## 7. Ryzyka

- Brak `placements.end_date` → exit-kontraktorów-należne wyłącznie z `client_departures`; 4 zejścia bez daty wypadają z licznika.
- Latencja/ciche błędy mirror (triggery swallow errors) — przy małym N błąd = 50%, nie zaokrąglenie → konieczny reconcile (Faza 0E).
- Dane historyczne (`client_departures`=333, `contractors`=588 z importu 2024) zaśmiecają KPI → filtruj po `departure_date`/`start_date` w oknie m-ca, NIGDY po `created_at`.
- `contractors.status` bezużyteczne dla lifecycle (588× active).
- Mapowanie statusu rozmów kontraktorskich (w_toku/pilne) → status ticketu (open/in_progress) jest **stratne** — kanban rodziny kontraktorskiej to przybliżenie.
- Anonimizacja zeruje person_id → drill-down imienny musi jawnie obsłużyć NULL.

## 8. Weryfikacja (Definition of Done)
- Po każdej fazie z UI: build + deploy + **Chrome MCP** (realne klikanie + screenshot), zgodnie z autonomous-verification §2/§6.
- Backend/migracje: porównanie liczników read-model vs ręczny SQL na prodzie (reconcile).
- Smoke `/api/health` nowy `GIT_SHA` po deploy.

## 9. Świadomie poza zakresem (na teraz)
- Drop legacy / pełny CONTRACT (Faza 5, osobno).
- `placements.end_date` + `departure_id` FK (jeśli D2 = później).
- Zmiana semantyki premii (`bonus_eligible_date`).
- Holiday-aware SLA w kanbanie.
- Przywrócenie UI compliance (`um_*` zostają w DB jako audyt; osobny temat).
