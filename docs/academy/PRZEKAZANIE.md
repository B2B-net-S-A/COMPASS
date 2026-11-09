# Akademia COMPASS: przekazanie pracy

Stan na 2026-11-09, około 15:00 (Warszawa). Kolejna sesja Claude'a zaczyna od tego pliku.

## Cel i decyzje właściciela

Właściciel zdecydował, że najpierw powstaje cały gotowy system szkoleń, a dopiero potem używanie, testy i zapraszanie. Zadania ruszają bez jego akceptacji.

- Nic nie wychodzi na zewnątrz: zero maili, linków i zaproszeń do ludzi. Produkcja zostaje w rollout `closed`, a tryb `open` blokuje migracja B0.4.
- Certyfikat to obecność plus zdany test. Sama obecność daje zaświadczenie udziału.
- Fakty o szkoleniach z 07.10 i 27.10 oraz nagraniach właściciel ustala sam.
- Otwarcie platformy to osobna, przyszła decyzja właściciela. Lista warunków jest w planie, w sekcji „Bramka startu”.

## Gdzie co jest

| Co | Gdzie |
|---|---|
| Plan etapów B0–B5, scenariusze G01–G57, bramka startu | `docs/academy/plan-budowy-2026-11.md` |
| Kolejka migracji i warunki | `docs/academy/migracje-do-zastosowania.md` |
| Zadania dla człowieka | `docs/academy/czeka-na-wlasciciela.md` |
| Audyt, roadmapa i 18 makiet (otwórz w przeglądarce) | `docs/academy/przekazanie/akademia-roadmapa.html` |
| Zasady budowy dla agentów | `docs/academy/przekazanie/zasady-budowy.md` |
| Szeregowa kolejka scalania i ponawianie błędu 504 | `docs/academy/przekazanie/kolejka-merge.py`, `ponow-504.sh` |
| Spis kanałów wyjścia | `docs/academy/kanaly-wyjscia.md` |

Artefakt z roadmapą (`claude.ai/artifact/MBMpkD62zST4ge7rUmqszt`) jest prywatny na koncie właściciela. Plik HTML w repo to jego kopia, więc inne konto go nie potrzebuje.

## Stan produkcji, odczyt z 2026-11-09

- `/api/health`: healthy, SHA `607ceab`.
- Rollout: `closed`. Opublikowane kursy: 0. Konta spoza domeny firmy: 0.
- **Zastosowanych migracji z tej budowy: 0.** Cały nowy kod działa przy braku obiektów bazy i pokazuje komunikat, że czeka na migrację.
- **Poprawka bezpieczeństwa z #454 nie działa, dopóki jej migracja nie zostanie zastosowana.** Odczyt: `disable_signup=false` i otwarta polityka SELECT na `profiles`. Pierwszy krok to migracja `20261109120000_auth_signup_gate_profiles_rls.sql` albo doraźne wyłączenie rejestracji w panelu Supabase.

## Stan kodu

Zadania B0–B5 są na `main`, z wyjątkiem pracy w toku poniżej. Scalone PR-y to m.in. #454–#516 (zakres Akademii). Szczegóły zadań: plan oraz `git log`.

### W toku w chwili przekazania

