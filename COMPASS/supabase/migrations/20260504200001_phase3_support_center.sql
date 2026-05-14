-- ============================================================
-- Phase 3 — Support Center: tickets + chat + KB
-- Date: 2026-05-04
--
-- Tables:
--   support_categories  — seed: hr, benefits, it, onboarding, other
--   support_tickets     — user-opened tickets with status/priority/assignee
--   support_ticket_comments — chat thread; is_internal flag for admin-only notes
--   support_articles    — KB articles per category, draft (published_at NULL) or published
--
-- RLS:
--   - tickets: creator, assignee, admin (via is_admin()) read/write
--   - comments: inherit ticket access; is_internal=true only for assignee/admin
--   - articles: published readable by all auth; drafts admin/trainer only
--
-- Notification CHECK extended with support_ticket_{assigned,replied,resolved}.
-- Idempotent.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS support_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name_pl TEXT NOT NULL,
    name_en TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'HelpCircle',
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    category_id UUID NOT NULL REFERENCES support_categories(id),
    subject TEXT NOT NULL,
    body_md TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_user', 'resolved', 'closed')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id, status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee ON support_tickets(assignee_id, status) WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

CREATE TABLE IF NOT EXISTS support_ticket_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    body_md TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_comments_ticket ON support_ticket_comments(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS support_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT,
    content_md TEXT NOT NULL,
    category_id UUID NOT NULL REFERENCES support_categories(id),
    author_id UUID NOT NULL REFERENCES profiles(id),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_articles_category ON support_articles(category_id, published_at);
CREATE INDEX IF NOT EXISTS idx_support_articles_published ON support_articles(published_at) WHERE published_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.support_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_tickets_updated_at ON support_tickets;
CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON support_tickets
    FOR EACH ROW EXECUTE FUNCTION public.support_set_updated_at();

DROP TRIGGER IF EXISTS support_articles_updated_at ON support_articles;
CREATE TRIGGER support_articles_updated_at BEFORE UPDATE ON support_articles
    FOR EACH ROW EXECUTE FUNCTION public.support_set_updated_at();

ALTER TABLE support_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_categories_select_authenticated" ON support_categories;
CREATE POLICY "support_categories_select_authenticated" ON support_categories
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "support_categories_admin_write" ON support_categories;
CREATE POLICY "support_categories_admin_write" ON support_categories
    FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "support_tickets_select_own_or_assigned_or_admin" ON support_tickets;
CREATE POLICY "support_tickets_select_own_or_assigned_or_admin" ON support_tickets
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR assignee_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "support_tickets_insert_own" ON support_tickets;
CREATE POLICY "support_tickets_insert_own" ON support_tickets
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "support_tickets_update_assignee_or_admin_or_own_close" ON support_tickets;
CREATE POLICY "support_tickets_update_assignee_or_admin_or_own_close" ON support_tickets
    FOR UPDATE TO authenticated
    USING (assignee_id = auth.uid() OR is_admin() OR user_id = auth.uid())
    WITH CHECK (assignee_id = auth.uid() OR is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "support_tickets_delete_admin" ON support_tickets;
CREATE POLICY "support_tickets_delete_admin" ON support_tickets
    FOR DELETE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "support_comments_select_via_ticket_access" ON support_ticket_comments;
CREATE POLICY "support_comments_select_via_ticket_access" ON support_ticket_comments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM support_tickets t
            WHERE t.id = support_ticket_comments.ticket_id
              AND (t.user_id = auth.uid() OR t.assignee_id = auth.uid() OR is_admin())
        )
        AND (NOT is_internal OR is_admin() OR EXISTS (
            SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND t.assignee_id = auth.uid()
        ))
    );

DROP POLICY IF EXISTS "support_comments_insert_via_ticket_access" ON support_ticket_comments;
CREATE POLICY "support_comments_insert_via_ticket_access" ON support_ticket_comments
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM support_tickets t
            WHERE t.id = support_ticket_comments.ticket_id
              AND (t.user_id = auth.uid() OR t.assignee_id = auth.uid() OR is_admin())
        )
        AND (NOT is_internal OR is_admin() OR EXISTS (
            SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND t.assignee_id = auth.uid()
        ))
    );

DROP POLICY IF EXISTS "support_articles_select_published_or_admin" ON support_articles;
CREATE POLICY "support_articles_select_published_or_admin" ON support_articles
    FOR SELECT TO authenticated
    USING (published_at IS NOT NULL OR is_trainer_or_admin());

DROP POLICY IF EXISTS "support_articles_admin_write" ON support_articles;
CREATE POLICY "support_articles_admin_write" ON support_articles
    FOR ALL TO authenticated USING (is_trainer_or_admin()) WITH CHECK (is_trainer_or_admin());

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'contract_ending', 'health_score_low', 'new_project_match',
        'loyalty_tier_up', 'referral_update', 'document_uploaded',
        'system_announcement', 'payment_received', 'course_completed',
        'course_approved', 'course_rejected',
        'support_ticket_assigned', 'support_ticket_replied', 'support_ticket_resolved'
    ));

INSERT INTO support_categories (slug, name_pl, name_en, icon, sort_order) VALUES
    ('hr', 'HR i kadry', 'HR', 'Users', 1),
    ('benefits', 'Benefity', 'Benefits', 'Gift', 2),
    ('it', 'IT i sprzęt', 'IT & equipment', 'Laptop', 3),
    ('onboarding', 'Onboarding', 'Onboarding', 'BookOpen', 4),
    ('other', 'Inne', 'Other', 'HelpCircle', 99)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
