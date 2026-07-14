-- ============================================================
-- Consultant Success Hub — private TCM/admin workspace
-- Date: 2026-07-14
--
-- Extends the Phase 33/34 contractor-care model with:
--   * monitoring settings and scheduled check-ins
--   * private client feedback and pulse surveys
--   * append-only health-status history
--   * durable delivery outbox, job leases, and public-form rate limits
--   * richer contractor tasks and an atomic check-in completion RPC
--
-- Privacy boundary: no contractor/consultant self-access. Authenticated access
-- is limited to has_lifecycle_access() (admin or talent_community). Operational
-- tables and public-survey RPCs are service_role-only.
-- ============================================================

BEGIN;

-- ─── 1. Contractor identity invariant ─────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.contractors
        WHERE profile_id IS NOT NULL
        GROUP BY profile_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Cannot enforce contractors.profile_id uniqueness: duplicate non-null profile_id values exist';
    END IF;
END;
$$;

-- Link account-backed consultants only when the normalized email is unique on
-- both sides. Existing links win; ambiguous/empty/conflicting emails stay null
-- for explicit manual review. Name matching is intentionally forbidden.
WITH unique_contractor_emails AS (
    SELECT
        lower(BTRIM(email)) AS normalized_email,
        (array_agg(id ORDER BY id))[1] AS contractor_id
    FROM public.contractors
    WHERE NULLIF(BTRIM(email), '') IS NOT NULL
    GROUP BY lower(BTRIM(email))
    HAVING count(*) = 1
),
unique_consultant_profiles AS (
    SELECT
        lower(BTRIM(email)) AS normalized_email,
        (array_agg(id ORDER BY id))[1] AS profile_id
    FROM public.profiles
    WHERE role::TEXT = 'consultant'
      AND NULLIF(BTRIM(email), '') IS NOT NULL
    GROUP BY lower(BTRIM(email))
    HAVING count(*) = 1
),
safe_matches AS (
    SELECT contractor_email.contractor_id, consultant_profile.profile_id
    FROM unique_contractor_emails AS contractor_email
    JOIN unique_consultant_profiles AS consultant_profile
      USING (normalized_email)
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.contractors AS already_linked
        WHERE already_linked.profile_id = consultant_profile.profile_id
          AND already_linked.id <> contractor_email.contractor_id
    )
)
UPDATE public.contractors AS contractor
SET profile_id = safe_match.profile_id
FROM safe_matches AS safe_match
WHERE contractor.id = safe_match.contractor_id
  AND contractor.profile_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contractors_profile_id_unique
    ON public.contractors(profile_id)
    WHERE profile_id IS NOT NULL;

COMMENT ON INDEX public.idx_contractors_profile_id_unique IS
    'A Compass profile can be linked to at most one contractor. Null keeps external contractors account-less.';

-- ─── 2. Success monitoring settings (one row per contractor) ──────────────

CREATE TABLE public.contractor_success_settings (
    contractor_id              UUID PRIMARY KEY
                               REFERENCES public.contractors(id) ON DELETE CASCADE,
    monitoring_status          TEXT NOT NULL DEFAULT 'inactive'
                               CHECK (monitoring_status IN ('inactive', 'active', 'paused')),
    monitoring_started_at      TIMESTAMPTZ,
    monitoring_started_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    monitoring_paused_at       TIMESTAMPTZ,
    monitoring_paused_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status_verified_at         TIMESTAMPTZ,
    status_verified_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    check_in_cadence_days      SMALLINT NOT NULL DEFAULT 30
                               CHECK (check_in_cadence_days BETWEEN 7 AND 180),
    next_check_in_on           DATE,
    surveys_enabled            BOOLEAN NOT NULL DEFAULT FALSE,
    health_status              TEXT NOT NULL DEFAULT 'unknown'
                               CHECK (health_status IN ('unknown', 'green', 'amber', 'red')),
    health_status_reason       TEXT,
    health_review_on           DATE,
    health_status_source       TEXT NOT NULL DEFAULT 'system'
                               CHECK (health_status_source IN (
                                   'manual', 'check_in', 'client_feedback', 'pulse', 'system'
                               )),
    health_status_source_id    UUID,
    health_reviewed_at         TIMESTAMPTZ,
    health_reviewed_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    health_status_set_at       TIMESTAMPTZ,
    health_status_set_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by                 UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by                 UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT contractor_success_settings_risk_review_check CHECK (
        health_status NOT IN ('amber', 'red')
        OR (
            NULLIF(BTRIM(health_status_reason), '') IS NOT NULL
            AND health_review_on IS NOT NULL
        )
    )
);

COMMENT ON TABLE public.contractor_success_settings IS
    'Private TCM/admin monitoring settings and current manually reviewed contractor health status.';
COMMENT ON COLUMN public.contractor_success_settings.health_review_on IS
    'Required next manual review date for amber/red health statuses.';
COMMENT ON COLUMN public.contractor_success_settings.health_status_source_id IS
    'Polymorphic source id; interpreted using health_status_source.';

CREATE INDEX idx_contractor_success_settings_due
    ON public.contractor_success_settings(next_check_in_on)
    WHERE monitoring_status = 'active' AND next_check_in_on IS NOT NULL;
CREATE INDEX idx_contractor_success_settings_health_review
    ON public.contractor_success_settings(health_review_on)
    WHERE health_status IN ('amber', 'red') AND health_review_on IS NOT NULL;

CREATE TRIGGER contractor_success_settings_updated_at
    BEFORE UPDATE ON public.contractor_success_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 3. Scheduled and completed check-ins ─────────────────────────────────

CREATE TABLE public.contractor_check_ins (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id         UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
    check_in_type         TEXT NOT NULL DEFAULT 'regular'
                          CHECK (check_in_type IN (
                              'regular', 'ad_hoc', 'emergency', 'feedback',
                              'risk', 'onboarding', 'offboarding'
                          )),
    status                TEXT NOT NULL DEFAULT 'scheduled'
                          CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled')),
    scheduled_at          TIMESTAMPTZ NOT NULL,
    scheduled_for         DATE GENERATED ALWAYS AS
                          ((scheduled_at AT TIME ZONE 'Europe/Warsaw')::DATE) STORED,
    assigned_tcm_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    channel               TEXT CHECK (channel IN ('phone', 'video', 'in_person', 'email', 'other')),
    priority              TEXT NOT NULL DEFAULT 'normal'
                          CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    agenda                TEXT,
    occurred_at           TIMESTAMPTZ,
    duration_minutes      INTEGER CHECK (duration_minutes BETWEEN 1 AND 1440),
    tags                  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
                          CHECK (cardinality(tags) <= 20 AND array_position(tags, NULL) IS NULL),
    completed_at          TIMESTAMPTZ,
    completed_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cancelled_at          TIMESTAMPTZ,
    cancelled_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cancellation_reason   TEXT,
    summary               TEXT,
    notes                 TEXT,
    health_status         TEXT CHECK (health_status IN ('unknown', 'green', 'amber', 'red')),
    health_status_reason  TEXT,
    health_review_on      DATE,
    next_check_in_on      DATE,
    created_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT contractor_check_ins_completed_check CHECK (
        status <> 'completed'
        OR (
            completed_at IS NOT NULL
            AND occurred_at IS NOT NULL
            AND channel IS NOT NULL
            AND NULLIF(BTRIM(summary), '') IS NOT NULL
        )
    ),
    CONSTRAINT contractor_check_ins_cancelled_check CHECK (
        status <> 'cancelled' OR cancelled_at IS NOT NULL
    ),
    CONSTRAINT contractor_check_ins_health_review_check CHECK (
        health_status NOT IN ('amber', 'red')
        OR (
            NULLIF(BTRIM(health_status_reason), '') IS NOT NULL
            AND health_review_on IS NOT NULL
        )
    )
);

