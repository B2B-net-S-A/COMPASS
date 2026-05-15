-- ============================================================
-- Phase 20a — Extend user_role enum: + manager + talent_community
-- Date: 2026-05-16
--
-- Rationale: rozszerzenie modelu ról z 4 do 6 (Phase 20):
--   admin              = Super Admin (bez zmian)
--   consultant         = Konsultant IT (bez zmian)
--   internal           = Konsultant wewnętrzny (rename UI label only)
--   finanse            = Finanse (bez zmian)
--   manager            (NEW) = HR mojego zespołu + własny timesheet+faktura
--   talent_community   (NEW) = tickets + news composer + compliance + własny HR
--
-- Postgres requires ALTER TYPE ADD VALUE w osobnym commicie zanim wartość
-- można użyć w funkcjach/RLS — stąd ta migracja jest samodzielna,
-- a wszystkie usage'y (RLS, helpers, sync_user_role) idzie w 20b/20c/20d.
-- ============================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'talent_community';
