-- ============================================================
-- Phase 10 — Inbox Kanban (email-driven ticket handling)
-- ============================================================
-- Adds:
--   profiles.is_inbox_handler  — flag for users who can handle inbox tickets
--   support_inbox_meta         — 1:1 join on support_tickets with email/SLA fields
--   inbox_* categories         — Negocjacje/Wypowiedzenie/Administracja/Inne
--   is_inbox_handler() helper  — admin OR is_inbox_handler=true
--   is_inbox_category() helper — slug LIKE 'inbox_%'
-- Branches RLS on support_tickets via CASE: inbox tickets restricted to handlers,
-- user tickets keep original creator/assignee/admin rules. Same for comments.
-- ============================================================

BEGIN;

-- 1. Profiles flag for inbox handlers (Błażej, Paulina, ...)
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS is_inbox_handler BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_inbox_handler
    ON profiles(is_inbox_handler) WHERE is_inbox_handler = true;

-- 2. SQL helpers
CREATE OR REPLACE FUNCTION is_inbox_handler() RETURNS BOOLEAN
    LANGUAGE sql SECURITY DEFINER STABLE
    AS $$
        SELECT EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND (role::TEXT = 'admin' OR is_inbox_handler = true)
        );
    $$;

CREATE OR REPLACE FUNCTION is_inbox_category(p_category_id UUID) RETURNS BOOLEAN
    LANGUAGE sql STABLE
    AS $$
        SELECT EXISTS (
            SELECT 1 FROM support_categories
            WHERE id = p_category_id AND slug LIKE 'inbox_%'
        );
    $$;

-- 3. Inbox-specific categories (separate sort_order range to keep them grouped at end)
INSERT INTO support_categories (slug, name_pl, name_en, icon, sort_order) VALUES
    ('inbox_negocjacje',    'Negocjacje umowy', 'Contract negotiation', 'FileSignature', 100),
    ('inbox_wypowiedzenie', 'Wypowiedzenie',    'Termination',          'FileX',         101),
    ('inbox_administracja', 'Administracja',    'Administration',       'FileText',      102),
    ('inbox_inne',          'Inne (inbox)',     'Other (inbox)',        'Inbox',         103)
ON CONFLICT (slug) DO NOTHING;

-- 4. Meta-table: 1:1 with support_tickets, stores fields specific to email-driven inbox tickets
CREATE TABLE IF NOT EXISTS support_inbox_meta (
    ticket_id            UUID PRIMARY KEY REFERENCES support_tickets(id) ON DELETE CASCADE,
    source               TEXT NOT NULL DEFAULT 'manual_paste'
                            CHECK (source IN ('manual_paste', 'email', 'user')),
    external_message_id  TEXT UNIQUE,
    consultant_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
    priority_level       TEXT NOT NULL DEFAULT 'P3'
                            CHECK (priority_level IN ('P1', 'P2', 'P3')),
    due_date             TIMESTAMPTZ NOT NULL,
    email_from           TEXT,
    email_subject        TEXT,
    email_received_at    TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbox_meta_consultant ON support_inbox_meta(consultant_id);
CREATE INDEX IF NOT EXISTS idx_inbox_meta_due_date   ON support_inbox_meta(due_date);
CREATE INDEX IF NOT EXISTS idx_inbox_meta_priority   ON support_inbox_meta(priority_level);

ALTER TABLE support_inbox_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inbox_meta_handler_all" ON support_inbox_meta;
CREATE POLICY "inbox_meta_handler_all" ON support_inbox_meta
    FOR ALL TO authenticated
    USING (is_inbox_handler())
    WITH CHECK (is_inbox_handler());

-- 5. Branching RLS on support_tickets — inbox vs user category split
DROP POLICY IF EXISTS "support_tickets_select_own_or_assigned_or_admin" ON support_tickets;
DROP POLICY IF EXISTS "support_tickets_select_user_or_inbox" ON support_tickets;
CREATE POLICY "support_tickets_select_user_or_inbox" ON support_tickets
    FOR SELECT TO authenticated
    USING (
        CASE
            WHEN is_inbox_category(category_id) THEN is_inbox_handler()
            ELSE user_id = auth.uid() OR assignee_id = auth.uid() OR is_admin()
        END
    );

DROP POLICY IF EXISTS "support_tickets_insert_own" ON support_tickets;
DROP POLICY IF EXISTS "support_tickets_insert_user_or_inbox" ON support_tickets;
CREATE POLICY "support_tickets_insert_user_or_inbox" ON support_tickets
    FOR INSERT TO authenticated
    WITH CHECK (
        CASE
            WHEN is_inbox_category(category_id) THEN is_inbox_handler()
            ELSE user_id = auth.uid()
        END
    );

DROP POLICY IF EXISTS "support_tickets_update_assignee_or_admin_or_own_close" ON support_tickets;
DROP POLICY IF EXISTS "support_tickets_update_user_or_inbox" ON support_tickets;
CREATE POLICY "support_tickets_update_user_or_inbox" ON support_tickets
    FOR UPDATE TO authenticated
    USING (
        CASE
            WHEN is_inbox_category(category_id) THEN is_inbox_handler()
            ELSE assignee_id = auth.uid() OR is_admin() OR user_id = auth.uid()
        END
    )
    WITH CHECK (
        CASE
            WHEN is_inbox_category(category_id) THEN is_inbox_handler()
            ELSE assignee_id = auth.uid() OR is_admin() OR user_id = auth.uid()
        END
    );

-- 6. Comments — handlers see/insert internal comments on inbox tickets
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
                WHERE t.id = ticket_id AND t.assignee_id = auth.uid()
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
                WHERE t.id = ticket_id AND t.assignee_id = auth.uid()
            )
        )
    );

-- 7. Extend notification types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'contract_ending', 'health_score_low', 'new_project_match',
        'loyalty_tier_up', 'referral_update', 'document_uploaded',
        'system_announcement', 'payment_received',
        'course_completed', 'course_approved', 'course_rejected',
        'support_ticket_assigned', 'support_ticket_replied', 'support_ticket_resolved',
        'news_published',
        'incubator_pitch_status_changed', 'incubator_application_received', 'incubator_application_status_changed',
        'inbox_ticket_assigned', 'inbox_sla_breach'
    ));

COMMIT;
