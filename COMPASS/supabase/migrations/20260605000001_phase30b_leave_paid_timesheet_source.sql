-- Phase 30b — auto-wpis płatnego urlopu (z puli) do timesheet jako godziny.
--
-- Reguła (decyzja Artura, 2026-05-29): dla B2B/zlecenie z pulą płatnych urlopów
-- dni z puli (leave_requests.paid_days) mają pokazywać się w timesheet jak normalny
-- dzień roboczy (auto-wpis 8h, billable). Dopiero nadwyżka (unpaid_days) blokuje
-- timesheet jak zawsze.
--
-- Te auto-wpisy oznaczamy nową wartością source='leave_paid', żeby:
--   * były idempotentne (re-sync nie duplikuje),
--   * dało się je czysto usunąć przy anulowaniu urlopu,
--   * odróżnić je od ręcznych godzin / godzin z work-clock.

ALTER TABLE timesheet_entries
    DROP CONSTRAINT IF EXISTS timesheet_entries_source_check;

ALTER TABLE timesheet_entries
    ADD CONSTRAINT timesheet_entries_source_check
    CHECK (source = ANY (ARRAY['manual'::text, 'clock_suggested'::text, 'clock_accepted'::text, 'leave_paid'::text]));

COMMENT ON COLUMN timesheet_entries.source IS
    'manual | clock_suggested | clock_accepted | leave_paid (auto-wpis płatnego urlopu z puli B2B/zlecenie — Phase 30b)';
