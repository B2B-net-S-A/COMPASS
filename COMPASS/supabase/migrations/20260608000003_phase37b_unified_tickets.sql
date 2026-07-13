-- ============================================================
-- Phase 36b — Unified "Zgłoszenia": fold contractor conversations + tasks into support_tickets
-- Date: 2026-06-04
--
-- support_tickets already backs BOTH the consultant helpdesk (non-inbox categories) and the
-- administracja@ Skrzynka (inbox_* categories + support_inbox_meta). This migration adds the
-- contractor "Sprawy" (conversations + department tasks) as a third family of tickets:
--   * new categories contractor_conversation / contractor_task (slug prefix 'contractor_')
--   * is_contractor_category() helper
--   * support_contractor_meta (1:1 with support_tickets) — contractor-specific fields
--   * backfill from contractor_conversations + contractor_tasks, REUSING the source UUID as the
--     ticket id (idempotent ON CONFLICT + lets meta.ticket_id correlate without RETURNING juggling)
--   * extend the live support_tickets / comments RLS with a contractor branch
--     (has_lifecycle_access) — existing inbox + user behaviour preserved verbatim.
--
-- EXPAND step: legacy contractor_conversations / contractor_tasks are LEFT UNTOUCHED (rollback).
-- status/priority are mapped (conversation/task semantics → support enums); the original
-- conversation_category + follow_up_date + due_date live in support_contractor_meta.
-- ============================================================

BEGIN;

-- ─── 1. Helper + categories ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_contractor_category(p_category_id UUID) RETURNS BOOLEAN
    LANGUAGE sql STABLE AS $$
        SELECT EXISTS (
            SELECT 1 FROM support_categories
            WHERE id = p_category_id AND slug LIKE 'contractor_%'
        );
    $$;

INSERT INTO support_categories (slug, name_pl, name_en, icon, sort_order) VALUES
    ('contractor_conversation', 'Rozmowa z kontraktorem', 'Contractor conversation', 'MessageCircle', 110),
    ('contractor_task',         'Zadanie działu',         'Department task',         'ListChecks',   111)
ON CONFLICT (slug) DO NOTHING;

