-- Phase 48 — Monitoring prawny: tabele interfejsu dla zewnętrznego pipeline'u AI.
--
-- UWAGA: ta migracja została zaaplikowana na prod 10.08.2026 przez Supabase MCP
-- (`legal_monitoring_tables`, version 20260810121224) ZANIM powstał moduł w repo.
-- Plik jest wiernym, idempotentnym odwzorowaniem stanu prod — żeby świeże
-- środowisko dało się zbudować z samych migracji. Na prod jest no-opem.
--
-- Kontrakt: tabele są STAŁYM interfejsem między silnikiem monitoringu (zadanie
-- cykliczne AI, dopisuje wpisy ścieżką serwisową) a modułem COMPASS (czyta i
-- obsługuje przegląd). Moduł niczego nie pobiera z internetu.

create table if not exists public.legal_monitor_items (
    id uuid primary key default gen_random_uuid(),
    -- Źródło wg receptur pipeline'u.
    source text not null check (source in ('GIP', 'EUREKA', 'SN', 'NSA_WSA', 'ZUS', 'SEJM_RCL', 'TK')),
    -- Czytelna nazwa źródła do wyświetlenia (np. „WSA w Łodzi").
    source_label text not null,
    topic text not null check (topic in ('pip_b2b', 'cit_estonski', 'zus_samozatrudnienie', 'legislacja', 'tk_pip')),
    -- red = może wymagać decyzji/reakcji, yellow = wskazówka kierunkowa, green = kontekst.
    severity text not null check (severity in ('red', 'yellow', 'green')),
    -- Data dokumentu źródłowego; null dla pozycji „statusowych".
    published_at date,
    -- Sygnatura / numer (np. „I SA/Łd 598/25", „0111-KDIB…", „UD116").
    reference text,
    title text not null,
    url text,
    summary text not null,
    why_it_matters text not null,
    status text not null default 'new' check (status in ('new', 'reviewed', 'action_required', 'dismissed')),
    reviewed_by uuid references public.profiles(id) on delete set null,
    reviewed_at timestamptz,
    review_note text,
    -- Klucz deduplikacji pipeline'u (url albo „ŹRÓDŁO|sygnatura").
    -- NIE pokazywać w UI, NIE edytować.
    dedupe_key text not null,
    created_at timestamptz not null default now()
);

create unique index if not exists legal_monitor_items_dedupe_key_idx
    on public.legal_monitor_items (dedupe_key);
create index if not exists legal_monitor_items_status_idx
    on public.legal_monitor_items (status);
create index if not exists legal_monitor_items_created_at_idx
    on public.legal_monitor_items (created_at desc);

-- Heartbeat: pipeline dopisuje jeden wiersz na KAŻDY przebieg, także pusty.
-- Brak świeżego wiersza w dzień roboczy = monitoring nie odpowiada.
create table if not exists public.legal_monitor_runs (
    id uuid primary key default gen_random_uuid(),
    run_at timestamptz not null default now(),
    window_from date,
    status text not null check (status in ('ok', 'partial', 'failed')),
    items_found integer not null default 0,
    -- np. {"GIP":"ok","SN":"empty","SEJM_RCL":"fail"} — wartości ok/fail/empty.
    sources_checked jsonb not null default '{}'::jsonb,
    notes text
);

create index if not exists legal_monitor_runs_run_at_idx
    on public.legal_monitor_runs (run_at desc);

alter table public.legal_monitor_items enable row level security;
alter table public.legal_monitor_runs enable row level security;

-- Czytają i przeglądają wyłącznie finanse + admin (wzorzec user_contract_documents).
drop policy if exists legal_monitor_items_select_finanse_admin on public.legal_monitor_items;
create policy legal_monitor_items_select_finanse_admin
    on public.legal_monitor_items for select to authenticated
    using (public.is_finanse_or_admin());

drop policy if exists legal_monitor_items_update_finanse_admin on public.legal_monitor_items;
create policy legal_monitor_items_update_finanse_admin
    on public.legal_monitor_items for update to authenticated
    using (public.is_finanse_or_admin())
    with check (public.is_finanse_or_admin());

drop policy if exists legal_monitor_runs_select_finanse_admin on public.legal_monitor_runs;
create policy legal_monitor_runs_select_finanse_admin
    on public.legal_monitor_runs for select to authenticated
    using (public.is_finanse_or_admin());

-- INSERT/DELETE: BRAK polityk celowo — pisze wyłącznie pipeline ścieżką serwisową.
-- Nie dodawać polityk INSERT dla authenticated/anon (ryzyko fałszywych „wpisów prawnych").
