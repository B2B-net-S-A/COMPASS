# Akademia COMPASS: przekazanie pracy

Stan na 2026-11-09, wieczór (Warszawa), po domknięciu braków z pierwszego przekazania. Kolejna sesja Claude'a zaczyna od tego pliku.

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

### Domknięte po pierwszym przekazaniu (2026-11-09 wieczorem)

| Część | PR | Uwaga |
|---|---|---|
| B1.7 link ponownego wejścia wychodzi regułą automatyczną bramki (decyzja właściciela) | #519 | Tylko `academy.reentry`, tylko przy `ACADEMY_MAIL_ENABLED` i `ACADEMY_PASS_ENABLED`; wysyłka po odpowiedzi, żeby czas nie zdradzał konta |
| B0.3 `course-inactivity` stronicuje po kluczu | #520 | Najwyżej 500 nowych `held` na przebieg, kolejne w następnym |
| B4.3 ręczne zaliczenie nagrania przez RPC zablokowane, postęp w eksporcie RODO | #521 | Migracja `20261110170000` |
| B4.7 temat i program w edytorze kursu | #522 | Bez migracji; zakładanie programów ręcznie nie istnieje |
| B4.8 raport programu na ekranie kompetencji, data szkolenia w banerze M09 | #523 | Migracja `20261110164500` |
| Rejestr migracji (B3.10, B4.3, B4.8) i lista właściciela scalone, `docs/academy/czeka/` pusty | ten PR | |
| 4 testy bazy poza `test:academy-db` | — | Celowo: biegną jako osobne kroki w `build-check.yml` (job `academy-postgres`) |

## Co zostało do zrobienia

### Kod

- B4.9: import nagrań nie jest podpięty do workera, czeka na decyzję o uprawnieniu Graph (decyzja otwarta z 15.01.2027).
- Drobne: `academy_save_video_progress` (`20261109213000`) rzutuje `video_watch_percent` na `integer`, więc ułamkowy próg wpisany wprost w bazę (np. 89.5) wywróciłby zapis postępu. Formularz i schemat przyjmują tylko liczby całkowite, więc z aplikacji to nie wystąpi.
- `sendApprovedAcademyBatch` nadal nie ma wywołującego w interfejsie: zatwierdzanie i wysyłka paczek czeka na decyzję o `ACADEMY_MAIL_ENABLED` na bramce startu.
- Zbędne gałęzie usunięte z origin 2026-11-09 (decyzja właściciela). Odtworzenie: `git push origin <sha>:refs/heads/<nazwa>`. `wip/b2-next` 9a71985e, `feat/academy-b2-2-attempt-session` 641d8e62, `feat/academy-b2-3-question-void` 859cb5bc, `feat/academy-b2-4-mobile-form` 0461f2d0, `feat/academy-b4-3-postep` b05d8b8c, `feat/academy-b4-4-rozdzialy` 8408326a, `feat/academy-b4-5-dlugie-pliki` d49e07aa, `feat/academy-b5-5-kokpit` 527d3c50.

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
