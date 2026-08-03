-- Phase 45b — defence-in-depth for the has_tcm_access grant (RLS layer)
-- Date: 2026-08-03
--
-- Mirrors the app-layer guard hasEffectiveTcmAccess(): the per-user has_tcm_access
-- flag only counts for HR-zone users, never a bare `consultant`. Granting the flag
-- is admin-only, but this keeps the RLS boundary self-defending if the flag were
-- ever mis-set on a platform consultant (who must never reach lifecycle tables).
-- `role <> 'consultant'` == canAccessInternalZone (consultant is the only non-HR-zone role).

CREATE OR REPLACE FUNCTION public.has_lifecycle_access()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND (
            role::TEXT IN ('admin', 'talent_community')
            OR (has_tcm_access = TRUE AND role::TEXT <> 'consultant')
          )
    );
$function$;
