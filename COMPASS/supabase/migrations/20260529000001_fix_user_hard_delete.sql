-- Fix: hard-deleting a user was impossible whenever they had lifecycle_events.
--
-- Root cause: lifecycle_events.user_id → profiles ON DELETE CASCADE, but
-- lifecycle_events also carries an append-only trigger
-- (trg_lifecycle_events_block_update → block_lifecycle_events_mutation) that
-- RAISEs on any DELETE/UPDATE. Deleting a user (auth.users → profiles cascade →
-- lifecycle_events cascade) therefore always aborts on that trigger. The app's
-- deleteUserAccount() surfaced this only as a generic masked error in prod.
--
-- Fix: keep lifecycle_events append-only for normal operations, but let an
-- explicit admin hard-delete opt the CASCADE delete through, scoped to a single
-- transaction via a custom GUC. UPDATE remains blocked unconditionally.

-- 1) Trigger fn: allow DELETE only when the per-transaction bypass flag is set.
CREATE OR REPLACE FUNCTION public.block_lifecycle_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('app.allow_lifecycle_cascade_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'lifecycle_events is append-only — % blocked', TG_OP
    USING ERRCODE = 'P0001';
END;
$fn$;

-- 2) SECURITY DEFINER RPC that performs the hard delete with the bypass enabled
--    for this transaction only. Owner (postgres) has rights to delete auth.users;
--    the FK cascade then cleans up profiles + all child rows.
CREATE OR REPLACE FUNCTION public.admin_hard_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $fn$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = 'P0001';
  END IF;
  -- Transaction-scoped: lets the append-only trigger permit the cascade DELETE
  -- of this user's lifecycle_events. Does not leak past this RPC call.
  PERFORM set_config('app.allow_lifecycle_cascade_delete', 'on', true);
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$fn$;

-- 3) Lock down EXECUTE: only the service role (used by the server action behind
--    the requireSuperAdmin + ensureCanModify guards) may call it.
REVOKE ALL ON FUNCTION public.admin_hard_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_user(uuid) TO service_role;

COMMENT ON FUNCTION public.admin_hard_delete_user(uuid) IS
  'Hard-deletes an auth user and cascades, bypassing the lifecycle_events append-only trigger for this transaction only. Service-role only; app gates with requireSuperAdmin + ensureCanModify.';
