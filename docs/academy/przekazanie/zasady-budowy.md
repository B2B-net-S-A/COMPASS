# Zasady budowy Akademii COMPASS (obowiązują każdy tor)

Właściciel zdecydował 2026-11-09: budujemy cały gotowy system szkoleń, a dopiero potem używanie, testy i zapraszanie. Zadania ruszają bez jego akceptacji.

Źródła:
- Plan: `docs/academy/plan-budowy-2026-11.md` w Twoim worktree (zadania B0.x–B5.x z kotwicami, warunkami końca i scenariuszami G01–G57). Treść zadania z planu jest wiążąca.
- Makiety HTML, pole `html` po `id`: `docs/academy/przekazanie/akademia-roadmapa.html` (nowsze: `created`, `fixed`) oraz ta sama strona. Odwzorowuj układ i etykiety, w Tailwind i komponentach repo.
- Korekty audytu: sekcja „Stan dziś” na tej stronie. Tam, gdzie weryfikator koryguje audytora, obowiązuje weryfikator.

Twarde reguły:
1. Nic nie wychodzi na zewnątrz: zero maili, zaproszeń, linków do ludzi. Produkcja zostaje w rollout `closed`. Funkcje wysyłki przez kolejkę wstrzymanych wiadomości i przełączniki domyślnie wyłączone.
2. Produkcja tylko do odczytu i tylko agregaty (bez nazwisk i adresów). Nie twórz kont, nie zmieniaj danych, env w Coolify, uprawnień Graph ani rolloutu. Nie wysyłaj żadnej wiadomości. Nie loguj się do produkcji cudzymi poświadczeniami.
3. Migracje wyłącznie jako pliki w `COMPASS/supabase/migrations/`. Nie aplikuj ich, nigdy `supabase db push`. Każda kończy się blokiem `DO $$` z `RAISE EXCEPTION`, jest zweryfikowana na lokalnym `postgres:17` (Docker dozwolony) i dopisana w kolejności do `docs/academy/migracje-do-zastosowania.md`.
4. Każdy merge do main jedzie na produkcję, a migrację właściciel stosuje później. Kod musi działać przy braku nowych obiektów bazy (42703/42P01 daje komunikat, nie awarię) i nie może zmieniać zachowania reszty aplikacji.
5. Przestrzegaj CLAUDE.md repo: `runAction`/`ExpectedError`, guardy w pierwszej linii, `requireRows`/`selectInChunks`, logger zamiast console, brak `git stash` w tym repo. Worktree nie ma node_modules: symlinkuj z `/Users/arturtwardowski/COMPASS/COMPASS/node_modules`.
6. Testy: najpierw przypadki brzegowe i ścieżka odmowy. Przed PR: `npx tsc --noEmit` i `npx vitest run` na zmienionych plikach. UI: przeklikaj lokalnie w trybie bez backendu (Playwright, zrzut; nie buduj przy działającym dev).
7. Jeden PR na jedno zadanie planu, jeden otwarty naraz, gałąź od świeżego `origin/main`, repo `B2B-net-S-A/COMPASS`. Commit `<typ>: <opis>` po polsku, stopka `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Opis PR kończ linią `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Po otwarciu `gh pr merge <nr> --squash --auto`. Czerwone CI napraw u przyczyny. Nigdy `--admin` ani force-push na main.
8. Inne tory pracują równolegle. Trzymaj się swoich plików, przy konflikcie zrób rebase na `origin/main`, a zadanie zależne od cudzej pracy wykonaj dopiero, gdy jest na main; do tego czasu rób to, co niezależne.
9. Czego nie da się domknąć bez człowieka (próby na produkcji, scenariusze przez SSO, zastosowanie migracji), dopisz do `docs/academy/czeka-na-wlasciciela.md` i idź dalej. Otwarte decyzje przyjmuj według rekomendacji z planu.

Raport końcowy: tabela część · stan · dowód (nr PR, wynik komendy) oraz lista tego, co nie zostało zrobione i dlaczego. Bez ogólników.

Zmiana reguł 3 i 9 (dla uniknięcia konfliktów między torami): nie dopisuj nic do wspólnych plików `docs/academy/migracje-do-zastosowania.md` ani `docs/academy/czeka-na-wlasciciela.md`. Każdy PR dodaje własny plik `docs/academy/czeka/<id-zadania>.md` (np. `B2.1.md`), a w nim sekcje „Migracje do zastosowania” (nazwa pliku i warunek) oraz „Czeka na właściciela”. Scala je potem koordynator. `gh` z błędem 401: użyj `env -u GH_TOKEN gh ...`.
