-- ============================================================
-- Phase 34a — Contractor tasks (Talent Community department task list)
-- Date: 2026-06-07
--
-- Depends on:
--   - contractors (Phase 33a)
--   - support_tickets (Phase 10) — optional link when a task is spawned from an inbox ticket
--   - profiles (id, full_name)
--   - has_lifecycle_access() [phase22a] — admin OR talent_community
--   - update_updated_at_column() [touch trigger fn]
--
-- What:
--   contractor_tasks — a simple department task list for Talent Community ("zadania naokoło").
--   Department-wide by default (contractor_id NULL); may be pinned to a contractor and/or
--   spawned from an inbox ticket (source_ticket_id) so issues from administracja@ become
--   tracked tasks that outlive the ticket.
--
-- Visibility: TCM-only (has_lifecycle_access = admin OR talent_community).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS contractor_tasks (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- optional pin to a contractor (department-wide task when NULL)
    contractor_id    UUID REFERENCES contractors(id) ON DELETE SET NULL,
    -- optional link back to the inbox ticket the task was spawned from
    source_ticket_id UUID REFERENCES support_tickets(id) ON DELETE SET NULL,
    title            TEXT NOT NULL CHECK (length(trim(title)) >= 2),
    description      TEXT,
    status           TEXT NOT NULL DEFAULT 'todo'
                       CHECK (status IN ('todo', 'in_progress', 'done')),
    assigned_tcm_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    due_date         DATE,
    created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE contractor_tasks IS
    'Phase 34. Talent Community department task list. contractor_id/source_ticket_id optional (department-wide vs pinned to a contractor / spawned from an inbox ticket).';

CREATE INDEX IF NOT EXISTS idx_contractor_tasks_assigned   ON contractor_tasks(assigned_tcm_id);
CREATE INDEX IF NOT EXISTS idx_contractor_tasks_status     ON contractor_tasks(status);
CREATE INDEX IF NOT EXISTS idx_contractor_tasks_contractor ON contractor_tasks(contractor_id)    WHERE contractor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contractor_tasks_ticket     ON contractor_tasks(source_ticket_id) WHERE source_ticket_id IS NOT NULL;

DROP TRIGGER IF EXISTS contractor_tasks_updated_at ON contractor_tasks;
CREATE TRIGGER contractor_tasks_updated_at BEFORE UPDATE ON contractor_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: TCM-only (admin OR talent_community) for all operations.
ALTER TABLE contractor_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contractor_tasks_all_lifecycle" ON contractor_tasks;
CREATE POLICY "contractor_tasks_all_lifecycle" ON contractor_tasks
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

COMMIT;