COMMENT ON TABLE public.contractor_check_ins IS
    'Private scheduled TCM check-ins and their completion records. One active check-in per contractor/business day.';

CREATE UNIQUE INDEX idx_contractor_check_ins_one_active_slot
    ON public.contractor_check_ins(contractor_id, scheduled_for)
    WHERE status IN ('scheduled', 'in_progress');
CREATE INDEX idx_contractor_check_ins_contractor
    ON public.contractor_check_ins(contractor_id, scheduled_at DESC);
CREATE INDEX idx_contractor_check_ins_planner
    ON public.contractor_check_ins(scheduled_for)
    WHERE status IN ('scheduled', 'in_progress');

CREATE TRIGGER contractor_check_ins_updated_at
    BEFORE UPDATE ON public.contractor_check_ins
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 4. Client feedback ───────────────────────────────────────────────────

CREATE TABLE public.contractor_client_feedback (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id         UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
    placement_id          UUID REFERENCES public.placements(id) ON DELETE SET NULL,
    source_check_in_id    UUID REFERENCES public.contractor_check_ins(id) ON DELETE SET NULL,
    feedback_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    client_name_snapshot  TEXT,
    provided_by_role      TEXT CHECK (provided_by_role IN (
                              'client', 'client_manager', 'client_hr',
                              'account_manager', 'delivery_lead', 'other'
                          )),
    provided_by_name      TEXT,
    overall_rating        NUMERIC(3,2) CHECK (overall_rating BETWEEN 1 AND 5),
    technical_rating      SMALLINT CHECK (technical_rating BETWEEN 1 AND 5),
    communication_rating  SMALLINT CHECK (communication_rating BETWEEN 1 AND 5),
    reliability_rating    SMALLINT CHECK (reliability_rating BETWEEN 1 AND 5),
    engagement_rating     SMALLINT CHECK (engagement_rating BETWEEN 1 AND 5),
    willing_to_continue   TEXT NOT NULL DEFAULT 'not_asked'
                          CHECK (willing_to_continue IN (
                              'definitely_yes', 'yes', 'neutral', 'no', 'definitely_no', 'not_asked'
                          )),
    risk_level            TEXT NOT NULL DEFAULT 'normal'
                          CHECK (risk_level IN ('low', 'normal', 'high', 'urgent')),
    summary               TEXT,
    strengths             TEXT,
    improvement_areas     TEXT,
    recommended_actions   TEXT,
    recorded_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    archived_at           TIMESTAMPTZ,
    archived_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT contractor_client_feedback_content_check CHECK (
        overall_rating IS NOT NULL
        OR technical_rating IS NOT NULL
        OR communication_rating IS NOT NULL
        OR reliability_rating IS NOT NULL
        OR engagement_rating IS NOT NULL
        OR NULLIF(BTRIM(summary), '') IS NOT NULL
    )
);

COMMENT ON TABLE public.contractor_client_feedback IS
    'Private client feedback recorded by TCM/admin. It is never directly visible to the contractor.';

CREATE INDEX idx_contractor_client_feedback_contractor
    ON public.contractor_client_feedback(contractor_id, feedback_date DESC)
    WHERE archived_at IS NULL;
CREATE INDEX idx_contractor_client_feedback_placement
    ON public.contractor_client_feedback(placement_id)
    WHERE placement_id IS NOT NULL;

CREATE TRIGGER contractor_client_feedback_updated_at
    BEFORE UPDATE ON public.contractor_client_feedback
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 5. Pulse survey requests and immutable responses ─────────────────────

CREATE TABLE public.contractor_pulse_requests (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id             UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
    source_check_in_id        UUID REFERENCES public.contractor_check_ins(id) ON DELETE SET NULL,
    token_hash                TEXT NOT NULL UNIQUE
                              CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    status                    TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'scheduled', 'sent', 'completed', 'expired', 'cancelled')),
    delivery_channel          TEXT NOT NULL DEFAULT 'email'
                              CHECK (delivery_channel IN ('email', 'manual_link')),
    recipient_email_snapshot  TEXT,
    scheduled_for             TIMESTAMPTZ,
    sent_at                   TIMESTAMPTZ,
    expires_at                TIMESTAMPTZ NOT NULL,
    responded_at              TIMESTAMPTZ,
    cancelled_at              TIMESTAMPTZ,
    cancelled_by              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reminder_count            INTEGER NOT NULL DEFAULT 0 CHECK (reminder_count >= 0),
    last_reminder_at          TIMESTAMPTZ,
    next_reminder_at          TIMESTAMPTZ,
    created_by                UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT contractor_pulse_request_expiry_check CHECK (expires_at > created_at),
    CONSTRAINT contractor_pulse_request_email_check CHECK (
        delivery_channel <> 'email'
        OR NULLIF(BTRIM(recipient_email_snapshot), '') IS NOT NULL
    ),
    CONSTRAINT contractor_pulse_request_scheduled_check CHECK (
        status <> 'scheduled' OR scheduled_for IS NOT NULL
    ),
    CONSTRAINT contractor_pulse_request_sent_check CHECK (
        status NOT IN ('sent', 'completed') OR sent_at IS NOT NULL
    ),
    CONSTRAINT contractor_pulse_request_completed_check CHECK (
        status <> 'completed' OR responded_at IS NOT NULL
    ),
    CONSTRAINT contractor_pulse_request_cancelled_check CHECK (
        status <> 'cancelled' OR cancelled_at IS NOT NULL
    )
);

COMMENT ON TABLE public.contractor_pulse_requests IS
    'Private pulse invitations. Stores only a lowercase SHA-256 token hash; raw survey tokens must never be persisted or logged.';

CREATE UNIQUE INDEX idx_contractor_pulse_one_active
    ON public.contractor_pulse_requests(contractor_id)
    WHERE status IN ('scheduled', 'sent');
CREATE INDEX idx_contractor_pulse_dispatch
    ON public.contractor_pulse_requests(scheduled_for)
    WHERE status = 'scheduled';
CREATE INDEX idx_contractor_pulse_source_check_in
    ON public.contractor_pulse_requests(source_check_in_id)
    WHERE source_check_in_id IS NOT NULL;
CREATE INDEX idx_contractor_pulse_reminders
    ON public.contractor_pulse_requests(next_reminder_at)
    WHERE status = 'sent' AND next_reminder_at IS NOT NULL;
CREATE INDEX idx_contractor_pulse_expiry
    ON public.contractor_pulse_requests(expires_at)
    WHERE status = 'sent';

