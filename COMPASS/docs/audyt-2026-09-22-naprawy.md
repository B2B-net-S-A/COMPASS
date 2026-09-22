# Audyt 2026-09-22 — stan napraw

Źródło: `outputs/audit-2026-09-22/RAPORT.md` (58 ustaleń + 2 w module faktur). Każde ustalenie
zweryfikowano na kodzie `cf871bb` i na zrzutach katalogu produkcji dołączonych do audytu.
Żadne nie okazało się fałszywe; ok. połowa miała zawyżony priorytet (ścieżki uśpione lub
blokowane przez UI).

## PR-y

| PR | Zakres |
|---|---|
| #388 `fix(security)` | SEC-01, SEC-03, SEC-04, SEC-05, SEC-12, HF-14, O06 + migracja `20260922180000_audit_0922_rls_hardening.sql` |
| #389 `ci` | O01 (deploy po zielonym Build check + ruleset), O02 (częściowo), O04, O05, O07 |
| #390 `fix(hr)` | HF-01, 02, 03, 05, 06, 07, 10, 11, 12, 13 (walidacja), 15, 16, 17, 18, 19, INT-11 (lifecycle) |
| #391 `fix(integracje)` | INT-02, 03, 04, 06, 07, 08, 16, 17, 18, 19, 20, 22, 23 |

## Wymaga działania człowieka

1. **Migracja** `COMPASS/supabase/migrations/20260922180000_audit_0922_rls_hardening.sql` — zaaplikować
   przez MCP `apply_migration` (wersja = prefiks pliku). Zweryfikowana lokalnie na Postgres 17
   (dwukrotne zastosowanie + smoke). Po aplikacji uruchomić `COMPASS/supabase/tests/audit_0922_rls_smoke.sql`
   — oczekiwany `NOTICE: audit_0922 smoke: OK`, kończy się ROLLBACK.
2. **Sekrety E2E** `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY` (instancja testowa, nie produkcja) —
   bez nich workflow E2E zatrzymuje się na preflighcie.
3. **Istniejące zarchiwizowane konto** (1 w agregacie audytu) — nowa blokada działa tylko dla przyszłych
   archiwizacji. Dla istniejących: Administracja użytkownikami → Zablokuj (lub ponowna archiwizacja).

## Świadomie odłożone

| ID | Powód |
|---|---|
| O02 Next 14 → 16 | osobny projekt wg `docs/next-15-16-migration-plan.md`; `npm audit fix` bez `--force` zrobiony |
| SEC-02 katalog profili | wymaga przeglądu wszystkich odczytów `profiles` klientem sesyjnym; wrażliwe pola dziś puste |
| HF-04, HF-08, HF-09 | model puli urlopowej (pół dnia, przełom roku, realokacja) — przeprojektowanie, 0 przypadków na prod |
| HF-13 historia | zachowanie historii onboardingu wymaga zmiany unikalności `onboarding_progress` |
| HF-01/HF-06 atomowość | kontrole w aplikacji; gwarancja przy równoległych żądaniach wymaga triggera |
| INT-10, 12, 13, 14, 15, 21, 24, 25 | uśpione: progi nieosiągnięte, jeden odbiorca, jednowątkowi klienci |
| O03 healthcheck | celowo luźny próg; poprawna naprawa to osobny readiness check |
| SEC-06, SEC-07 faktury | moduł wyłączony flagą; warunek konieczny przed jego włączeniem |
| SEC-08..11 Akademia | naprawione wcześniej w #384 |

## Zauważone przy okazji

- `components/admin/ProjectCard.tsx:191` — też buduje `/object/public/documents/` (jak O07).
- Kolejka błędów synchronizacji (`listLeavesWithSyncIssues`) pokazuje tylko urlopy `approved`,
  więc błędy sprzątania po anulowaniu (`graph_sync_error='cleanup: …'`) są widoczne tylko w bazie;
  ponawia je `oof-reconcile`.
