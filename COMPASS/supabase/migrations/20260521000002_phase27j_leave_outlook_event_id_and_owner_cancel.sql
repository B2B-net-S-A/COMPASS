-- Phase 27j — fix leave cancellation (Dominik bug report 2026-05-21).
--
-- (1) outlook_event_id: Phase 25 PR2 code (cancelMyLeaveRequest, rejectLeaveRequest,
--     retryLeaveGraphSync, listLeavesWithSyncIssues) SELECTs leave_requests.outlook_event_id,
--     but migration 20260514000001_leave_outlook_event_id.sql never reached prod. The
--     missing column made every cancel/reject error out on its SELECT ("Wniosek nie
--     istnieje"). Additive + idempotent — safe re-apply.
ALTER TABLE public.leave_requests
    ADD COLUMN IF NOT EXISTS outlook_event_id TEXT;

COMMENT ON COLUMN public.leave_requests.outlook_event_id IS
    'Microsoft Graph event id zapisany do kalendarza Outlook przy approve. NULL gdy Calendar push pominięty lub padł.';

-- (2) Owners could not cancel their own APPROVED future leaves (H2.3 self-cancel):
--     the UPDATE policy USING only matched status='pending' for owners, so an
--     approved->cancelled update silently affected 0 rows (no error, no effect, and
--     attendance got cleaned up leaving an inconsistent state). Add 'approved' to the
--     owner USING set. WITH CHECK still limits the owner's resulting status to
--     pending/cancelled, so owners can only cancel (not re-approve/edit) approved rows.
DROP POLICY IF EXISTS leave_update_owner_pending_admin_or_manager ON public.leave_requests;
CREATE POLICY leave_update_owner_pending_admin_or_manager
    ON public.leave_requests
    AS PERMISSIVE
    FOR UPDATE
    TO authenticated
    USING (
        ((auth.uid() = user_id) AND (status = ANY (ARRAY['pending'::text, 'approved'::text])))
        OR is_admin()
        OR (is_manager_of(user_id) AND (created_by = auth.uid()))
    )
    WITH CHECK (
        ((auth.uid() = user_id) AND (status = ANY (ARRAY['pending'::text, 'cancelled'::text])))
        OR is_admin()
        OR (is_manager_of(user_id) AND (created_by = auth.uid()))
    );