CREATE TRIGGER contractor_pulse_requests_updated_at
    BEFORE UPDATE ON public.contractor_pulse_requests
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contractor_pulse_responses (
    request_id             UUID PRIMARY KEY
                           REFERENCES public.contractor_pulse_requests(id) ON DELETE CASCADE,
    satisfaction_score     SMALLINT NOT NULL CHECK (satisfaction_score BETWEEN 0 AND 10),
    engagement_score       SMALLINT NOT NULL CHECK (engagement_score BETWEEN 1 AND 5),
    recommendation_score   SMALLINT NOT NULL CHECK (recommendation_score BETWEEN 0 AND 10),
    note                   TEXT CHECK (note IS NULL OR length(note) <= 5000),
    submitted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.contractor_pulse_responses IS
    'One immutable pulse response per request. No IP address, raw token, or user-agent is stored.';

-- ─── 6. Append-only health status history ─────────────────────────────────

CREATE TABLE public.contractor_health_status_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id       UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
    previous_status     TEXT CHECK (previous_status IN ('unknown', 'green', 'amber', 'red')),
    new_status          TEXT NOT NULL CHECK (new_status IN ('unknown', 'green', 'amber', 'red')),
    reason              TEXT,
    previous_review_on  DATE,
    new_review_on       DATE,
    source_type         TEXT NOT NULL CHECK (source_type IN (
                            'manual', 'check_in', 'client_feedback', 'pulse', 'system'
                        )),
    source_id           UUID,
    changed_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.contractor_health_status_history IS
    'Append-only audit history for contractor health status/reason/review-date changes.';

CREATE INDEX idx_contractor_health_history_contractor
    ON public.contractor_health_status_history(contractor_id, created_at DESC);

-- ─── 7. Durable delivery outbox and scheduler state ───────────────────────

CREATE TABLE public.contractor_success_deliveries (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dedupe_key                TEXT NOT NULL CHECK (length(BTRIM(dedupe_key)) BETWEEN 3 AND 300),
    contractor_id             UUID REFERENCES public.contractors(id) ON DELETE CASCADE,
    entity_id                 UUID NOT NULL,
    delivery_kind             TEXT NOT NULL CHECK (delivery_kind IN (
                                  'check_in_due', 'task_due', 'conversation_follow_up',
                                  'pulse_invitation', 'pulse_reminder', 'pulse_low_alert', 'health_review'
                              )),
    channel                   TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'push')),
    recipient_user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_email           TEXT,
    payload                   JSONB NOT NULL DEFAULT '{}'::JSONB
                              CHECK (jsonb_typeof(payload) = 'object'),
    status                    TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                                  'pending', 'processing', 'retry', 'sent', 'dead',
                                  'skipped_no_subscription', 'cancelled'
                              )),
    available_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at                TIMESTAMPTZ,
    claimed_by                TEXT,
    lease_expires_at          TIMESTAMPTZ,
    attempt_count             INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts              INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 25),
    last_error                TEXT,
    sent_at                   TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT contractor_success_delivery_recipient_check CHECK (
        (channel = 'email' AND NULLIF(BTRIM(recipient_email), '') IS NOT NULL)
        OR (channel IN ('in_app', 'push') AND recipient_user_id IS NOT NULL)
    ),
    CONSTRAINT contractor_success_delivery_processing_check CHECK (
        status <> 'processing'
        OR (claimed_at IS NOT NULL AND claimed_by IS NOT NULL AND lease_expires_at IS NOT NULL)
    ),
    CONSTRAINT contractor_success_delivery_sent_check CHECK (
        status <> 'sent' OR sent_at IS NOT NULL
    ),
    CONSTRAINT contractor_success_deliveries_dedupe_unique UNIQUE (dedupe_key, channel)
);

COMMENT ON TABLE public.contractor_success_deliveries IS
    'Service-only transactional outbox for idempotent contractor-success reminders and alerts.';

CREATE INDEX idx_contractor_success_deliveries_claim
    ON public.contractor_success_deliveries(status, available_at, created_at)
    WHERE status IN ('pending', 'retry');
CREATE INDEX idx_contractor_success_deliveries_expired_lease
    ON public.contractor_success_deliveries(lease_expires_at)
    WHERE status = 'processing';
CREATE INDEX idx_contractor_success_deliveries_contractor
    ON public.contractor_success_deliveries(contractor_id, created_at DESC)
    WHERE contractor_id IS NOT NULL;
CREATE INDEX idx_contractor_success_deliveries_entity
    ON public.contractor_success_deliveries(delivery_kind, entity_id);

CREATE TRIGGER contractor_success_deliveries_updated_at
    BEFORE UPDATE ON public.contractor_success_deliveries
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contractor_success_job_state (
    job_name            TEXT PRIMARY KEY CHECK (length(BTRIM(job_name)) BETWEEN 2 AND 120),
    cursor              JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(cursor) = 'object'),
    last_started_at     TIMESTAMPTZ,
    last_completed_at   TIMESTAMPTZ,
    last_success_at     TIMESTAMPTZ,
    last_error_at       TIMESTAMPTZ,
    last_error          TEXT,
    lease_owner         TEXT,
    lease_expires_at    TIMESTAMPTZ,
    run_count           BIGINT NOT NULL DEFAULT 0 CHECK (run_count >= 0),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.contractor_success_job_state IS
    'Service-only cursor and lease state for idempotent contractor-success planner/dispatcher jobs.';

