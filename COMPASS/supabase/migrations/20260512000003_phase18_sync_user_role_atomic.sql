-- ============================================================
-- Phase 18.3 — Atomic sync_user_role RPC
-- Date: 2026-05-12
--
-- Eliminuje race condition w lib/auth/sync-role.ts. Wcześniej 2-step:
--   1. SELECT admin_access_list
--   2. UPDATE profiles SET role
-- Między tymi krokami stan mógł się zmienić (3 callers: email+pw login,
-- OAuth callback, /api/auth/auto-login).
--
-- Teraz: single RPC call łączy SELECT + UPDATE w jednej funkcji.
-- SECURITY DEFINER żeby działało niezależnie od RLS na profiles.
-- ============================================================

DROP FUNCTION IF EXISTS public.sync_user_role(uuid, text);

CREATE OR REPLACE FUNCTION public.sync_user_role(
    p_user_id uuid,
    p_email text,
    p_is_super_admin boolean DEFAULT false
)
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_current_role public.user_role;
    v_is_admin boolean;
    v_target public.user_role;
BEGIN
    SELECT role INTO v_current_role
    FROM public.profiles
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'sync_user_role: profile not found for user_id=%', p_user_id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.admin_access_list
        WHERE LOWER(email) = LOWER(p_email)
    ) INTO v_is_admin;

    IF p_is_super_admin OR v_is_admin THEN
        v_target := 'admin'::public.user_role;
    ELSIF v_current_role::text = 'internal' THEN
        v_target := 'internal'::public.user_role;
    ELSE
        v_target := 'consultant'::public.user_role;
    END IF;

    IF v_current_role IS DISTINCT FROM v_target THEN
        UPDATE public.profiles SET role = v_target WHERE id = p_user_id;
    END IF;

    RETURN v_target;
END;
$$;

COMMENT ON FUNCTION public.sync_user_role(uuid, text, boolean) IS
    'Phase 18.3. Atomic role-sync (SELECT admin_access_list + UPDATE profiles w jednej funkcji). Eliminuje race condition między 3 callerami login flow.';

REVOKE EXECUTE ON FUNCTION public.sync_user_role(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_user_role(uuid, text, boolean) TO authenticated, service_role;
