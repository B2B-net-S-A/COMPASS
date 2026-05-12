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

## Stan po Phase 18 (2026-05-12)

- **55 migracji** w prod (zobacz output `list_migrations`)
- **~140 plików** w `supabase/migrations/` — rozjazd: część plików w repo
  nigdy nie była aplikowana (była wywołana ad-hoc przez SQL editor), część
  jest aplikowana ale pod inną nazwą (Supabase wzbogaca nazwę migracji
  o timestamp przy push)
- TODO: audyt repo↔prod sync — wytrzeć dead migracje lub przepisać do
  prawidłowego formatu

## Workflow

```bash
# Nowa zmiana schematu:
TIMESTAMP=$(date -u +%Y%m%d%H%M%S)
touch supabase/migrations/${TIMESTAMP}_<feature>_<verb>.sql

# Pisz idempotent SQL...

# Apply do prod via MCP:
# mcp__supabase__apply_migration(name, query)

# Aktualizuj DB types:
npm run db:types

# Verify advisors (po RLS / SECURITY changes):
# mcp__supabase__get_advisors(type='security')
```

## See also

- `supabase/_archive_scripts/README.md` — legacy ad-hoc scripts (nie aplikować)
- `~/.claude/rules/deployment.md` — global deployment standard
- `CLAUDE.md` (Compass-specific) — per-app deviations
