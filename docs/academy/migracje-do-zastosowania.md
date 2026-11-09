# Migracje Akademii do zastosowania

Pliki z `COMPASS/supabase/migrations/`, w kolejności stosowania, przez MCP `apply_migration` (nigdy `supabase db push`). Kod wdrożony wcześniej obsługuje brak tych obiektów komunikatem. Każdy plik kończy się samosprawdzeniem `RAISE EXCEPTION`.

| Kolejność | Plik | Zadanie | Cofnięcie |
|---|---|---|---|
| B2.1 | `20261109200100_academy_quiz_pool.sql` | Pula pytań, konfiguracja wersji, usunięcie martwych RPC | nieodwracalne, cofamy PITR |
