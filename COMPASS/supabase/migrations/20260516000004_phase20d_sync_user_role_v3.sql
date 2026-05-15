-- ============================================================
-- Phase 20d — sync_user_role v3: preserve manager + talent_community
-- Date: 2026-05-16
--
-- Without this patch, sync_user_role (Phase 18.3 + 19c) would downgrade
-- any user with role 'manager' or 'talent_community' to 'consultant' on
-- every login. Need explicit branches to preserve.
--
-- Same signature, same return type as 19c.
-- ============================================================

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
    ELSIF v_current_role::text = 'finanse' THEN
        v_target := 'finanse'::public.user_role;
    ELSIF v_current_role::text = 'manager' THEN
        -- Phase 20d: preserve dedicated manager role across sync.
        v_target := 'manager'::public.user_role;
    ELSIF v_current_role::text = 'talent_community' THEN
        -- Phase 20d: preserve dedicated TCM role across sync.
        v_target := 'talent_community'::public.user_role;
    ELSE
        v_target := 'consultant'::public.user_role;
    END IF;

    IF v_current_role IS DISTINCT FROM v_target THEN
        UPDATE public.profiles SET role = v_target WHERE id = p_user_id;
    END IF;

    RETURN v_target;
END;
$$;

COMMENT ON FUNCTION public.sync_user_role IS
    'Phase 18.3 + 19c + 20d. Atomic role-sync. Preserves admin (via admin_access_list), internal, finanse, manager, talent_community; everything else → consultant.';

REVOKE EXECUTE ON FUNCTION public.sync_user_role(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_user_role(uuid, text, boolean) TO authenticated, service_role;
