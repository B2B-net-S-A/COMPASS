-- ============================================================
-- Inbox ingest — znacznik startu przebiegu (blokada nakładania)
-- Date: 2026-07-27
--
-- Depends on:
--   - 20260519000001_phase26b_inbox_email_ingest.sql (inbox_sync_state)
--
-- Kontekst:
--   Po naprawie harmonogramu Coolify (2026-07-27) ingest ruszył pierwszy raz od
--   maja i zaczął nadrabiać zaległość. Wyszło wtedy, że przebiegi na siebie
--   nachodzą: zadanie chodzi co 5 minut, a pojedynczy przebieg (50 wiadomości
--   z załącznikami) trwa do `maxDuration` = 4 minuty. Kolejny tik startował,
--   zanim poprzedni zapisał kursor, czytał więc STARY kursor i pobierał te same
--   50 wiadomości po raz drugi.
--
--   Widać to było w danych jak na dłoni: 11:55 → 50 utworzonych, 12:00 → zero
--   (50 duplikatów), 12:05 → 47 utworzonych. Co drugi przebieg marnował cztery
--   minuty i 50 zapytań do Graph, a `last_error` pokazywał 50 błędów przy
--   całkowicie zdrowym imporcie.
--
-- Adds:
--   - inbox_sync_state.run_started_at — kiedy bieżący przebieg wystartował.
--     Ustawiane PRZED pracą (last_run_at nadal po), więc różnica między nimi
--     mówi „trwa" kontra „skończony".
--
-- Blokada jest miękka i wygasa sama: jeśli przebieg zginie bez zapisu (timeout
-- runtime, restart kontenera), znacznik po prostu się zestarzeje i kolejny tik
-- ruszy normalnie. Świadomie bez advisory locka — ingest jest jednym zadaniem
-- na jedną skrzynkę, nie potrzebuje niczego mocniejszego, a lock w bazie
-- przeżywający crash aplikacji byłby gorszy od problemu, który rozwiązuje.
-- ============================================================

BEGIN;

ALTER TABLE inbox_sync_state
    ADD COLUMN IF NOT EXISTS run_started_at TIMESTAMPTZ;

COMMENT ON COLUMN inbox_sync_state.run_started_at IS
    'Kiedy wystartował bieżący przebieg ingestu. Ustawiane przed pracą; last_run_at dopiero po jej zakończeniu. run_started_at nowszy od last_run_at i świeższy niż okno przeterminowania = przebieg trwa, kolejny tik odpuszcza (przebiegi nachodziły na siebie i importowały te same wiadomości dwa razy). Znacznik wygasa sam, więc zabity przebieg nie blokuje importu na stałe.';

COMMIT;
