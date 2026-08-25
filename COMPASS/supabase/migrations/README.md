# Supabase migracje — Compass

## Konwencje

### Naming

```
YYYYMMDDHHMMSS_<feature>_<verb>.sql
```

- Timestamp jest required (Supabase CLI sortuje po nim)
- `<feature>` — domena: `phase17_work_clock`, `loyalty`, `support_center`
- `<verb>` — co migracja robi: `schema`, `add_column`, `enable_rls`, `hardening`

**NIE używać prefixów:**
- ❌ `fix_*` — fix to nadal "zmiana schematu", nie wyróżnia się
- ❌ `*_v2`, `*_v3` — wersjonowanie sugeruje że poprzednia migracja była błędna; lepiej napisać NOWĄ migrację która odwołuje poprzednią
- ❌ `hotfix_*`, `emergency_*` — to są scripty (zobacz `supabase/_archive_scripts/`), nie migracje

### Idempotency

Wszystkie migracje muszą być idempotent:

```sql
-- ✅ DOBRZE
CREATE TABLE IF NOT EXISTS foo (...);
ALTER TABLE foo ADD COLUMN IF NOT EXISTS bar TEXT;
DROP POLICY IF EXISTS foo_select ON foo;
CREATE POLICY foo_select ON foo FOR SELECT USING (auth.uid() = owner_id);
CREATE OR REPLACE FUNCTION foo() RETURNS ...;

-- ❌ ŹLE
CREATE TABLE foo (...);
ALTER TABLE foo ADD COLUMN bar TEXT;
```

Idempotency pozwala bezpiecznie reuruchomić migrację gdyby coś się nie
udało w połowie (Coolify rebuild, manual ALTER w SQL editor itp.).

### Transakcyjność

Owijaj w `BEGIN; ... COMMIT;` gdy migracja modyfikuje wiele tabel lub
zawiera DML (INSERT). DDL (CREATE/ALTER) w Postgres jest sam w sobie
transakcyjny per-statement.

### SECURITY DEFINER

Każda funkcja `SECURITY DEFINER` MUSI mieć `SET search_path`:

```sql
CREATE OR REPLACE FUNCTION my_func()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog  -- WYMAGANE
AS $$ ... $$;
```

Bez tego linter Supabase flaguje (search-path hijack risk). Patrz
`20260512000001_phase18_security_hardening.sql` jako wzorzec.

### RLS

Każda nowa publiczna tabela musi mieć:

1. `ALTER TABLE foo ENABLE ROW LEVEL SECURITY;`
2. Min. 1 policy (nawet `FOR SELECT USING (false)` jeśli access tylko
   przez service_role — w tym przypadku zostaw bez policy i udokumentuj w
   `COMMENT ON TABLE`)
3. NIE `USING (true)` na tabeli z wrażliwymi danymi — to anti-pattern
   (każdy zalogowany czyta wszystko). Jeśli faktycznie chcesz public read,
   ogranicz przez kolumnę (`published_at IS NOT NULL`, `is_public = true`).

### Stan prod

W każdej chwili możesz sprawdzić co jest aplikowane w prod:

```bash
# Z Claude Code MCP:
mcp__supabase__list_migrations(project_id=shduiynzemftkqqefscd)

# Lub przez Supabase CLI (po linkowaniu):
supabase migration list
```

## Reconciliation P1 (2026-07-13)

- Repo zawiera **180 aktywnych migracji bazowych** z unikalną, 14-cyfrową
  wersją oraz trzy udokumentowane tombstony `.sql.disabled`.
- Pełny fresh replay i pgTAP przechodzą lokalnie.
- Stan ledgeru produkcji nadal wymaga read-only preflightu i świadomego
  `migration repair`. Samo `db push --include-all` jest zabronione.
- Mapowanie starych i nowych wersji oraz procedura produkcyjna:
  `docs/database/migration-reconciliation-runbook.md`.
- Checker blokuje brakujące wiersze mapowania przez porównanie z zablokowanym
  commitem bazowym `0c3f266530dc0cd1653c0d555645468935469a49`, a także
  identity-specific DML, seedy haseł i wykonywalny SQL w tombstonach.

## Workflow

```bash
# Nowa zmiana schematu (CLI tworzy poprawną wersję):
npx --yes supabase@2.109.1 migration new <feature>_<verb>

# Pisz idempotent SQL...

# Lokalna weryfikacja historii + fresh replay:
npm run db:migrations:check
npx --yes supabase@2.109.1 db reset --local --no-seed
npx --yes supabase@2.109.1 test db --local supabase/tests

# Aktualizuj DB types:
npm run db:types

# Verify lint/advisors po RLS / SECURITY changes.
```

## See also

- `supabase/_archive_scripts/README.md` — legacy ad-hoc scripts (nie aplikować)
- `~/.claude/rules/deployment.md` — global deployment standard
- `CLAUDE.md` (Compass-specific) — per-app deviations
