-- Phase: bug cleanup
-- Drop dead column `profiles.role_name` — null wszędzie, zero referencji w kodzie aplikacji
-- (verified: grep "role_name" w app/, components/, lib/ → empty).
-- Idempotent: IF EXISTS guard.

ALTER TABLE public.profiles
    DROP COLUMN IF EXISTS role_name;
