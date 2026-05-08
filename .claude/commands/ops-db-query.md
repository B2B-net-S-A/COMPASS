---
description: Query compass database (read-only)
argument-hint: <SQL or natural-language query>
---

Query bazy **compass**.

**Database access:**

Use mcp__supabase MCP server (project Compass). Tools execute_sql, list_tables, apply_migration. Free-tier RLS enforces row-level security.

**User query:** `$ARGUMENTS`

**Workflow:**

1. Jeśli `$ARGUMENTS` to czyste SQL → execute directly via MCP.
2. Jeśli `$ARGUMENTS` to natural language ("ile mam aktywnych kandydatów") → translate na SQL pierwsze, pokaż userowi, potem execute.
3. ZAWSZE pokaż SQL przed wykonaniem.
4. Limit results do 50 rows domyślnie (`LIMIT 50`); jeśli user explicite chce więcej — większy.

**Bezpieczeństwo:**
- Read-only access wymuszone na poziomie role (NEXUS: `claude_ro`) lub MCP/RLS (Compass/Atlas: Supabase).
- INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER → odmów wykonania, powiedz userowi że to read-only endpoint.
- Schema introspection (SELECT z information_schema, pg_catalog) → OK.

**Common patterns dla compass:**
- Recent records: `WHERE created_at > NOW() - INTERVAL '7 days'`
- Counts by category: `SELECT status, COUNT(*) FROM <table> GROUP BY status`
- Top N: `ORDER BY <col> DESC LIMIT 10`

**Po query:** render results jako tabela markdown jeśli ≤20 wierszy, inaczej summary (counts + sample 5 wierszy).
