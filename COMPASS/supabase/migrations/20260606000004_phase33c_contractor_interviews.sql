-- ============================================================
-- Phase 33c — Contractor onboarding & exit interviews (replaces the 2 docx forms)
-- Date: 2026-06-06
--
-- Depends on:
--   - contractors (Phase 33a), placements (Phase 28a)
--   - has_lifecycle_access() [phase22a], update_updated_at_column()
--   - storage bucket 'lifecycle-docs' [phase22d] — existing policies already grant
--     has_lifecycle_access() users full access to ANY prefix, so NO new storage policy
--     is needed. App uploads under contractor-onboarding/{contractor_id}/ and
--     contractor-exit/{contractor_id}/. Attachments stored inline as JSONB.
--
-- Workflow (reuses Phase 22 exit-interview state machine, WITHOUT NPS validation):
--   scheduled → submitted → reviewed → archived
-- ============================================================

BEGIN;

-- ─── 1. Shared transition trigger (no field validation; free-text forms) ────
CREATE OR REPLACE FUNCTION enforce_contractor_interview_transitions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'scheduled' THEN
            RAISE EXCEPTION 'Nowy wywiad musi mieć status=scheduled (got: %)', NEW.status
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = NEW.status THEN
        RETURN NEW;  -- editing fields without status change
    END IF;

    IF OLD.status = 'scheduled' AND NEW.status = 'submitted' THEN
        IF NEW.submitted_at IS NULL THEN NEW.submitted_at := NOW(); END IF;
        RETURN NEW;
    END IF;
    IF OLD.status = 'submitted' AND NEW.status = 'reviewed' THEN
        IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL THEN
            RAISE EXCEPTION 'Reviewed wymaga reviewed_by + reviewed_at.' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.status = 'archived' AND OLD.status IN ('reviewed', 'submitted') THEN
        RETURN NEW;
    END IF;
    -- allow cancel from scheduled
    IF NEW.status = 'cancelled' AND OLD.status = 'scheduled' THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid contractor interview transition: % → %', OLD.status, NEW.status
        USING ERRCODE = 'P0001';
END;
$$;

-- ─── 2. contractor_onboarding_interviews (Onboarding Interview docx) ────────
CREATE TABLE IF NOT EXISTS contractor_onboarding_interviews (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id          UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    placement_id           UUID REFERENCES placements(id) ON DELETE SET NULL,
    -- snapshot (personal data section)
    position_snapshot      TEXT,
    client_snapshot        TEXT,
    start_date             DATE,
    -- Check-in po 1 dniu
    tcm_role_note          TEXT,   -- wytłumaczenie roli TCM + notatki do przekazania
    first_day_note         TEXT,   -- jak minął pierwszy dzień / czy onboarding był jasny
    client_manager_name    TEXT,   -- czy poznał managera (imię i nazwisko)
    equipment_note         TEXT,   -- jaki sprzęt / czy działa
    system_access_note     TEXT,   -- dostęp do systemów (VPN, poczta, aplikacje)
    duties_note            TEXT,   -- lista obowiązków / zgodna ze scope
    -- Check-in po 2 tygodniach
    work_note              TEXT,   -- jak się pracuje / jakie zadania
    manager_relation_note  TEXT,   -- jak się układa z managerem
    missing_resolved_note  TEXT,   -- czy braki uzupełnione
    positive_surprise      TEXT,
    negative_surprise      TEXT,
    doubts_note            TEXT,   -- wątpliwości / pytania
    -- Case Study
    side_projects_interest BOOLEAN,
    cs_challenge           TEXT,
    cs_solution            TEXT,
    cs_technologies        TEXT,
    cs_client              TEXT,
    cs_sector              TEXT,
    -- attachments (inline; files live in lifecycle-docs/contractor-onboarding/{contractor_id}/)
    attachments            JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- workflow
    status                 TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
        'scheduled', 'submitted', 'reviewed', 'archived', 'cancelled'
    )),
    scheduled_for          DATE,
    submitted_at           TIMESTAMPTZ,
    reviewed_by            UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at            TIMESTAMPTZ,
    reviewer_note          TEXT,
    created_by             UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE contractor_onboarding_interviews IS
    'Phase 33. Onboarding interview with a placed contractor (replaces "Forumlarz - Onboarding Interview.docx").';

CREATE INDEX IF NOT EXISTS idx_contractor_onb_contractor ON contractor_onboarding_interviews(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_onb_status ON contractor_onboarding_interviews(status);

DROP TRIGGER IF EXISTS contractor_onb_updated_at ON contractor_onboarding_interviews;
CREATE TRIGGER contractor_onb_updated_at BEFORE UPDATE ON contractor_onboarding_interviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_contractor_onb_transitions ON contractor_onboarding_interviews;
CREATE TRIGGER trg_contractor_onb_transitions BEFORE INSERT OR UPDATE ON contractor_onboarding_interviews
    FOR EACH ROW EXECUTE FUNCTION enforce_contractor_interview_transitions();

ALTER TABLE contractor_onboarding_interviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contractor_onb_all_lifecycle" ON contractor_onboarding_interviews;
CREATE POLICY "contractor_onb_all_lifecycle" ON contractor_onboarding_interviews
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

-- ─── 3. contractor_exit_interviews (Exit Interview docx) ────────────────────
CREATE TABLE IF NOT EXISTS contractor_exit_interviews (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id          UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    placement_id           UUID REFERENCES placements(id) ON DELETE SET NULL,
    -- snapshot (personal data section)
    position_snapshot      TEXT,
    client_snapshot        TEXT,
    start_date             DATE,
    end_date               DATE,
    -- Zejście
    formal_reason          TEXT,   -- powód zejścia (formalny)
    causes                 TEXT,   -- przyczyny (co doprowadziło)
    repair_potential       TEXT,   -- co można zrobić (potencjał naprawy)
    is_final               BOOLEAN,-- czy to ostateczna decyzja
    -- Rezultat
    can_retain_transfer    BOOLEAN,-- czy uda się utrzymać/przepiąć kandydata
    retain_transfer_note   TEXT,
    can_extend_departure   BOOLEAN,-- czy uda się wydłużyć okres zejścia
    extend_departure_note  TEXT,
    feedback_lessons       TEXT,   -- feedback / wnioski na przyszłość
    -- attachments
    attachments            JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- workflow
    status                 TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
        'scheduled', 'submitted', 'reviewed', 'archived', 'cancelled'
    )),
    scheduled_for          DATE,
    submitted_at           TIMESTAMPTZ,
    reviewed_by            UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at            TIMESTAMPTZ,
    reviewer_note          TEXT,
    created_by             UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE contractor_exit_interviews IS
    'Phase 33. Exit interview with a placed contractor (replaces "Forumlarz - Exit Interview.docx").';

CREATE INDEX IF NOT EXISTS idx_contractor_exit_contractor ON contractor_exit_interviews(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_exit_status ON contractor_exit_interviews(status);

DROP TRIGGER IF EXISTS contractor_exit_updated_at ON contractor_exit_interviews;
CREATE TRIGGER contractor_exit_updated_at BEFORE UPDATE ON contractor_exit_interviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_contractor_exit_transitions ON contractor_exit_interviews;
CREATE TRIGGER trg_contractor_exit_transitions BEFORE INSERT OR UPDATE ON contractor_exit_interviews
    FOR EACH ROW EXECUTE FUNCTION enforce_contractor_interview_transitions();

ALTER TABLE contractor_exit_interviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contractor_exit_all_lifecycle" ON contractor_exit_interviews;
CREATE POLICY "contractor_exit_all_lifecycle" ON contractor_exit_interviews
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

COMMIT;