CREATE TRIGGER contractor_success_job_state_updated_at
    BEFORE UPDATE ON public.contractor_success_job_state
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contractor_pulse_rate_limits (
    bucket_key          TEXT PRIMARY KEY CHECK (bucket_key ~ '^[0-9a-f]{64}$'),
    window_started_at   TIMESTAMPTZ NOT NULL,
    attempts            INTEGER NOT NULL CHECK (attempts >= 0),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.contractor_pulse_rate_limits IS
    'Service-only durable rate-limit buckets. bucket_key is an application-generated hash; raw IP/token data is forbidden.';

-- ─── 8. Extend contractor tasks and backfill legacy rows ──────────────────

ALTER TABLE public.contractor_tasks
    ADD COLUMN IF NOT EXISTS task_kind TEXT,
    ADD COLUMN IF NOT EXISTS priority TEXT,
    ADD COLUMN IF NOT EXISTS source_check_in_id UUID
        REFERENCES public.contractor_check_ins(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_feedback_id UUID
        REFERENCES public.contractor_client_feedback(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_conversation_id UUID
        REFERENCES public.contractor_conversations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS original_due_date DATE,
    ADD COLUMN IF NOT EXISTS snoozed_until DATE,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS outcome TEXT;

ALTER TABLE public.contractor_tasks
    DROP CONSTRAINT IF EXISTS contractor_tasks_status_check;
ALTER TABLE public.contractor_tasks
    ADD CONSTRAINT contractor_tasks_status_check
    CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled'));

UPDATE public.contractor_tasks
SET
    task_kind = COALESCE(
        task_kind,
        CASE WHEN source_ticket_id IS NOT NULL THEN 'ticket_task' ELSE 'general_tcm' END
    ),
    priority = COALESCE(priority, 'normal'),
    original_due_date = COALESCE(original_due_date, due_date),
    completed_at = CASE
        WHEN status IN ('done', 'cancelled') THEN COALESCE(completed_at, updated_at, created_at)
        ELSE NULL
    END;

ALTER TABLE public.contractor_tasks
    ALTER COLUMN task_kind SET DEFAULT 'general_tcm',
    ALTER COLUMN task_kind SET NOT NULL,
    ALTER COLUMN priority SET DEFAULT 'normal',
    ALTER COLUMN priority SET NOT NULL,
    ADD CONSTRAINT contractor_tasks_task_kind_check CHECK (task_kind IN (
        'success_action', 'development_recommendation', 'conversation_follow_up',
        'ticket_task', 'general_tcm'
    )),
    ADD CONSTRAINT contractor_tasks_priority_check CHECK (
        priority IN ('low', 'normal', 'high', 'urgent')
    );

CREATE INDEX idx_contractor_tasks_source_check_in
    ON public.contractor_tasks(source_check_in_id)
    WHERE source_check_in_id IS NOT NULL;
CREATE INDEX idx_contractor_tasks_source_feedback
    ON public.contractor_tasks(source_feedback_id)
    WHERE source_feedback_id IS NOT NULL;
CREATE INDEX idx_contractor_tasks_source_conversation
    ON public.contractor_tasks(source_conversation_id)
    WHERE source_conversation_id IS NOT NULL;
CREATE INDEX idx_contractor_tasks_effective_due
    ON public.contractor_tasks((COALESCE(snoozed_until, due_date)))
    WHERE status NOT IN ('done', 'cancelled');

CREATE OR REPLACE FUNCTION public.normalize_contractor_task_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.original_due_date IS NULL THEN
        NEW.original_due_date := NEW.due_date;
    ELSIF TG_OP = 'UPDATE' AND NEW.original_due_date IS NULL THEN
        NEW.original_due_date := COALESCE(OLD.original_due_date, OLD.due_date, NEW.due_date);
    END IF;

    IF NEW.status IN ('done', 'cancelled') THEN
        NEW.completed_at := COALESCE(NEW.completed_at, NOW());
    ELSE
        NEW.completed_at := NULL;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_contractor_task_completion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS contractor_tasks_normalize_completion ON public.contractor_tasks;
CREATE TRIGGER contractor_tasks_normalize_completion
    BEFORE INSERT OR UPDATE OF status, due_date, original_due_date, completed_at
    ON public.contractor_tasks
    FOR EACH ROW EXECUTE FUNCTION public.normalize_contractor_task_completion();

-- ─── 9. Default inactive settings for existing and future contractors ─────

CREATE OR REPLACE FUNCTION public.normalize_contractor_monitoring_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := COALESCE(auth.uid(), NEW.updated_by, NEW.created_by);
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.monitoring_status = 'active' THEN
            NEW.monitoring_started_at := COALESCE(NEW.monitoring_started_at, NOW());
            NEW.monitoring_started_by := COALESCE(NEW.monitoring_started_by, v_actor);
            NEW.monitoring_paused_at := NULL;
            NEW.monitoring_paused_by := NULL;
        ELSIF NEW.monitoring_status = 'paused' THEN
            NEW.monitoring_paused_at := COALESCE(NEW.monitoring_paused_at, NOW());
            NEW.monitoring_paused_by := COALESCE(NEW.monitoring_paused_by, v_actor);
        END IF;
    ELSIF OLD.monitoring_status IS DISTINCT FROM NEW.monitoring_status THEN
        IF NEW.monitoring_status = 'active' THEN
            NEW.monitoring_started_at := NOW();
            NEW.monitoring_started_by := v_actor;
            NEW.monitoring_paused_at := NULL;
            NEW.monitoring_paused_by := NULL;
        ELSIF NEW.monitoring_status = 'paused' THEN
            NEW.monitoring_paused_at := NOW();
            NEW.monitoring_paused_by := v_actor;
        ELSE
            NEW.monitoring_paused_at := NULL;
            NEW.monitoring_paused_by := NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_contractor_monitoring_metadata()
    FROM PUBLIC, anon, authenticated;

CREATE TRIGGER contractor_success_settings_monitoring_metadata
    BEFORE INSERT OR UPDATE ON public.contractor_success_settings
    FOR EACH ROW EXECUTE FUNCTION public.normalize_contractor_monitoring_metadata();

CREATE OR REPLACE FUNCTION public.ensure_contractor_success_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.contractor_success_settings (
        contractor_id,
        monitoring_status,
        health_status,
        health_status_source,
        created_by,
        updated_by
    ) VALUES (
        NEW.id,
        'inactive',
        'unknown',
        'system',
        COALESCE(NEW.imported_by, auth.uid()),
        COALESCE(NEW.imported_by, auth.uid())
    )
    ON CONFLICT (contractor_id) DO NOTHING;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_contractor_success_settings() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS contractors_ensure_success_settings ON public.contractors;
CREATE TRIGGER contractors_ensure_success_settings
    AFTER INSERT ON public.contractors
    FOR EACH ROW EXECUTE FUNCTION public.ensure_contractor_success_settings();

INSERT INTO public.contractor_success_settings (
    contractor_id,
    monitoring_status,
    health_status,
    health_status_source
)
SELECT id, 'inactive', 'unknown', 'system'
FROM public.contractors
ON CONFLICT (contractor_id) DO NOTHING;

-- ─── 10. RLS and least-privilege Data API grants ──────────────────────────

ALTER TABLE public.contractor_success_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_success_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_check_ins FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_client_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_client_feedback FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_pulse_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_pulse_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_pulse_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_pulse_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_health_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_health_status_history FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_success_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_success_deliveries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_success_job_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_success_job_state FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_pulse_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_pulse_rate_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY contractor_success_settings_select_lifecycle
    ON public.contractor_success_settings FOR SELECT TO authenticated
    USING ((SELECT public.has_lifecycle_access()));
CREATE POLICY contractor_success_settings_insert_lifecycle
    ON public.contractor_success_settings FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.has_lifecycle_access()));
CREATE POLICY contractor_success_settings_update_lifecycle
    ON public.contractor_success_settings FOR UPDATE TO authenticated
    USING ((SELECT public.has_lifecycle_access()))
    WITH CHECK ((SELECT public.has_lifecycle_access()));

CREATE POLICY contractor_check_ins_select_lifecycle
    ON public.contractor_check_ins FOR SELECT TO authenticated
    USING ((SELECT public.has_lifecycle_access()));
CREATE POLICY contractor_check_ins_insert_lifecycle
    ON public.contractor_check_ins FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.has_lifecycle_access()));
CREATE POLICY contractor_check_ins_update_lifecycle
    ON public.contractor_check_ins FOR UPDATE TO authenticated
    USING ((SELECT public.has_lifecycle_access()))
    WITH CHECK ((SELECT public.has_lifecycle_access()));

CREATE POLICY contractor_client_feedback_select_lifecycle
    ON public.contractor_client_feedback FOR SELECT TO authenticated
    USING ((SELECT public.has_lifecycle_access()));
CREATE POLICY contractor_client_feedback_insert_lifecycle
    ON public.contractor_client_feedback FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.has_lifecycle_access()));
CREATE POLICY contractor_client_feedback_update_lifecycle
    ON public.contractor_client_feedback FOR UPDATE TO authenticated
    USING ((SELECT public.has_lifecycle_access()))
    WITH CHECK ((SELECT public.has_lifecycle_access()));

CREATE POLICY contractor_pulse_requests_select_lifecycle
    ON public.contractor_pulse_requests FOR SELECT TO authenticated
    USING ((SELECT public.has_lifecycle_access()));
CREATE POLICY contractor_pulse_requests_insert_lifecycle
    ON public.contractor_pulse_requests FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.has_lifecycle_access()));
CREATE POLICY contractor_pulse_requests_update_lifecycle
    ON public.contractor_pulse_requests FOR UPDATE TO authenticated
    USING ((SELECT public.has_lifecycle_access()))
    WITH CHECK ((SELECT public.has_lifecycle_access()));

CREATE POLICY contractor_pulse_responses_select_lifecycle
    ON public.contractor_pulse_responses FOR SELECT TO authenticated
    USING ((SELECT public.has_lifecycle_access()));

CREATE POLICY contractor_health_history_select_lifecycle
    ON public.contractor_health_status_history FOR SELECT TO authenticated
    USING ((SELECT public.has_lifecycle_access()));

