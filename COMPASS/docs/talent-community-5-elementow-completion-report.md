# Talent Community — 5 elementów (Rozmowy / Onboarding / Exit / Kontraktorzy / Analityka)

> Faza 38 — rozbicie people-ops kontraktorskiego z powrotem na 5 dedykowanych elementów wg ścieżki
> życia kontraktora, plus nowa funkcja: upload pliku wywiadu (onboarding/exit) per wiersz.
> Zmiana **bez migracji** — reużywa istniejących tabel (Phase 33) + bucketu `lifecycle-docs` (Phase 33c).

## Co dostarczono

Moduł **Talent Community** = 5 elementów w sidebarze (TCM + admin):

| Element | Gdzie | Tabele |
|---|---|---|
| **Rozmowy** | `/internal/kontraktorzy?tab=rozmowy` | Zagrożeni (at-risk) + Logi rozmów (`contractor_conversations`) + import rozmów |
| **Onboarding** | `?tab=onboarding` | Wejścia (`placements`+`client_entries`) + Onboarding (przepisane kolumny + **upload pliku „Onboarding interview"** per wiersz) + import wejść |
| **Exit** | `?tab=exit` | Zejścia (pełne kolumny) + Exit Interview (przepisane + **upload pliku „Exit Interview"**) + import zejść |
| **Kontraktorzy** | `?tab=kontraktorzy` | Aktualni kontraktorzy ze stawkami: Imię, Klient, Rekruter, **Delivery Lead**, Data wejścia, **Stawka przychodowa/kosztowa, Marża** |
| **Analityka** | `/internal/analityka` (osobny route) | KPI + powody zejść + typy zgłoszeń (bez zmian) |

Cztery pierwsze to zakładki jednego huba `/internal/kontraktorzy` (deep-link `?tab=`); Analityka to
istniejący osobny route. Wszystkie 5 wylistowane w sidebarze.

**Zgłoszenia (skrzynka administracja@ + helpdesk) i Composer News** — wydzielone do osobnej grupy
sidebara **„Komunikacja"** (decyzja: „Zostaw osobno"). Nic nie usunięto, nadal dostępne.

**Onboarding pracowników wewnętrznych** (Lifecycle, Phase 22 — inna populacja) — grupa
**„Pracownicy wewnętrzni"** (`/internal/lifecycle`) jest teraz widoczna też dla TCM/admin.

## Nowa funkcja: upload plików wywiadów

Kolumna `attachments` (JSONB) istniała w `contractor_*_interviews` od Phase 33, ale **nie miała UI
ani akcji uploadu** — dodane teraz:

- `uploadContractorInterviewFile(formData)` — upload do `lifecycle-docs/contractor-{onboarding|exit}/{contractorId}/`,
  dopina do `attachments` najnowszego wywiadu (tworzy wywiad gdy brak). Gdy wiersz nie jest jeszcze
  powiązany z kontraktorem — **find-or-create kontraktora po nazwisku** + podlinkowanie wejścia/zejścia.
- `removeContractorInterviewFile(kind, contractorId, path)` — usunięcie załącznika.
- `getContractorInterviewFileUrl(path)` — krótkożyciowy signed URL (5 min) do podglądu.
- Walidacja: ≤10 MB, dozwolone PDF/Word/Excel/obrazy. Zapis/odczyt przez service client (po guardzie).
- Komponent `InterviewFileCell` — upload + lista plików (klik → signed URL) + usuń, per wiersz.

## Pliki

**Nowe:**
- `lib/types/contractor.ts` — typy `OnboardingEntryItem`, `ExitDepartureItem`, `ContractorRosterItem`, `InterviewKind`
- `lib/actions/contractors.ts` — `listOnboardingEntries`, `listExitDepartures`, `listContractorRoster`, `uploadContractorInterviewFile`, `removeContractorInterviewFile`, `getContractorInterviewFileUrl` (+ helpery `latestInterviewByContractor`, `resolveOrCreateContractor`, `sanitizeFileName`, `fileSha256`)
- `components/internal/kontraktorzy/InterviewFileCell.tsx`
- `components/internal/kontraktorzy/panels/{RozmowyPanel,OnboardingEntriesPanel,ExitPanel,KontraktorzyRosterPanel}.tsx`

**Zmienione:**
- `components/internal/kontraktorzy/KontraktorzyHub.tsx` — przepisany na 4 zakładki
- `app/(protected)/internal/kontraktorzy/page.tsx` — z redirectu → ładowanie danych + hub
- `app/(protected)/internal/onboarding/page.tsx` — redirect → `?tab=onboarding`
- `components/layout/Sidebar.tsx` — grupa Talent Community (5 linków) + nowa grupa Komunikacja + Pracownicy wewnętrzni dla TCM/admin + domyślna zakładka `rozmowy`
- `lib/actions/audit.ts` — 3 nowe akcje audytu (file uploaded/removed)

## Źródła danych

- **Roster „Kontraktorzy"** = `placements` (status ≠ cancelled) ∪ `client_entries` (archiwum 2024),
  dedup po kluczu naturalnym (konsultant+klient+start), placement wygrywa. Stawki/DL/marża z tych tabel.
- **Onboarding/Exit** = ten sam `listEntries`/`listDepartures` wzbogacony o `contractor_id` + najnowszy
  wywiad (status + załączniki).

## Audit log

`CONTRACTOR_ONBOARDING_INTERVIEW_FILE_UPLOADED`, `CONTRACTOR_EXIT_INTERVIEW_FILE_UPLOADED`,
`CONTRACTOR_INTERVIEW_FILE_REMOVED` (+ `CONTRACTOR_CREATED` z `via: interview_upload` przy find-or-create).

## Weryfikacja

- `tsc --noEmit` — czysto (jedyne pozostałe błędy to udokumentowany spurious `exceljs` w worktree:
  `node_modules` symlinkowane z maina nie ma `exceljs`, którego worktree `package.json` wymaga; na CI/Coolify OK).
- `eslint` — 0 błędów / 0 warningów w nowym kodzie (2 pozostałe warningi to pre-existing: `audit.ts` any, `Sidebar` `user`).
- **`next build`** weryfikowany przez CI na PR (lokalnie blokuje spurious exceljs).
- **UI (Chrome)** — do wykonania po merge na prod (zmiana nawigacji TCM/admin).

## Świadomie poza zakresem / loose ends

- **Zadania (Zadania kontraktorskie, Phase 34)** — nie ma w 5-elementowej specyfikacji, więc widok
  Zadań zniknął z huba. Tworzenie zadania z ticketu (`TicketToTaskButton` w `/admin/inbox`) **nadal działa**,
  ale utworzone zadania nie mają obecnie widoku. Do decyzji: przywrócić widok czy wygasić feature.
- **Osierocone pliki** (martwy kod po tej zmianie, build przechodzi): `panels/SprawyOtwartePanel.tsx`,
  `panels/OffboardingPanel.tsx`, `panels/AnalitykaPanel.tsx`, `panels/OnboardingPanel.tsx` (stary),
  `panels/ZadaniaPanel.tsx`, `components/internal/onboarding/OnboardingHub.tsx`. Zostawione świadomie
  (surgical diff); cleanup jako follow-up.
- **Upload anchoruje do kontraktora** (nie do konkretnego wejścia) — jeśli kontraktor ma kilka wejść,
  plik dopina się do jego najnowszego wywiadu. Wystarczające dla obecnego flow (1 bieżące wejście/osoba).
- `/internal/zgloszenia` — zakładka „Sprawy kontraktorskie" nadal duplikuje log rozmów (element Rozmowy);
  zostawione, bo Zgłoszenia są osobnym modułem („Zostaw osobno").
