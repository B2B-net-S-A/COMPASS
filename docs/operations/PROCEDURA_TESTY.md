# Procedura: testy i push do GitHub

## Szybko (jedna komenda – synchronizacja z GitHub)

Z katalogu projektu:

```bash
npm run sync
```

Albo bezpośrednio:

```bash
./scripts/git-sync-push.sh
```

Skrypt:
- **Nie używa rebase ani vim** – unikasz zawieszania się w edytorze.
- Robi **pull** (merge) i **push** na `main`.
- Jeśli masz niezapisane zmiany, zapyta, czy je schować (stash) przed pull.

---

## Ręcznie (testy + lint + push)

### 1. Testy e2e
```bash
npm run test
```
(Powinny przejść 3 testy Playwright.)

### 2. Lint
```bash
npm run lint
```
(Kod wyjścia 0 = OK.)

### 3. Push do GitHub
```bash
git push origin main
```
- **Username:** np. `biurko2015-eng`
- **Password:** **Personal Access Token** (nie hasło).  
  Token: GitHub → Settings → Developer settings → Personal access tokens → Generate new token (classic), zakres **repo**.

---

## Żeby Git nigdy nie otwierał vima

W pliku **`~/.zshrc`** (lub `~/.bash_profile`) dodaj linię:

```bash
export GIT_EDITOR=true
```

Potem w terminalu: `source ~/.zshrc` (lub otwórz nowy terminal). Dzięki temu przy `git rebase --continue` / `git merge` itp. nie otworzy się vim.

---

## Skrypty debug (opcjonalnie)

Z katalogu projektu, z uzupełnionym `.env.local`:

- `node scripts/debug/test_login.js`
- `node scripts/debug/check_db.js`
- `npx tsx scripts/debug/test-db.ts`
- `npx tsx scripts/debug/test-actions.ts`
