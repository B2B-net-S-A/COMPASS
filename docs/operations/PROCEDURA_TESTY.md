# Procedura: testy i wysyłka zmian

> Zaktualizowane w audycie 2026-08-25. Poprzednia wersja opisywała workflow sprzed wprowadzenia
> ochrony gałęzi: kazała pushować bezpośrednio na `main` skryptem `npm run sync` (skrypt o tej
> nazwie nigdy nie istniał) i zachwalała `git stash`. Obie rzeczy dziś szkodzą — szczegóły niżej.

Wszystkie komendy `npm` odpalaj z katalogu **`COMPASS/`** (aplikacja jest w podkatalogu; w root
repo nie ma `package.json`).

## 1. Baseline przed zmianą i po zmianie

```bash
cd COMPASS
npx tsc --noEmit     # musi być czysto
npm run test:unit    # Vitest — musi być zielone
npm run lint         # next lint, kod wyjścia 0
```

⚠ `npm test` odpala **Vitest ORAZ Playwrighta** — do szybkiej pętli używaj `test:unit`.
Build (`next build`) **nie sprawdza typów** (`typescript.ignoreBuildErrors` w `next.config.mjs`),
więc „przecież się zbudowało" nic nie dowodzi. Jedyną bramką jest CI.

## 2. Testy E2E (Playwright)

```bash
cd COMPASS
npm run test:e2e                      # cały zestaw
npm run test:smoke                    # sam e2e/01-smoke.spec.ts
```

Stan na 2026-08-25: **8 plików `.spec.ts` w `COMPASS/e2e/`, ~41 testów** (`ls COMPASS/e2e` daje
aktualną listę — nie utrzymuję jej kopii tutaj). E2E ma osobny workflow w CI
(`.github/workflows/e2e-tests.yml`), nie jedzie w zwykłej bramce PR-a.

## 3. Wysyłka zmian — przez PR, nigdy prosto na `main`

Gałąź `main` ma włączoną ochronę z `enforce_admins=true`: **bezpośredni push jest odrzucany**,
także z konta właściciela. Ścieżka jest jedna:

```bash
git checkout -b fix/krotki-opis
git add -A && git commit -m "fix: ..."
git push -u origin fix/krotki-opis
gh pr create --fill
# po zielonym CI:
gh pr merge --squash --delete-branch
```

Merge do `main` = deploy na produkcję (46 użytkowników, brak stagingu). Po deployu sprawdź,
że dojechał:

```bash
SHORT_SHA=$(git rev-parse --short=7 HEAD)
curl -fsSL -A "dynaminds-smoke-test/1.0" https://compass.dynaminds.pl/api/health \
  | jq -e ".status != \"unhealthy\" and (.version | startswith(\"$SHORT_SHA\"))"
```

Nagłówek `-A "dynaminds-smoke-test..."` jest obowiązkowy — bez niego reguła Cloudflare
`cf.threat_score gt 30` zwraca 403.

## Czego NIE robić

- ❌ **`git push origin main`** i `scripts/git-sync-push.sh` — skrypt pcha wprost na `main`,
  co ochrona gałęzi i tak odrzuci. Zostaje w repo jako relikt; nie używaj go.
- ❌ **`git stash`** — w tym repo leży stash z innej gałęzi i `pop` zanieczyszcza drzewo
  (ta sama zasada jest w `CLAUDE.md`). `git-sync-push.sh` proponuje stash — kolejny powód, żeby
  go nie odpalać.
- ❌ **`npm run sync`** — takiego skryptu nie ma w `COMPASS/package.json` i nigdy nie było.
- ❌ **`supabase db push`** — rejestr migracji na produkcji i katalog `supabase/migrations/`
  są rozjechane; SQL wjeżdża wyłącznie przez MCP `apply_migration`.
- ❌ **`--no-verify`** przy commicie.

## Skrypty pomocnicze, które faktycznie istnieją

`COMPASS/scripts/`: `git-ship.sh` (`npm run ship`), `eval_matching.ts` (`npm run test:eval`),
`check_schema.js`, `check_file.js`, `add-block.sh`.
Root repo `scripts/`: `merge-train.sh`, `push-to-github.sh`, `git-sync-push.sh` (patrz wyżej).

Katalog `scripts/debug/` z poprzedniej wersji tego dokumentu **nie istnieje** —
`test_login.js`, `check_db.js`, `test-db.ts`, `test-actions.ts` zostały usunięte.
