# Archived SQL scripts

Te pliki nie są aktywnymi migracjami Supabase — to legacy debug/repair
scripts ze starszego okresu projektu (przed Phase 4-5). Trzymane w repo
żeby zachować historię, ale nie powinny być uruchamiane na prod.

## Pliki

- **`EMERGENCY_DELETE.sql`** — twarde czyszczenie danych testowych (zaaplikowane manualnie kiedyś przy resecie środowiska)
- **`SAFE_EMERGENCY_DELETE.sql`** — safer variant z `WHERE` clauses
- **`SAFE_REPAIR.sql`** — repair script po incydencie
- **`FIX_REGISTRATION.sql`** — fix flow rejestracji userów (zaaplikowane via SQL editor)
- **`FIX_AND_ENABLE_SYNC.sql`** — fix trigger sync user → profile
- **`DISABLE_SYNC.sql`** — odwrotność powyższego (debug)

## Dlaczego nie w `migrations/`

`supabase/migrations/` jest source-of-truth dla migration tooling — pliki
tam muszą mieć format `YYYYMMDDHHMMSS_descriptive_name.sql` i być
deterministically applicable w kolejności. Te scripty były wywołane
ad-hoc przez SQL editor i mieszanie ich z prawdziwymi migracjami
powodowało confusion (właściciel nie wiedział co jest applied, co nie).

## Co dalej

Jeśli któryś z tych scriptów jest jeszcze relevant — przepisz go jako
prawidłową migrację z timestamp. Jeśli nie — możemy je usunąć w przyszłości.
