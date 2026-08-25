-- Audyt 2026-08-25 · KROK C6.2 — indeksy pokrywające klucze obce
--
-- Advisor `unindexed_foreign_keys` zgłasza 134 klucze obce bez indeksu na kolumnie
-- odwołującej. Indeks na takiej kolumnie robi dwie rzeczy: przyspiesza JOIN/filtr po niej
-- ORAZ — co ważniejsze — pozwala Postgresowi sprawdzić więzy przy DELETE/UPDATE wiersza
-- RODZICA bez pełnego skanu tabeli dziecka. Bez indeksu każde skasowanie jednego profilu,
-- placementu czy ticketu skanuje sekwencyjnie każdą tabelę, która się do niego odwołuje.
--
-- ZAKŁADAMY 41 Z 134, NIE WSZYSTKIE. Kryterium jest mechaniczne i sprawdzalne:
-- tabela dziecka ma DZIŚ co najmniej 40 żywych wierszy. Pozostałe 93 klucze siedzą na
-- tabelach mających 0–35 wierszy (kursy, ścieżki nauki, zadania kanban, faktury wyłączone
-- flagą od Fazy 26, wygaszony komunikator) albo na tabelach, które kasuje krok C2
-- (support_contractor_meta). Indeks na tabeli pustej niczego nie przyspiesza
-- — planista i tak wybierze skan sekwencyjny — a kosztuje przy każdym zapisie i natychmiast
-- wraca do advisora jako `unused_index`. Gdy któraś z tych tabel realnie się zapełni,
-- dołożenie indeksu jest jedną linijką.
--
-- ZALEŻNOŚĆ OD KROKU C2: `support_contractor_meta` ma dwa niepokryte klucze obce, ale
-- krok C2 kasuje całą tę tabelę, więc indeksów na niej celowo tu nie ma. Ta migracja
-- musi jechać PO C2 — stąd znacznik czasu 1780 zamiast 1700.
--
-- ŚWIADOMIE BEZ `CONCURRENTLY`: nie działa wewnątrz transakcji, a migracje jadą
-- transakcyjnie. Zwykły `CREATE INDEX` bierze na tabelę blokadę SHARE (odczyty przechodzą,
-- zapisy czekają) na czas budowy. Największa tabela w tym zestawie ma 2 419 wierszy,
-- więc mówimy o milisekundach na tabelę — nie ma czego rozbrajać.

