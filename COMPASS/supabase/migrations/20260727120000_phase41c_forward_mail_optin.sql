-- ============================================================
-- Phase 41c — Przekierowanie poczty jest opt-in i sterowalne ręcznie
-- Date: 2026-07-27
--
-- Depends on:
--   - 20260720102237_phase41_leave_forward_rule.sql (outlook_forward_rule_id)
--   - 20260518000001_phase25a_leave_substitute_and_oof.sql (substitute_id)
--
-- Kontekst — dlaczego to powstaje:
--   Phase 41 wiązała przekierowanie z samym faktem wybrania zastępcy: jest
--   zastępca → poczta idzie dalej. Dwie rzeczy to obaliły.
--
--   1. Zgoda. Zastępca czyta cudzą korespondencję — także prywatną i taką,
--      za którą nie odpowiada. To decyzja pracownika, nie efekt uboczny pola
--      "Zastępca", które istnieje od Phase 25 wyłącznie po to, by wpisać
--      nazwisko w treść Out of Office. Ta sama lekcja co przy mailach
--      lifecycle (Phase 25c): automat, którego nikt nie zamawiał, zaskakuje.
--
--   2. Okno przekierowania otwiera i zamyka cron, bo reguła Outlooka nie ma
--      warunków czasowych (patrz nagłówek migracji Phase 41). Weryfikacja
--      2026-07-27 wykazała, że crony Coolify tej instancji nie wykonują się
--      wcale — heartbeat FORWARD_RECONCILE_RUN z PR #270 nie zostawił ani
--      jednego wiersza przez pięć poranków, a inbox-ingest i tc-sync stoją
--      od maja i czerwca. Skoro automat bywa nieobecny, człowiek musi mieć
--      własny włącznik i wyłącznik — inaczej reguła albo nie powstaje, albo
--      nie znika.
--
-- Adds:
--   - leave_requests.forward_mail_enabled — czy pracownik chce przekierowania.
--     Jedno źródło prawdy dla intencji: ustawiane przy składaniu wniosku
--     (checkbox) i przełączane ręcznie w trakcie urlopu. Stan faktyczny reguły
--     w skrzynce nadal opisuje outlook_forward_rule_id — te dwie kolumny czyta
--     się razem: intencja + rzeczywistość.
--
-- Rozmyślnie DEFAULT FALSE, bez backfillu na TRUE:
--   Nikt nigdy nie wyraził zgody, więc nie zakładamy jej wstecz. W praktyce
--   przekierowanie i tak nie działało (martwy cron), więc żaden pracownik nie
--   traci funkcji, do której się przyzwyczaił. Efekt uboczny jest pożądany:
--   przy najbliższym uzgodnieniu obie żyjące reguły-sieroty (urlopy zakończone
--   21.07 i 24.07, których poczta wciąż szła do zastępców) zostaną zamknięte,
--   bo intencja = FALSE.
-- ============================================================

BEGIN;

ALTER TABLE leave_requests
    ADD COLUMN IF NOT EXISTS forward_mail_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Pass 1 uzgodnienia szuka wniosków czekających na regułę. Bez zastępcy flaga
-- nic nie znaczy, więc indeksujemy tylko wiersze, które mogą coś przekierować.
CREATE INDEX IF NOT EXISTS idx_leave_requests_forward_optin
    ON leave_requests(start_date, end_date)
    WHERE forward_mail_enabled AND substitute_id IS NOT NULL;

COMMENT ON COLUMN leave_requests.forward_mail_enabled IS
    'Phase 41c. Czy pracownik zgodził się na przekierowanie poczty do zastępcy (opt-in, domyślnie FALSE). Intencja — stan faktyczny reguły w skrzynce trzyma outlook_forward_rule_id. FALSE przy istniejącej regule = uzgodnienie ją zamknie; to jest droga ręcznego wyłączenia w trakcie urlopu. Ustawiane przy składaniu wniosku i przełączane przyciskiem przez właściciela urlopu, jego managera lub admina. Audit log: LEAVE_FORWARD_PREFERENCE_SET.';

-- ─── Audit log action types (comment only) ─────────────────────────────
-- Phase 41c dokłada do zestawu z Phase 41 (audit_logs.action jest TEXT):
--   'LEAVE_FORWARD_PREFERENCE_SET' — zmiana intencji (details: enabled, via)
-- Rozdzielone od LEAVE_FORWARD_SET / LEAVE_FORWARD_DISABLED, które nadal
-- opisują wyłącznie stan reguły w skrzynce. Dzięki temu z audytu widać
-- osobno "kto o to poprosił" i "co faktycznie zrobił Graph" — a te dwie
-- rzeczy potrafią się rozjechać, gdy Graph odrzuci operację.

COMMIT;