-- Operational tables intentionally have no authenticated/anon policies.
REVOKE ALL ON TABLE
    public.contractor_success_settings,
    public.contractor_check_ins,
    public.contractor_client_feedback,
    public.contractor_pulse_requests,
    public.contractor_pulse_responses,
    public.contractor_health_status_history,
    public.contractor_success_deliveries,
    public.contractor_success_job_state,
    public.contractor_pulse_rate_limits
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE
    public.contractor_success_settings,
    public.contractor_check_ins,
    public.contractor_client_feedback,
    public.contractor_pulse_requests
TO authenticated;
GRANT SELECT ON TABLE
    public.contractor_pulse_responses,
    public.contractor_health_status_history
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.contractor_success_settings,
    public.contractor_check_ins,
    public.contractor_client_feedback,
    public.contractor_pulse_requests,
    public.contractor_success_deliveries,
    public.contractor_success_job_state,
    public.contractor_pulse_rate_limits
TO service_role;
GRANT SELECT, INSERT ON TABLE public.contractor_pulse_responses TO service_role;
GRANT SELECT, INSERT ON TABLE public.contractor_health_status_history TO service_role;

REVOKE ALL ON TABLE public.contractor_tasks FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contractor_tasks TO authenticated, service_role;

-- ─── 11. Append-only health and audit triggers ────────────────────────────