-- ─── 2. support_contractor_meta (1:1) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_contractor_meta (
    ticket_id              UUID PRIMARY KEY REFERENCES support_tickets(id) ON DELETE CASCADE,
    kind                   TEXT NOT NULL CHECK (kind IN ('conversation', 'task')),
    contractor_id          UUID REFERENCES contractors(id) ON DELETE SET NULL,
    conversation_category  TEXT,                      -- original 12-value enum (conversations)
    follow_up_date         DATE,                      -- conversations
    due_date               DATE,                      -- tasks
    client_snapshot        TEXT,
    tcm_id                 UUID REFERENCES profiles(id) ON DELETE SET NULL,
    placement_id           UUID,
    linked_ticket_id       UUID REFERENCES support_tickets(id) ON DELETE SET NULL, -- task's originating ticket (was contractor_tasks.source_ticket_id)
    source_conversation_id UUID UNIQUE,               -- provenance / idempotency
    source_task_id         UUID UNIQUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_contractor_meta_contractor ON support_contractor_meta(contractor_id);
CREATE INDEX IF NOT EXISTS idx_support_contractor_meta_kind ON support_contractor_meta(kind);
CREATE INDEX IF NOT EXISTS idx_support_contractor_meta_followup ON support_contractor_meta(follow_up_date) WHERE follow_up_date IS NOT NULL;

ALTER TABLE support_contractor_meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contractor_meta_lifecycle_all" ON support_contractor_meta;
CREATE POLICY "contractor_meta_lifecycle_all" ON support_contractor_meta
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

COMMENT ON TABLE support_contractor_meta IS
    'Phase 36. 1:1 contractor-specific fields for support_tickets rows in contractor_* categories. Backfilled from contractor_conversations (kind=conversation) + contractor_tasks (kind=task), ticket id = source id.';

-- ─── 3. Backfill conversations → support_tickets + meta (id = conversation id) ──
INSERT INTO support_tickets (id, user_id, assignee_id, category_id, subject, body_md, status, priority, resolved_at, created_at, updated_at)
SELECT
    c.id,
    COALESCE(c.created_by, c.tcm_id, (SELECT id FROM profiles WHERE role::text = 'admin' ORDER BY created_at LIMIT 1)),
    c.tcm_id,
    (SELECT id FROM support_categories WHERE slug = 'contractor_conversation'),
    left('Rozmowa (' || c.category || ') ' || COALESCE(c.client_snapshot, '') || ' · ' || c.conversation_date::text, 200),
    COALESCE(c.note, ''),
    CASE c.status WHEN 'rozwiazane' THEN 'resolved' WHEN 'w_toku' THEN 'in_progress' ELSE 'open' END,
    CASE c.status WHEN 'pilne' THEN 'urgent' WHEN 'potrzebny_kontakt' THEN 'high' ELSE 'normal' END,
    c.resolved_at,
    c.created_at, c.updated_at
FROM contractor_conversations c
ON CONFLICT (id) DO NOTHING;

INSERT INTO support_contractor_meta (ticket_id, kind, contractor_id, conversation_category, follow_up_date, client_snapshot, tcm_id, placement_id, source_conversation_id)
SELECT c.id, 'conversation', c.contractor_id, c.category, c.follow_up_date, c.client_snapshot, c.tcm_id, c.placement_id, c.id
FROM contractor_conversations c
ON CONFLICT (ticket_id) DO NOTHING;

-- ─── 4. Backfill tasks → support_tickets + meta (id = task id) ────────────────
INSERT INTO support_tickets (id, user_id, assignee_id, category_id, subject, body_md, status, priority, resolved_at, created_at, updated_at)
SELECT
    t.id,
    COALESCE(t.created_by, t.assigned_tcm_id, (SELECT id FROM profiles WHERE role::text = 'admin' ORDER BY created_at LIMIT 1)),
    t.assigned_tcm_id,
    (SELECT id FROM support_categories WHERE slug = 'contractor_task'),
    left(t.title, 200),
    COALESCE(t.description, ''),
    CASE t.status WHEN 'done' THEN 'resolved' WHEN 'in_progress' THEN 'in_progress' ELSE 'open' END,
    'normal',
    CASE WHEN t.status = 'done' THEN t.updated_at ELSE NULL END,
    t.created_at, t.updated_at
FROM contractor_tasks t
ON CONFLICT (id) DO NOTHING;

INSERT INTO support_contractor_meta (ticket_id, kind, contractor_id, due_date, tcm_id, linked_ticket_id, source_task_id)
SELECT t.id, 'task', t.contractor_id, t.due_date, t.assigned_tcm_id, t.source_ticket_id, t.id
FROM contractor_tasks t
ON CONFLICT (ticket_id) DO NOTHING;

-- ─── 5. Extend support_tickets RLS with a contractor branch ───────────────────
-- Preserves the phase10 inbox + user behaviour verbatim; adds contractor_* → has_lifecycle_access().
DROP POLICY IF EXISTS "support_tickets_select_user_or_inbox" ON support_tickets;
CREATE POLICY "support_tickets_select_user_or_inbox" ON support_tickets
    FOR SELECT TO authenticated
    USING (
        CASE
            WHEN is_inbox_category(category_id) THEN is_inbox_handler()
            WHEN is_contractor_category(category_id) THEN has_lifecycle_access()
            ELSE user_id = auth.uid() OR assignee_id = auth.uid() OR is_admin()
        END
    );

DROP POLICY IF EXISTS "support_tickets_insert_user_or_inbox" ON support_tickets;
CREATE POLICY "support_tickets_insert_user_or_inbox" ON support_tickets
    FOR INSERT TO authenticated
    WITH CHECK (
        CASE
            WHEN is_inbox_category(category_id) THEN is_inbox_handler()
            WHEN is_contractor_category(category_id) THEN has_lifecycle_access()
            ELSE user_id = auth.uid()
        END
    );

DROP POLICY IF EXISTS "support_tickets_update_user_or_inbox" ON support_tickets;
CREATE POLICY "support_tickets_update_user_or_inbox" ON support_tickets
    FOR UPDATE TO authenticated
    USING (
        CASE
            WHEN is_inbox_category(category_id) THEN is_inbox_handler()
            WHEN is_contractor_category(category_id) THEN has_lifecycle_access()
            ELSE assignee_id = auth.uid() OR is_admin() OR user_id = auth.uid()
        END
    )
    WITH CHECK (
        CASE
            WHEN is_inbox_category(category_id) THEN is_inbox_handler()
            WHEN is_contractor_category(category_id) THEN has_lifecycle_access()
            ELSE assignee_id = auth.uid() OR is_admin() OR user_id = auth.uid()
        END
    );

-- Comments: contractor-ticket comments visible/insertable by lifecycle access too.
DROP POLICY IF EXISTS "support_comments_select_via_ticket_access" ON support_ticket_comments;
CREATE POLICY "support_comments_select_via_ticket_access" ON support_ticket_comments
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id)
        AND (
            NOT is_internal
            OR is_admin()
            OR is_inbox_handler()
            OR EXISTS (
                SELECT 1 FROM support_tickets t
                WHERE t.id = ticket_id
                  AND (t.assignee_id = auth.uid() OR (is_contractor_category(t.category_id) AND has_lifecycle_access()))
            )
        )
    );

DROP POLICY IF EXISTS "support_comments_insert_via_ticket_access" ON support_ticket_comments;
CREATE POLICY "support_comments_insert_via_ticket_access" ON support_ticket_comments
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        AND (
            NOT is_internal
            OR is_admin()
            OR is_inbox_handler()
            OR EXISTS (
                SELECT 1 FROM support_tickets t
                WHERE t.id = ticket_id
                  AND (t.assignee_id = auth.uid() OR (is_contractor_category(t.category_id) AND has_lifecycle_access()))
            )
        )
    );

COMMIT;
