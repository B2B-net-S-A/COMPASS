-- ETAP 1a: Utworzenie brakujacej funkcji RPC sync_user_role
-- Ta funkcja jest wywolywana w app/login/actions.ts:78 ale nigdy nie istniala w migracjach.
-- Dziala jako SECURITY DEFINER, wiec omija RLS na admin_access_list i centrala_access_list.
-- ROLLBACK: DROP FUNCTION IF EXISTS public.sync_user_role(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.sync_user_role(p_user_id UUID, p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_current_role TEXT;
BEGIN
    SELECT role INTO v_current_role FROM profiles WHERE id = p_user_id;

    -- 1. Check admin_access_list
    IF EXISTS (SELECT 1 FROM admin_access_list WHERE LOWER(email) = LOWER(p_email)) THEN
        v_role := 'administrator';
    -- 2. Check centrala_access_list
    ELSIF EXISTS (SELECT 1 FROM centrala_access_list WHERE LOWER(email) = LOWER(p_email)) THEN
        v_role := 'centrala';
    -- 3. Downgrade elevated roles not in any list
    ELSIF v_current_role IN ('administrator', 'admin', 'centrala') THEN
        v_role := 'consultant';
    ELSE
        v_role := COALESCE(v_current_role, 'consultant');
    END IF;

    -- Update profile if role changed
    IF v_role IS DISTINCT FROM v_current_role THEN
        UPDATE profiles SET role = v_role WHERE id = p_user_id;
    END IF;

    RETURN v_role;
END;
$$;
