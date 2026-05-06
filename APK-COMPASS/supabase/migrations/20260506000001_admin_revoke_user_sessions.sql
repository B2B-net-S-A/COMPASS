-- Function: admin_revoke_user_sessions(target_user_id UUID)
-- Purpose: Allow service-role to invalidate ALL active sessions for a given user
--          without changing their password (for incident response / suspicious activity).
--          Supabase admin SDK does NOT expose a direct "kick by user_id" — `auth.admin.signOut(jwt, scope)`
--          requires the user's own JWT, which admin doesn't have. This RPC fills that gap.
--
-- Behavior:
--   - Deletes refresh tokens (revokes refresh ability — sessions die on next refresh, ≤1h)
--   - Deletes session rows (revokes immediately on next request)
--
-- Security:
--   - SECURITY DEFINER so it can touch the `auth` schema (which is normally restricted)
--   - REVOKE from PUBLIC/anon/authenticated; GRANT only to service_role
--   - Caller MUST verify auth in app code (e.g., `requireSuperAdmin()`) before invoking

CREATE OR REPLACE FUNCTION public.admin_revoke_user_sessions(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    DELETE FROM auth.refresh_tokens WHERE user_id = target_user_id::text;
    DELETE FROM auth.sessions WHERE user_id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_user_sessions(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_revoke_user_sessions(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.admin_revoke_user_sessions(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user_sessions(UUID) TO service_role;

COMMENT ON FUNCTION public.admin_revoke_user_sessions(UUID) IS
    'Invalidates all sessions for a user. Service-role only. Requires app-level Super Admin guard.';