1. **#516** (B1.10 jako warunek bramki startu, zamknięcie `loyalty_rules`): auto-merge włączony, CI w toku. Gałąź `fix/akademia-b1-10-izolacja-danych`. Czerwone Gitleaks lub `Supabase academy-fixture` to zwykle błąd 504 przy pobieraniu narzędzia, patrz niżej.
2. **Tabela migracji jest niepełna.** `migracje-do-zastosowania.md` ma 34 wiersze, a plików z prefiksem `20261109` i `20261110` jest więcej (m.in. z #511–#516 i `20261110150000_academy_b3_10_tcm_review.sql`). Po scaleniu #516 trzeba dopisać brakujące wiersze w kolejności prefiksów, a `migration-contract.test.ts` to sprawdzi. Pozostałe `docs/academy/czeka/*.md` przenieść do `czeka-na-wlasciciela.md`.

## Co zostało do zrobienia

### Kod, niewielkie braki zgłoszone przez tory

- B4.8: `academy_programme_completions()` nie jest podpięta do ekranu raportów; baner M09 nie podaje daty szkolenia na żywo.
- B4.7: temat i program kursu da się ustawić tylko przez RPC, bez interfejsu.
- B4.3: ręczne `academy_mark_lesson_complete` nadal można wywołać RPC; przycisk znika tylko w UI.
- B4.3: `academy_video_progress` dopisać do eksportu RODO po zastosowaniu migracji.
- B4.9: import nagrań nie jest podpięty do workera, czeka na decyzję o uprawnieniu Graph.
- B0.3: cron `course-inactivity` przy ponad 500 kwalifikujących się zapisach kręci się po tych samych 500; poprawić przed wysyłką na większą skalę.
- B1.7: mail ponownego wejścia zostaje w `held` bez `batch_id`, a `sendApprovedAcademyBatch` nie jest nigdzie wołana. Rozstrzygnąć przed włączeniem przepustki.
- 4 starsze testy bazy są poza `test:academy-db`: `enrollments-pagination`, `m365-identities-pagination`, `my-run-overview`, `tcm-editor`. Sprawdzić, czy to celowe.
- Na zdalnym repo zostały zbędne gałęzie, m.in. `wip/b2-next`, `feat/academy-b2-2-attempt-session`, `feat/academy-b2-3-question-void`, `feat/academy-b2-4-mobile-form`, `feat/academy-b4-3-postep`, `feat/academy-b4-4-rozdzialy`, `feat/academy-b4-5-dlugie-pliki`, `feat/academy-b5-5-kokpit`.

### Właściciel

1. Zastosować migracje w kolejności z tabeli, wyłącznie przez MCP `apply_migration`. Nigdy `supabase db push`. Baza produkcyjna jest dla sesji Claude'a tylko do odczytu, dopóki właściciel nie powie inaczej.
2. Ustawić `ACADEMY_PASS_SECRET` i `ACADEMY_READINESS_SECRET` (Coolify i sekrety GitHuba). Pełna lista: `czeka-na-wlasciciela.md`. Przełączniki `ACADEMY_*_ENABLED` zostają wyłączone do bramki startu.
3. Scenariusze przez SSO i na prawdziwych skrzynkach właściciela: 57 scenariuszy, dziś 0 wykonanych na produkcji.
4. Decyzje otwarte: koniec `plan-budowy-2026-11.md`. Do odpowiedzi obowiązuje rekomendacja.

### Weryfikacja przed uznaniem budowy za skończoną

- Po zastosowaniu migracji: `/api/health` zwraca SHA z maina, a test dostępu konta bez roli biurowej (B1.10) daje oczekiwany wynik.
- Ekrany przeklikano tylko lokalnie, w trybie bez backendu. Prawdziwe przejście przez SSO nie było wykonane.
- Normalizator wideo przeszedł tylko materiały syntetyczne, prawdziwe nagranie Teams nie.
- Ostatni przegląd bezpieczeństwa (B5.10) nie znalazł problemów blokujących merge. Nie obejmował pełnego odtworzenia migracji na produkcyjnym schemacie.

## Jak tu pracować, żeby nie stracić czasu

- `gh` czasem zwraca 401: użyj `env -u GH_TOKEN gh ...`.
- `main` wymaga aktualnej gałęzi, a CI trwa około 7 minut. Przy wielu PR-ach aktualizuj tylko jeden naraz: `python3 docs/academy/przekazanie/kolejka-merge.py <PR-cel> <priorytety...>`. Agenci nie powinni sami robić `update-branch`.
- Czerwone `Gitleaks` i `Supabase academy-fixture` z `curl: (22) ... 504` to infrastruktura: `bash docs/academy/przekazanie/ponow-504.sh <nr PR>`.
- Konflikty powtarzają się w linii `test:academy-db` w `COMPASS/package.json` i w `lib/gdpr/subject-data.ts`. Nowe wpisy dla właściciela dawaj do `docs/academy/czeka/<zadanie>.md`, a potem scalaj je do jednej listy.
- Worktree nie ma `node_modules`: symlinkuj z `/Users/arturtwardowski/COMPASS/COMPASS/node_modules`. Lokalny brak `@pdf-lib/fontkit` to znany, jedyny błąd `tsc`; testy PDF przechodzą w CI.
- Test `switches.test.ts` wymaga, żeby każdy przełącznik szedł przez `isAcademySwitchOn` z `lib/academy/switches.ts`. Nie luzuj go.
- Test `academy-only-isolation.test.ts` klasyfikuje każdą akcję i trasę; nowa akcja lub trasa bez odmowy dla konta nauki przerwie CI.
- Migracje zawsze jako pliki z blokiem `DO $$ ... RAISE EXCEPTION`, weryfikowane na lokalnym `postgres:17`.
- Zatwierdzanie: autor ani współtwórca nie zatwierdza własnego kursu, także jako TCM.
