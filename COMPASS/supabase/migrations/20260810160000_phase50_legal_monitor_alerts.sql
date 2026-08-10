-- Phase 50 — Monitoring prawny: alerty, follow-up i podgląd dla zarządu.
--
-- Phase 48 dał skrzynkę, ale moduł był pasywny: jedynym sygnałem, że automat coś
-- dorzucił (albo że przestał chodzić), był licznik na zakładce schowanej w
-- Administracji HR. Ta migracja dokłada stan potrzebny, żeby moduł sam się odezwał.

-- ─── Dedup alertów + follow-up po „Do reakcji" ───────────────────────────────

alter table public.legal_monitor_items
    -- Stempel alertu o czerwonym wpisie; NULL = jeszcze nie alertowano.
    -- Wzorzec z tech_interview_cards.demand_alerted_at (Phase 46c).
    add column if not exists alerted_at timestamptz,
    -- Termin reakcji dla wpisu oznaczonego jako action_required.
    add column if not exists due_date date,
    -- Kto ma zareagować (NULL = nikt konkretny, przypomnienie idzie do odbiorców alertów).
    add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
    -- Stempel ostatniego przypomnienia o przeterminowanej reakcji (dedup dobowy).
    add column if not exists reminded_at timestamptz;

comment on column public.legal_monitor_items.alerted_at is
    'Phase 50: kiedy wysłano alert o czerwonym wpisie. NULL = nie alertowano.';
comment on column public.legal_monitor_items.due_date is
    'Phase 50: termin reakcji (tylko sensowny przy status=action_required).';
comment on column public.legal_monitor_items.assigned_to is
    'Phase 50: kto ma zareagować; NULL = przypomnienie do odbiorców alertów.';

-- Wpisy do zaalertowania: czerwone, nieprzejrzane, jeszcze nie zgłoszone.
create index if not exists legal_monitor_items_pending_alert_idx
    on public.legal_monitor_items (created_at)
    where alerted_at is null and severity = 'red' and status = 'new';

-- Przeterminowane reakcje — mały, wysoce selektywny indeks.
create index if not exists legal_monitor_items_due_idx
    on public.legal_monitor_items (due_date)
    where status = 'action_required' and due_date is not null;

-- ─── Podgląd read-only poza rolą finanse (zarząd / manager) ──────────────────

alter table public.profiles
    add column if not exists can_view_legal_monitor boolean not null default false;

comment on column public.profiles.can_view_legal_monitor is
    'Phase 50: grant read-only na monitoring prawny bez nadawania roli finanse. '
    'Nie daje prawa przeglądu (UPDATE) — to zostaje przy finanse/admin.';

-- Nazwa CELOWO różna od kolumny (`can_view_legal_monitor`), żeby w ciele funkcji
-- nie było wątpliwości, czy identyfikator to kolumna czy wywołanie funkcji.
-- Grant bramkowany do strefy HR — konsultant IT nie wchodzi nawet z flagą.
create or replace function public.has_legal_monitor_read()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $$
    select exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and (
            p.role::text in ('admin', 'finanse')
            or (p.can_view_legal_monitor = true and p.role::text <> 'consultant')
          )
    );
$$;

-- SELECT rozszerzony o grant; UPDATE zostaje wyłącznie przy finanse/admin,
-- więc posiadacz flagi czyta, ale nie przegląda.
drop policy if exists legal_monitor_items_select_finanse_admin on public.legal_monitor_items;
create policy legal_monitor_items_select_finanse_admin
    on public.legal_monitor_items for select to authenticated
    using (public.has_legal_monitor_read());

drop policy if exists legal_monitor_runs_select_finanse_admin on public.legal_monitor_runs;
create policy legal_monitor_runs_select_finanse_admin
    on public.legal_monitor_runs for select to authenticated
    using (public.has_legal_monitor_read());

-- ─── Typy powiadomień ────────────────────────────────────────────────────────
-- Lista przepisana z ŻYWEGO stanu prod (pg_get_constraintdef, 2026-08-10, 34
-- wartości) + 4 nowe. NIE odtwarzać jej z dokumentacji — rozjazd skasowałby
-- typy dołożone przez inne fazy.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
    type = any (array[
        'contract_ending', 'health_score_low', 'new_project_match', 'loyalty_tier_up',
        'referral_update', 'document_uploaded', 'system_announcement', 'payment_received',
        'course_completed', 'course_approved', 'course_rejected', 'support_ticket_assigned',
        'support_ticket_replied', 'support_ticket_resolved', 'news_published',
        'incubator_pitch_status_changed', 'incubator_application_received',
        'incubator_application_status_changed', 'inbox_ticket_assigned', 'inbox_sla_breach',
        'bonus_proposed', 'bonus_cancelled', 'bonus_linked', 'bonus_assigned', 'bonus_updated',
        'inbox_email_arrived', 'inbox_email_reopened', 'rate_changed', 'placement_reminder',
        'champions_league_assigned', 'contractor_followup', 'tech_map_demand',
        'tech_map_project_end', 'leave_cancelled',
        -- Phase 50 — monitoring prawny
        'legal_monitor_red', 'legal_monitor_silent', 'legal_monitor_due', 'legal_monitor_digest'
    ]::text[])
);
