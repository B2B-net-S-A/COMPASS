-- Consultant Success follow-up: automatic signal for high-risk client feedback.
-- The original delivery-kind constraint intentionally enumerates every allowed
-- outbox event, so extending it is an explicit migration rather than a loose
-- text value accepted by application code only.

ALTER TABLE public.contractor_success_deliveries
    DROP CONSTRAINT IF EXISTS contractor_success_deliveries_delivery_kind_check;

ALTER TABLE public.contractor_success_deliveries
    ADD CONSTRAINT contractor_success_deliveries_delivery_kind_check
    CHECK (delivery_kind IN (
        'check_in_due',
        'task_due',
        'conversation_follow_up',
        'client_feedback_risk',
        'pulse_invitation',
        'pulse_reminder',
        'pulse_low_alert',
        'health_review'
    ));

CREATE INDEX IF NOT EXISTS idx_contractor_client_feedback_risk
    ON public.contractor_client_feedback(feedback_date DESC, contractor_id)
    WHERE archived_at IS NULL AND risk_level IN ('high', 'critical');
