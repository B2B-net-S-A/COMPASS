-- ============================================================
-- Phase 19a — Add 'finanse' value to user_role enum
-- Date: 2026-05-14
--
-- Postgres does not allow using a newly-added enum value within the same
-- transaction that added it. Phase 19b uses 'finanse' in helper functions,
-- RLS policies, and sync_user_role RPC, so the ADD VALUE must commit first
-- (separate migration file = separate transaction).
--
-- Pattern mirrors phase11a (added 'internal' value).
-- Idempotent: IF NOT EXISTS guard.
-- ============================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'finanse';
