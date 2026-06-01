# Phase 33 — Moduł „Kontraktorzy" (Talent Community) — completion report

**Data:** 2026-06-01
**Cel:** Przeniesienie 4 plików Worda/Excela używanych przez Talent Community (Błażej, Paula) do Compass, żeby cały cykl życia kontraktora u klienta odbywał się w aplikacji.

## Co zastąpiono

| Plik źródłowy | Gdzie w Compass |
|---|---|
| `Forumlarz - Onboarding Interview.docx` | Onboarding Interview na karcie kontraktora (formularz: check-in 1 dzień / 2 tyg. / Case Study) |
| `Forumlarz - Exit Interview.docx` | Exit Interview na karcie kontraktora (zejście / rezultat: przepięcie, wydłużenie, wnioski) |
| `Rozmowy z kontraktorami.xlsx` | Log rozmów `/internal/kontraktorzy` (tabela z kolorami statusów + filtry + import) |
| `Wejścia i zejścia od klientów 2024.xlsx` | Zakładki „Wejścia" (UNION archiwum 2024 + placementy Phase 28) i „Zejścia" + import |

## Architektura (decyzje z użytkownikiem)

1. **Cały moduł naraz** — schema + actions + importery + UI + cron w jednej fazie.
2. **Import całej historii 2024** — idempotentny (dedup po `external_key`), fuzzy-match osób.
3. **Reuse Phase 22, ale lekka tabela `contractors`** — kontraktor NIE jest profilem (`profiles`/`auth.users`): ma telefon, nie mail; ~300 historycznych zalałoby katalog pracowników i dropdowny. Profil dopinany leniwie (`contractors.profile_id`) tylko gdy kontraktor jest też pracownikiem wewnętrznym.
4. **Widoczność: tylko `talent_community` + `admin`** — RLS wszystkich nowych tabel = `has_lifecycle_access()`; sidebar + layout-guard zawężone. `placements` BEZ zmian RLS (premie działają jak dotąd).

## Schema (4 migracje, addytywne — zaaplikowane na prod via MCP)

- `20260606000001_phase33a_contractors` — `contractors` (tożsamość) + ALTER `placements` (`contractor_id` + pola Wejść: order_number/term, guarantee, note_am/billing/hr) + backfill 17 placementów → kontraktorzy.
- `20260606000002_phase33b_contractor_conversations` — log rozmów + `notifications.type += 'contractor_followup'`.
- `20260606000003_phase33c_contractor_interviews` — `contractor_onboarding_interviews` + `contractor_exit_interviews` + trigger transition (`scheduled→submitted→reviewed→archived`, bez NPS).
- `20260606000004_phase33d_client_movements` — `client_entries` (archiwum Wejść 2024) + `client_departures` (Zejścia, historyczne + go-forward).

Storage: reuse bucketa `lifecycle-docs` (prefiksy `contractor-onboarding/`, `contractor-exit/`) — istniejące polityki już dają `has_lifecycle_access()` pełny dostęp.

## Pliki kodu

- Typy + mapy: `lib/types/contractor.ts` (+ 37 testów `lib/types/__tests__/contractor.test.ts`).
- Parsery: `lib/contractors/parse.ts` (3 formaty Excela, break po pustych wierszach).
- Akcje: `lib/actions/contractors.ts` (CRUD/log/wywiady/zejścia/dashboard) + `lib/actions/contractor-import.ts` (3 importery preview/commit).
- UI: `app/(protected)/internal/kontraktorzy/{layout,page,[id]/page}.tsx` + `components/internal/kontraktorzy/*` (Hub, Dialog kontraktora, Dialog rozmowy, ImportDialog, InterviewForm, DetailClient).
- Cron: `app/api/cron/contractor-followup-reminder/route.ts`.
- Sidebar: `components/layout/Sidebar.tsx` (grupa „Kontraktorzy", TCM+admin).
- `AuditAction` += 14 akcji; `lib/supabase/database.types.ts` zsynchronizowany ręcznie (6 tabel + 7 kolumn placements — generator odtworzy 1:1 przy `npm run db:types` z tokenem).

## Weryfikacja

- `tsc --noEmit` ✓ · `eslint` ✓ (0 błędów) · `next build` ✓ · `vitest` 858/858 ✓.
- Parsery na realnych plikach: **Rozmowy 147 / Wejścia 273 / Zejścia 332** wierszy (błędów: 0/0/2).
- `get_advisors(security)` — brak nowych krytycznych/`rls_enabled_no_policy` lintów (jedyny nowy WARN: `function_search_path_mutable` na triggerze — spójny z wszystkimi istniejącymi `enforce_*`).

## Ops po deploy

1. **Coolify cron** (panel `coolify-compass.dynaminds.pl` → compass → Schedules):

   | Nazwa | Schedule | Komenda |
   |---|---|---|
   | `contractor-followup-reminder` | `0 8 * * *` | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://compass.dynaminds.pl/api/cron/contractor-followup-reminder"` |

2. **Import historii 2024** (jako admin/TCM): `/internal/kontraktorzy` → zakładka „Import" → wgraj 3 pliki (Rozmowy, Wejścia, Zejścia). Idempotentne.
3. **Rola TCM**: Błażej/Paula mają `talent_community` (2 profile potwierdzone w prod).

## Znane ograniczenia / out of scope

- **Status rozmów z importu** = `rozwiazane` (fallback) — kolory w Excelu pochodzą z conditional-formatting/theme, nieczytelne przez `cell.fill.fgColor.argb`. Go-forward status ustawiany ręcznie w UI.
- **Dedup kontraktora po znormalizowanym nazwisku** — imiennicy się scalają (rzadkie); ręczny split poza zakresem.
- Załączniki wywiadów: inline JSONB (`attachments`) — upload przez storage planowany jako follow-up jeśli potrzebny.
- Bez AI-klasyfikacji „Sprawa", bez broadcast emaili, bez portalu logowania kontraktora.
