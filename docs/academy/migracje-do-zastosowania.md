# Migracje Akademii do zastosowania przez właściciela

Pliki w `COMPASS/supabase/migrations/`. Stosować po kolei, w tej kolejności, przez MCP `apply_migration`
(nigdy `supabase db push`). Każdy plik kończy się samosprawdzeniem `DO $$`, cofnięcie opisuje jego nagłówek.
Kod jest już na produkcji i działa bez nich: nowe akcje odpowiadają „czeka na migrację”.

| Kolejność | Plik | Zadanie | Co zmienia | Sprawdzone lokalnie |
|---|---|---|---|---|
| 1 | `20261109130000_academy_review_signal.sql` | B0.8 | Dzwonek przy zgłoszeniu, decyzji i wycofaniu; RPC `academy_withdraw_submission`; historia pokazuje wycofanie | postgres:17, `supabase/tests/academy_review_signal_smoke.sql` |