CREATE OR REPLACE FUNCTION public.record_contractor_health_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.health_status IS DISTINCT FROM NEW.health_status
       OR OLD.health_status_reason IS DISTINCT FROM NEW.health_status_reason
       OR OLD.health_review_on IS DISTINCT FROM NEW.health_review_on THEN
        INSERT INTO public.contractor_health_status_history (
            contractor_id,
            previous_status,
            new_status,
            reason,
            previous_review_on,
            new_review_on,
            source_type,
            source_id,
            changed_by
        ) VALUES (
            NEW.contractor_id,
            OLD.health_status,
            NEW.health_status,
            NEW.health_status_reason,
            OLD.health_review_on,
            NEW.health_review_on,
            NEW.health_status_source,
            NEW.health_status_source_id,
            COALESCE(auth.uid(), NEW.health_status_set_by, NEW.health_reviewed_by, NEW.updated_by)
        );

        INSERT INTO public.audit_logs (user_id, action, details)
        VALUES (
            COALESCE(auth.uid(), NEW.health_status_set_by, NEW.health_reviewed_by, NEW.updated_by),
            'CONSULTANT_SUCCESS_HEALTH_STATUS_CHANGED',
            jsonb_build_object(
                'contractor_id', NEW.contractor_id,
                'previous_status', OLD.health_status,
                'new_status', NEW.health_status,
                'previous_review_on', OLD.health_review_on,
                'new_review_on', NEW.health_review_on,
                'source_type', NEW.health_status_source,
                'source_id', NEW.health_status_source_id
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_contractor_health_status_history() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER contractor_success_settings_health_history
    AFTER UPDATE OF health_status, health_status_reason, health_review_on
    ON public.contractor_success_settings
    FOR EACH ROW EXECUTE FUNCTION public.record_contractor_health_status_history();

CREATE OR REPLACE FUNCTION public.prevent_contractor_health_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'contractor_health_status_history is append-only';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_contractor_health_history_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER contractor_health_history_immutable
    BEFORE UPDATE ON public.contractor_health_status_history
    FOR EACH ROW EXECUTE FUNCTION public.prevent_contractor_health_history_mutation();

CREATE OR REPLACE FUNCTION public.audit_contractor_check_in_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_action_step_count INTEGER;
BEGIN
    IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
        SELECT count(*)::INTEGER
        INTO v_action_step_count
        FROM public.contractor_tasks
        WHERE source_check_in_id = NEW.id;

        INSERT INTO public.audit_logs (user_id, action, details)
        VALUES (
            COALESCE(NEW.completed_by, auth.uid()),
            'CONSULTANT_SUCCESS_CHECK_IN_COMPLETED',
            jsonb_build_object(
                'check_in_id', NEW.id,
                'contractor_id', NEW.contractor_id,
                'scheduled_at', NEW.scheduled_at,
                'scheduled_for', NEW.scheduled_for,
                'completed_at', NEW.completed_at,
                'next_check_in_on', NEW.next_check_in_on,
                'health_status', NEW.health_status,
                'action_step_count', v_action_step_count
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_contractor_check_in_completion() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER contractor_check_ins_completion_audit
    AFTER UPDATE OF status ON public.contractor_check_ins
    FOR EACH ROW EXECUTE FUNCTION public.audit_contractor_check_in_completion();

-- ─── 12. Atomic authenticated check-in completion ─────────────────────────

CREATE OR REPLACE FUNCTION public.complete_contractor_check_in(
    p_check_in_id UUID,
    p_summary TEXT,
    p_notes TEXT DEFAULT NULL,
    p_health_status TEXT DEFAULT NULL,
    p_health_status_reason TEXT DEFAULT NULL,
    p_health_review_on DATE DEFAULT NULL,
    p_next_check_in_on DATE DEFAULT NULL,
    p_action_steps JSONB DEFAULT '[]'::JSONB,
    p_occurred_at TIMESTAMPTZ DEFAULT NULL,
    p_channel TEXT DEFAULT NULL,
    p_duration_minutes INTEGER DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor                 UUID := auth.uid();
    v_now                   TIMESTAMPTZ := NOW();
    v_check_in              public.contractor_check_ins%ROWTYPE;
    v_settings              public.contractor_success_settings%ROWTYPE;
    v_action                JSONB;
    v_title                 TEXT;
    v_description           TEXT;
    v_task_kind             TEXT;
    v_priority              TEXT;
    v_due_date              DATE;
    v_assigned_tcm_id       UUID;
    v_task_id               UUID;
    v_created_task_ids      UUID[] := ARRAY[]::UUID[];
    v_next_check_in_on      DATE;
    v_result_health_status  TEXT;
BEGIN
    IF v_actor IS NULL OR NOT public.has_lifecycle_access() THEN
        RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;

    IF p_check_in_id IS NULL THEN
        RAISE EXCEPTION 'p_check_in_id is required' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(BTRIM(p_summary), '') IS NULL OR length(p_summary) > 20000 THEN
        RAISE EXCEPTION 'p_summary must contain 1..20000 characters' USING ERRCODE = '22023';
    END IF;
    IF p_notes IS NOT NULL AND length(p_notes) > 50000 THEN
        RAISE EXCEPTION 'p_notes cannot exceed 50000 characters' USING ERRCODE = '22023';
    END IF;
    IF p_health_status IS NOT NULL
       AND p_health_status NOT IN ('unknown', 'green', 'amber', 'red') THEN
        RAISE EXCEPTION 'Invalid p_health_status' USING ERRCODE = '22023';
    END IF;
    IF p_health_status IS NULL
       AND (p_health_status_reason IS NOT NULL OR p_health_review_on IS NOT NULL) THEN
        RAISE EXCEPTION 'Health reason/review date require p_health_status' USING ERRCODE = '22023';
    END IF;
    IF p_health_status IN ('amber', 'red')
       AND (
           NULLIF(BTRIM(p_health_status_reason), '') IS NULL
           OR p_health_review_on IS NULL
       ) THEN
        RAISE EXCEPTION 'Amber/red health requires reason and review date' USING ERRCODE = '22023';
    END IF;
    IF p_health_review_on IS NOT NULL AND p_health_review_on < CURRENT_DATE THEN
        RAISE EXCEPTION 'p_health_review_on cannot be in the past' USING ERRCODE = '22023';
    END IF;
    IF p_next_check_in_on IS NOT NULL AND p_next_check_in_on < CURRENT_DATE THEN
        RAISE EXCEPTION 'p_next_check_in_on cannot be in the past' USING ERRCODE = '22023';
    END IF;
    IF p_occurred_at IS NOT NULL AND p_occurred_at > v_now + INTERVAL '5 minutes' THEN
        RAISE EXCEPTION 'p_occurred_at cannot be in the future' USING ERRCODE = '22023';
    END IF;
    IF p_channel IS NOT NULL
       AND p_channel NOT IN ('phone', 'video', 'in_person', 'email', 'other') THEN
        RAISE EXCEPTION 'Invalid p_channel' USING ERRCODE = '22023';
    END IF;
    IF p_duration_minutes IS NOT NULL
       AND p_duration_minutes NOT BETWEEN 1 AND 1440 THEN
        RAISE EXCEPTION 'p_duration_minutes must be between 1 and 1440' USING ERRCODE = '22023';
    END IF;
    IF p_tags IS NOT NULL
       AND (cardinality(p_tags) > 20 OR array_position(p_tags, NULL) IS NOT NULL) THEN
        RAISE EXCEPTION 'p_tags accepts at most 20 non-null values' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(COALESCE(p_action_steps, '[]'::JSONB)) <> 'array' THEN
        RAISE EXCEPTION 'p_action_steps must be a JSON array' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(COALESCE(p_action_steps, '[]'::JSONB)) > 50 THEN
        RAISE EXCEPTION 'At most 50 action steps are allowed' USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_check_in
    FROM public.contractor_check_ins
    WHERE id = p_check_in_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Check-in not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_check_in.status NOT IN ('scheduled', 'in_progress') THEN
        RAISE EXCEPTION 'Only a scheduled or in-progress check-in can be completed' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(p_channel, v_check_in.channel) IS NULL THEN
        RAISE EXCEPTION 'A completed check-in requires channel' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.contractor_success_settings (
        contractor_id, monitoring_status, health_status, health_status_source,
        created_by, updated_by
    ) VALUES (
        v_check_in.contractor_id, 'inactive', 'unknown', 'system', v_actor, v_actor
    )
    ON CONFLICT (contractor_id) DO NOTHING;

    SELECT *
    INTO v_settings
    FROM public.contractor_success_settings
    WHERE contractor_id = v_check_in.contractor_id
    FOR UPDATE;

    v_next_check_in_on := COALESCE(
        p_next_check_in_on,
        CURRENT_DATE + v_settings.check_in_cadence_days
    );

    FOR v_action IN
        SELECT value FROM jsonb_array_elements(COALESCE(p_action_steps, '[]'::JSONB))
    LOOP
        IF jsonb_typeof(v_action) <> 'object' THEN
            RAISE EXCEPTION 'Every action step must be a JSON object' USING ERRCODE = '22023';
        END IF;

        v_title := NULLIF(BTRIM(v_action ->> 'title'), '');
        v_description := NULLIF(v_action ->> 'description', '');
        v_task_kind := COALESCE(NULLIF(v_action ->> 'task_kind', ''), 'success_action');
        v_priority := COALESCE(NULLIF(v_action ->> 'priority', ''), 'normal');
        v_due_date := CASE
            WHEN NULLIF(v_action ->> 'due_date', '') IS NULL THEN NULL
            ELSE (v_action ->> 'due_date')::DATE
        END;
        v_assigned_tcm_id := CASE
            WHEN NULLIF(v_action ->> 'assigned_tcm_id', '') IS NULL THEN v_actor
            ELSE (v_action ->> 'assigned_tcm_id')::UUID
        END;

        IF v_title IS NULL OR length(v_title) < 2 OR length(v_title) > 250 THEN
            RAISE EXCEPTION 'Action-step title must contain 2..250 characters' USING ERRCODE = '22023';
        END IF;
        IF v_description IS NOT NULL AND length(v_description) > 20000 THEN
            RAISE EXCEPTION 'Action-step description cannot exceed 20000 characters' USING ERRCODE = '22023';
        END IF;
        IF v_task_kind NOT IN (
            'success_action', 'development_recommendation', 'conversation_follow_up',
            'ticket_task', 'general_tcm'
        ) THEN
            RAISE EXCEPTION 'Invalid action-step task_kind' USING ERRCODE = '22023';
        END IF;
        IF v_task_kind = 'ticket_task' THEN
            RAISE EXCEPTION 'Check-in action steps cannot be ticket_task' USING ERRCODE = '22023';
        END IF;
        IF v_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
            RAISE EXCEPTION 'Invalid action-step priority' USING ERRCODE = '22023';
        END IF;
        IF v_due_date IS NOT NULL AND v_due_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Action-step due_date cannot be in the past' USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = v_assigned_tcm_id
              AND role::TEXT IN ('admin', 'talent_community')
        ) THEN
            RAISE EXCEPTION 'Action step assignee must be admin or talent_community' USING ERRCODE = '22023';
        END IF;

        INSERT INTO public.contractor_tasks (
            contractor_id,
            title,
            description,
            status,
            assigned_tcm_id,
            due_date,
            created_by,
            task_kind,
            priority,
            source_check_in_id,
            original_due_date
        ) VALUES (
            v_check_in.contractor_id,
            v_title,
            v_description,
            'todo',
            v_assigned_tcm_id,
            v_due_date,
            v_actor,
            v_task_kind,
            v_priority,
            v_check_in.id,
            v_due_date
        )
        RETURNING id INTO v_task_id;

        v_created_task_ids := array_append(v_created_task_ids, v_task_id);
    END LOOP;

    UPDATE public.contractor_success_settings
    SET
        monitoring_status = CASE
            WHEN monitoring_status = 'inactive' THEN 'active'
            ELSE monitoring_status
        END,
        status_verified_at = v_now,
        status_verified_by = v_actor,
        next_check_in_on = v_next_check_in_on,
        health_status = CASE
            WHEN p_health_status IS NULL THEN health_status
            ELSE p_health_status
        END,
        health_status_reason = CASE
            WHEN p_health_status IS NULL THEN health_status_reason
            ELSE NULLIF(BTRIM(p_health_status_reason), '')
        END,
        health_review_on = CASE
            WHEN p_health_status IS NULL THEN health_review_on
            ELSE p_health_review_on
        END,
        health_status_source = CASE
            WHEN p_health_status IS NULL THEN health_status_source
            ELSE 'check_in'
        END,
        health_status_source_id = CASE
            WHEN p_health_status IS NULL THEN health_status_source_id
            ELSE v_check_in.id
        END,
        health_reviewed_at = CASE
            WHEN p_health_status IS NULL THEN health_reviewed_at
            ELSE v_now
        END,
        health_reviewed_by = CASE
            WHEN p_health_status IS NULL THEN health_reviewed_by
            ELSE v_actor
        END,
        health_status_set_at = CASE
            WHEN p_health_status IS NULL THEN health_status_set_at
            ELSE v_now
        END,
        health_status_set_by = CASE
            WHEN p_health_status IS NULL THEN health_status_set_by
            ELSE v_actor
        END,
        updated_by = v_actor
    WHERE contractor_id = v_check_in.contractor_id
    RETURNING health_status INTO v_result_health_status;

    UPDATE public.contractor_check_ins
    SET
        status = 'completed',
        occurred_at = COALESCE(p_occurred_at, occurred_at, v_now),
        assigned_tcm_id = COALESCE(assigned_tcm_id, v_actor),
        channel = COALESCE(p_channel, channel),
        duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
        tags = COALESCE(p_tags, tags),
        completed_at = v_now,
        completed_by = v_actor,
        summary = BTRIM(p_summary),
        notes = NULLIF(p_notes, ''),
        health_status = p_health_status,
        health_status_reason = NULLIF(BTRIM(p_health_status_reason), ''),
        health_review_on = p_health_review_on,
        next_check_in_on = v_next_check_in_on,
        updated_by = v_actor
    WHERE id = v_check_in.id;

    RETURN jsonb_build_object(
        'check_in_id', v_check_in.id,
        'contractor_id', v_check_in.contractor_id,
        'completed_at', v_now,
        'next_check_in_on', v_next_check_in_on,
        'health_status', v_result_health_status,
        'created_task_ids', to_jsonb(v_created_task_ids)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_contractor_check_in(
    UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE, JSONB, TIMESTAMPTZ, TEXT, INTEGER, TEXT[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_contractor_check_in(
    UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE, JSONB, TIMESTAMPTZ, TEXT, INTEGER, TEXT[]
) TO authenticated;

COMMENT ON FUNCTION public.complete_contractor_check_in(
    UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE, JSONB, TIMESTAMPTZ, TEXT, INTEGER, TEXT[]
) IS 'SECURITY INVOKER: atomically completes a private TCM check-in, creates validated action-step tasks, advances cadence, and records health history/audit.';

-- ─── 13. Service-only pulse rate limit and submission RPCs ────────────────

CREATE OR REPLACE FUNCTION public.consume_contractor_pulse_rate_limit(
    p_bucket_key TEXT,
    p_max_attempts INTEGER DEFAULT 10,
    p_window_minutes INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now       TIMESTAMPTZ := clock_timestamp();
    v_allowed   BOOLEAN;
BEGIN
    p_max_attempts := COALESCE(p_max_attempts, 10);
    p_window_minutes := COALESCE(p_window_minutes, 60);

    IF p_bucket_key IS NULL OR p_bucket_key !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'p_bucket_key must be a lowercase SHA-256 hex digest' USING ERRCODE = '22023';
    END IF;
    IF p_max_attempts < 1 OR p_max_attempts > 1000 THEN
        RAISE EXCEPTION 'p_max_attempts must be between 1 and 1000' USING ERRCODE = '22023';
    END IF;
    IF p_window_minutes < 1 OR p_window_minutes > 10080 THEN
        RAISE EXCEPTION 'p_window_minutes must be between 1 and 10080' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.contractor_pulse_rate_limits AS rate_limit (
        bucket_key, window_started_at, attempts, updated_at
    ) VALUES (
        p_bucket_key, v_now, 1, v_now
    )
    ON CONFLICT (bucket_key) DO UPDATE
    SET
        window_started_at = CASE
            WHEN rate_limit.window_started_at <= v_now - make_interval(mins => p_window_minutes)
                THEN v_now
            ELSE rate_limit.window_started_at
        END,
        attempts = CASE
            WHEN rate_limit.window_started_at <= v_now - make_interval(mins => p_window_minutes)
                THEN 1
            ELSE rate_limit.attempts + 1
        END,
        updated_at = v_now
    RETURNING attempts <= p_max_attempts INTO v_allowed;

    RETURN v_allowed;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_contractor_pulse_rate_limit(TEXT, INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_contractor_pulse_rate_limit(TEXT, INTEGER, INTEGER)
    TO service_role;

CREATE OR REPLACE FUNCTION public.submit_contractor_pulse_response(
    p_token_hash TEXT,
    p_satisfaction INTEGER,
    p_engagement INTEGER,
    p_recommendation INTEGER,
    p_note TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_request         public.contractor_pulse_requests%ROWTYPE;
    v_now             TIMESTAMPTZ := clock_timestamp();
    v_owner_id        UUID;
    v_owner_email     TEXT;
    v_contractor_name TEXT;
BEGIN
    IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
        RETURN FALSE;
    END IF;
    IF p_satisfaction IS NULL
       OR p_engagement IS NULL
       OR p_recommendation IS NULL
       OR p_satisfaction NOT BETWEEN 0 AND 10
       OR p_engagement NOT BETWEEN 1 AND 5
       OR p_recommendation NOT BETWEEN 0 AND 10 THEN
        RAISE EXCEPTION 'Pulse scores are outside their allowed ranges' USING ERRCODE = '22023';
    END IF;
    IF p_note IS NOT NULL AND length(p_note) > 5000 THEN
        RAISE EXCEPTION 'p_note cannot exceed 5000 characters' USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_request
    FROM public.contractor_pulse_requests
    WHERE token_hash = p_token_hash
    FOR UPDATE;

    IF NOT FOUND
       OR v_request.status <> 'sent'
       OR v_request.expires_at <= v_now
       OR EXISTS (
           SELECT 1 FROM public.contractor_pulse_responses
           WHERE request_id = v_request.id
       ) THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.contractor_pulse_responses (
        request_id,
        satisfaction_score,
        engagement_score,
        recommendation_score,
        note,
        submitted_at
    ) VALUES (
        v_request.id,
        p_satisfaction,
        p_engagement,
        p_recommendation,
        NULLIF(BTRIM(p_note), ''),
        v_now
    );

    UPDATE public.contractor_pulse_requests
    SET status = 'completed', responded_at = v_now, updated_at = v_now
    WHERE id = v_request.id;

    -- A low response creates the alert outbox immediately. The dispatcher still
    -- revalidates monitoring/recipient state before sending, and the daily
    -- planner may safely rediscover it because dedupe is per event + channel.
    IF p_satisfaction <= 4 OR p_engagement <= 2 OR p_recommendation <= 4 THEN
        SELECT contractor.owner_tcm_id, profile.email, contractor.full_name
        INTO v_owner_id, v_owner_email, v_contractor_name
        FROM public.contractors AS contractor
        LEFT JOIN public.profiles AS profile
          ON profile.id = contractor.owner_tcm_id
         AND profile.role::TEXT IN ('admin', 'talent_community')
        WHERE contractor.id = v_request.contractor_id;

        IF v_owner_id IS NOT NULL THEN
            INSERT INTO public.contractor_success_deliveries (
                dedupe_key,
                contractor_id,
                entity_id,
                delivery_kind,
                channel,
                recipient_user_id,
                recipient_email,
                payload,
                status,
                available_at
            )
            SELECT
                'survey:' || v_request.id || ':low',
                v_request.contractor_id,
                v_request.id,
                'pulse_low_alert',
                channel.value,
                v_owner_id,
                CASE WHEN channel.value = 'email' THEN v_owner_email ELSE NULL END,
                jsonb_build_object(
                    'milestone', 'low',
                    'title_pl', 'Consultant Success — niski pulse',
                    'title_en', 'Consultant Success — low pulse',
                    'body_pl', COALESCE(v_contractor_name, 'Konsultant') ||
                        ' — nowa odpowiedź pulse wymaga ręcznego przeglądu. Termin: ' ||
                        (v_now AT TIME ZONE 'Europe/Warsaw')::DATE || '.',
                    'body_en', COALESCE(v_contractor_name, 'Consultant') ||
                        ' — a new pulse response needs a manual review. Due: ' ||
                        (v_now AT TIME ZONE 'Europe/Warsaw')::DATE || '.',
                    'action_url', '/internal/people/success/consultants/' ||
                        v_request.contractor_id || '?tab=feedback&focus=' || v_request.id,
                    'priority', 'urgent',
                    'event_date', v_now,
                    'due_on', (v_now AT TIME ZONE 'Europe/Warsaw')::DATE
                ),
                'pending',
                v_now
            FROM (VALUES ('in_app'), ('email'), ('push')) AS channel(value)
            WHERE channel.value <> 'email' OR NULLIF(BTRIM(v_owner_email), '') IS NOT NULL
            ON CONFLICT (dedupe_key, channel) DO NOTHING;
        END IF;
    END IF;

    INSERT INTO public.audit_logs (user_id, action, details)
    VALUES (
        NULL,
        'CONSULTANT_SUCCESS_PULSE_RESPONDED',
        jsonb_build_object(
            'request_id', v_request.id,
            'contractor_id', v_request.contractor_id
        )
    );

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contractor_pulse_response(TEXT, INTEGER, INTEGER, INTEGER, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_contractor_pulse_response(TEXT, INTEGER, INTEGER, INTEGER, TEXT)
    TO service_role;

-- ─── 14. Service-only concurrent delivery claim RPC ──────────────────────

CREATE OR REPLACE FUNCTION public.claim_contractor_success_deliveries(
    p_worker_id TEXT,
    p_limit INTEGER DEFAULT 50,
    p_lease_seconds INTEGER DEFAULT 300
)
RETURNS SETOF public.contractor_success_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now            TIMESTAMPTZ := clock_timestamp();
    v_limit          INTEGER;
    v_lease_seconds  INTEGER;
BEGIN
    IF NULLIF(BTRIM(p_worker_id), '') IS NULL OR length(p_worker_id) > 200 THEN
        RAISE EXCEPTION 'p_worker_id must contain 1..200 characters' USING ERRCODE = '22023';
    END IF;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
    v_lease_seconds := LEAST(GREATEST(COALESCE(p_lease_seconds, 300), 30), 3600);

    -- Do not leave exhausted retry/expired-lease rows claimable forever.
    UPDATE public.contractor_success_deliveries
    SET
        status = 'dead',
        claimed_at = NULL,
        claimed_by = NULL,
        lease_expires_at = NULL,
        last_error = COALESCE(last_error, 'Maximum delivery attempts reached')
    WHERE attempt_count >= max_attempts
      AND (
          status IN ('pending', 'retry')
          OR (status = 'processing' AND lease_expires_at <= v_now)
      );

    RETURN QUERY
    WITH candidates AS (
        SELECT delivery.id
        FROM public.contractor_success_deliveries AS delivery
        WHERE delivery.attempt_count < delivery.max_attempts
          AND (
              (
                  delivery.status IN ('pending', 'retry')
                  AND delivery.available_at <= v_now
              )
              OR (
                  delivery.status = 'processing'
                  AND delivery.lease_expires_at <= v_now
              )
          )
        ORDER BY delivery.available_at, delivery.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT v_limit
    )
    UPDATE public.contractor_success_deliveries AS delivery
    SET
        status = 'processing',
        claimed_at = v_now,
        claimed_by = BTRIM(p_worker_id),
        lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
        attempt_count = delivery.attempt_count + 1
    FROM candidates
    WHERE delivery.id = candidates.id
    RETURNING delivery.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_contractor_success_deliveries(TEXT, INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_contractor_success_deliveries(TEXT, INTEGER, INTEGER)
    TO service_role;

-- ─── 15. Phase 37 mirror: only ticket_task remains a support ticket ───────

CREATE OR REPLACE FUNCTION public.sync_task_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cat UUID;
    v_admin UUID;
    v_task_id UUID;
BEGIN
    v_task_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.support_tickets AS ticket
        USING public.support_categories AS category
        WHERE ticket.id = OLD.id
          AND ticket.category_id = category.id
          AND category.slug = 'contractor_task';
        RETURN OLD;
    END IF;

    IF NEW.task_kind <> 'ticket_task' THEN
        DELETE FROM public.support_tickets AS ticket
        USING public.support_categories AS category
        WHERE ticket.id = NEW.id
          AND ticket.category_id = category.id
          AND category.slug = 'contractor_task';
        RETURN NEW;
    END IF;

    SELECT id INTO v_cat
    FROM public.support_categories
    WHERE slug = 'contractor_task';

    SELECT id INTO v_admin
    FROM public.profiles
    WHERE role::TEXT = 'admin'
    ORDER BY created_at
    LIMIT 1;

    INSERT INTO public.support_tickets (
        id, user_id, assignee_id, category_id, subject, body_md,
        status, priority, resolved_at, created_at, updated_at
    ) VALUES (
        NEW.id,
        COALESCE(NEW.created_by, NEW.assigned_tcm_id, v_admin),
        NEW.assigned_tcm_id,
        v_cat,
        left(NEW.title, 200),
        COALESCE(NEW.description, ''),
        CASE NEW.status
            WHEN 'done' THEN 'resolved'
            WHEN 'cancelled' THEN 'closed'
            WHEN 'in_progress' THEN 'in_progress'
            ELSE 'open'
        END,
        NEW.priority,
        CASE
            WHEN NEW.status IN ('done', 'cancelled') THEN COALESCE(NEW.completed_at, NEW.updated_at)
            ELSE NULL
        END,
        NEW.created_at,
        NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        assignee_id = EXCLUDED.assignee_id,
        category_id = EXCLUDED.category_id,
        subject = EXCLUDED.subject,
        body_md = EXCLUDED.body_md,
        status = EXCLUDED.status,
        priority = EXCLUDED.priority,
        resolved_at = EXCLUDED.resolved_at,
        updated_at = EXCLUDED.updated_at;

    INSERT INTO public.support_contractor_meta (
        ticket_id, kind, contractor_id, due_date, tcm_id,
        linked_ticket_id, source_task_id
    ) VALUES (
        NEW.id,
        'task',
        NEW.contractor_id,
        NEW.due_date,
        NEW.assigned_tcm_id,
        COALESCE(NEW.source_ticket_id, NEW.source_conversation_id),
        NEW.id
    )
    ON CONFLICT (ticket_id) DO UPDATE SET
        contractor_id = EXCLUDED.contractor_id,
        due_date = EXCLUDED.due_date,
        tcm_id = EXCLUDED.tcm_id,
        linked_ticket_id = EXCLUDED.linked_ticket_id,
        source_task_id = EXCLUDED.source_task_id;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_task_ticket failed for %: %', v_task_id, SQLERRM;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_task_ticket() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_task_ticket ON public.contractor_tasks;
CREATE TRIGGER trg_sync_task_ticket
    AFTER INSERT OR UPDATE OR DELETE ON public.contractor_tasks
    FOR EACH ROW EXECUTE FUNCTION public.sync_task_ticket();

-- Remove legacy Phase 37 mirrors for tasks that are now classified as private
-- Success Hub work rather than support tickets. Meta rows cascade with tickets.
DELETE FROM public.support_tickets AS ticket
USING public.contractor_tasks AS task, public.support_categories AS category
WHERE ticket.id = task.id
  AND ticket.category_id = category.id
  AND category.slug = 'contractor_task'
  AND task.task_kind <> 'ticket_task';

COMMENT ON COLUMN public.contractor_tasks.task_kind IS
    'Only ticket_task is mirrored to support_tickets. All other kinds remain private Success Hub work.';

COMMIT;
