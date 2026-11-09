# Akademia: migracje do zastosowania przez właściciela

Pliki leżą w `COMPASS/supabase/migrations/`. Stosuje je wyłącznie właściciel, przez MCP
`apply_migration`, po jednej i w kolejności z tej listy. Nigdy `supabase db push`.
Kod jest scalony wcześniej i działa bez tych obiektów.

| Kolejność | Plik | Zadanie | Warunek | Cofnięcie | Sprawdzenie |
|---|---|---|---|---|---|
| po B0.4 | `20261109210000_academy_b1_1_office_roles.sql` | B1.1: role `internal`, `manager`, `finanse` przez rollout, pilot przyjmuje konto dowolnej roli | Po B0.4 (blokada trybu open, limit 20). Migracja łata w `academy_set_rollout` tylko warunek roli, więc zachowuje zmiany B0.4. | `COMPASS/supabase/rollback/20261109210000_academy_b1_1_office_roles.down.sql` | Lokalnie: `supabase/tests/academy_b1_1_office_roles_stub.sql`, migracja, `academy_b1_1_office_roles_smoke.sql`. Na produkcji blok `DO $$` na końcu pliku. |