CREATE INDEX IF NOT EXISTS idx_attendance_records_created_by ON public.attendance_records (created_by);
CREATE INDEX IF NOT EXISTS idx_bonuses_cancelled_by ON public.bonuses (cancelled_by);
CREATE INDEX IF NOT EXISTS idx_client_areas_created_by ON public.client_areas (created_by);
CREATE INDEX IF NOT EXISTS idx_client_departures_created_by ON public.client_departures (created_by);
CREATE INDEX IF NOT EXISTS idx_client_departures_imported_by ON public.client_departures (imported_by);
CREATE INDEX IF NOT EXISTS idx_client_departures_placement_id ON public.client_departures (placement_id);
CREATE INDEX IF NOT EXISTS idx_client_departures_recruiter_id ON public.client_departures (recruiter_id);
CREATE INDEX IF NOT EXISTS idx_client_entries_delivery_lead_id ON public.client_entries (delivery_lead_id);
CREATE INDEX IF NOT EXISTS idx_client_entries_imported_by ON public.client_entries (imported_by);
CREATE INDEX IF NOT EXISTS idx_client_entries_recruiter_id ON public.client_entries (recruiter_id);
CREATE INDEX IF NOT EXISTS idx_contractor_bench_created_by ON public.contractor_bench (created_by);
CREATE INDEX IF NOT EXISTS idx_contractor_conversations_created_by ON public.contractor_conversations (created_by);
CREATE INDEX IF NOT EXISTS idx_contractor_conversations_imported_by ON public.contractor_conversations (imported_by);
CREATE INDEX IF NOT EXISTS idx_contractor_conversations_placement_id ON public.contractor_conversations (placement_id);
CREATE INDEX IF NOT EXISTS idx_contractor_success_settings_created_by ON public.contractor_success_settings (created_by);
CREATE INDEX IF NOT EXISTS idx_contractor_success_settings_health_reviewed_by ON public.contractor_success_settings (health_reviewed_by);
CREATE INDEX IF NOT EXISTS idx_contractor_success_settings_health_status_set_by ON public.contractor_success_settings (health_status_set_by);
CREATE INDEX IF NOT EXISTS idx_contractor_success_settings_monitoring_paused_by ON public.contractor_success_settings (monitoring_paused_by);
CREATE INDEX IF NOT EXISTS idx_contractor_success_settings_monitoring_started_by ON public.contractor_success_settings (monitoring_started_by);
CREATE INDEX IF NOT EXISTS idx_contractor_success_settings_status_verified_by ON public.contractor_success_settings (status_verified_by);
CREATE INDEX IF NOT EXISTS idx_contractor_success_settings_updated_by ON public.contractor_success_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_contractors_imported_by ON public.contractors (imported_by);
CREATE INDEX IF NOT EXISTS idx_leave_requests_decided_by ON public.leave_requests (decided_by);
CREATE INDEX IF NOT EXISTS idx_legal_monitor_items_assigned_to ON public.legal_monitor_items (assigned_to);
CREATE INDEX IF NOT EXISTS idx_legal_monitor_items_pinned_by ON public.legal_monitor_items (pinned_by);
CREATE INDEX IF NOT EXISTS idx_legal_monitor_items_reviewed_by ON public.legal_monitor_items (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_created_by ON public.lifecycle_events (created_by);
CREATE INDEX IF NOT EXISTS idx_placements_cancelled_by ON public.placements (cancelled_by);
CREATE INDEX IF NOT EXISTS idx_placements_dl_bonus_id ON public.placements (dl_bonus_id);
CREATE INDEX IF NOT EXISTS idx_placements_hours_confirmed_by ON public.placements (hours_confirmed_by);
CREATE INDEX IF NOT EXISTS idx_placements_imported_by ON public.placements (imported_by);
CREATE INDEX IF NOT EXISTS idx_placements_recruiter_bonus_id ON public.placements (recruiter_bonus_id);
CREATE INDEX IF NOT EXISTS idx_placements_tcm_ticket_id ON public.placements (tcm_ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_comments_author_id ON public.support_ticket_comments (author_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category_id ON public.support_tickets (category_id);
CREATE INDEX IF NOT EXISTS idx_tech_interview_cards_created_by ON public.tech_interview_cards (created_by);
CREATE INDEX IF NOT EXISTS idx_tech_interview_cards_placement_id ON public.tech_interview_cards (placement_id);
CREATE INDEX IF NOT EXISTS idx_tech_interview_cards_tcm_id ON public.tech_interview_cards (tcm_id);
CREATE INDEX IF NOT EXISTS idx_technologies_created_by ON public.technologies (created_by);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_correction_decided_by ON public.timesheet_entries (correction_decided_by);
CREATE INDEX IF NOT EXISTS idx_timesheets_approved_by ON public.timesheets (approved_by);

DO $$
DECLARE
    -- Tabele objęte tą migracją. Dla KAŻDEJ z nich pokrywamy komplet jej kluczy obcych,
    -- więc po migracji żadna nie może mieć ani jednego niepokrytego FK.
    v_tables text[] := ARRAY[
        'attendance_records', 'bonuses', 'client_areas', 'client_departures', 'client_entries',
        'contractor_bench', 'contractor_conversations', 'contractor_success_settings', 'contractors',
        'leave_requests', 'legal_monitor_items', 'lifecycle_events', 'placements',
        'support_ticket_comments', 'support_tickets',
        'tech_interview_cards', 'technologies', 'timesheet_entries', 'timesheets'
    ];
    v_missing text;
    v_created int;
BEGIN
    SELECT string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ')
    INTO v_missing
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND rel.relname = ANY(v_tables)
      AND NOT EXISTS (
          SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid
            AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey
      );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'C6.2: klucze obce nadal bez indeksu pokrywającego: %', v_missing;
    END IF;

    SELECT count(*) INTO v_created
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'idx_attendance_records_created_by', 'idx_bonuses_cancelled_by', 'idx_client_areas_created_by',
        'idx_client_departures_created_by', 'idx_client_departures_imported_by',
        'idx_client_departures_placement_id', 'idx_client_departures_recruiter_id',
        'idx_client_entries_delivery_lead_id', 'idx_client_entries_imported_by',
        'idx_client_entries_recruiter_id', 'idx_contractor_bench_created_by',
        'idx_contractor_conversations_created_by', 'idx_contractor_conversations_imported_by',
        'idx_contractor_conversations_placement_id', 'idx_contractor_success_settings_created_by',
        'idx_contractor_success_settings_health_reviewed_by',
        'idx_contractor_success_settings_health_status_set_by',
        'idx_contractor_success_settings_monitoring_paused_by',
        'idx_contractor_success_settings_monitoring_started_by',
        'idx_contractor_success_settings_status_verified_by',
        'idx_contractor_success_settings_updated_by', 'idx_contractors_imported_by',
        'idx_leave_requests_decided_by', 'idx_legal_monitor_items_assigned_to',
        'idx_legal_monitor_items_pinned_by', 'idx_legal_monitor_items_reviewed_by',
        'idx_lifecycle_events_created_by', 'idx_placements_cancelled_by', 'idx_placements_dl_bonus_id',
        'idx_placements_hours_confirmed_by', 'idx_placements_imported_by',
        'idx_placements_recruiter_bonus_id', 'idx_placements_tcm_ticket_id',
        'idx_support_ticket_comments_author_id', 'idx_support_tickets_category_id',
        'idx_tech_interview_cards_created_by', 'idx_tech_interview_cards_placement_id',
        'idx_tech_interview_cards_tcm_id', 'idx_technologies_created_by',
        'idx_timesheet_entries_correction_decided_by', 'idx_timesheets_approved_by'
      );

    IF v_created <> 41 THEN
        RAISE EXCEPTION 'C6.2: oczekiwano 41 indeksów, jest %', v_created;
    END IF;
END $$;
