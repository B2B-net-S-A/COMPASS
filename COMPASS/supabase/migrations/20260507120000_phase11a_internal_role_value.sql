-- ============================================================
-- Phase 11a — Add 'internal' value to user_role enum
-- Date: 2026-05-07
--
-- Postgres does not allow using a newly-added enum value within the same
-- transaction that added it. Phase 11b uses 'internal' in helper functions
-- and RLS policies, so the ADD VALUE must commit first.
--
-- Idempotent: IF NOT EXISTS guard.
-- ============================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'internal';
