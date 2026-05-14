-- ============================================================
-- Phase 4 — Aktualności (News)
-- Date: 2026-05-04
--
-- Admin posts → consultant feed. Tables:
--   news_posts        — slug/title/body_md/cover/audience_role[]/pinned/published_at
--   news_reactions    — like/heart/celebrate (one per user per kind)
--   news_post_reads   — per-user read tracking for unread badge
--
-- RLS:
--   posts: published readable by audience_role-matching users (or all if NULL);
--          admin write
--   reactions: anyone authenticated can read; user can insert/delete own
--   reads: user reads/inserts own
--
-- Adds notifications.type 'news_published'.
-- Idempotent.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS news_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT,
    body_md TEXT NOT NULL,
    cover_url TEXT,
    author_id UUID NOT NULL REFERENCES profiles(id),
    published_at TIMESTAMPTZ,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    audience_role TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_posts_published ON news_posts(published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_news_posts_pinned_published ON news_posts(pinned DESC, published_at DESC) WHERE published_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS news_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('like', 'heart', 'celebrate')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_id, user_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_news_reactions_post ON news_reactions(post_id);

CREATE TABLE IF NOT EXISTS news_post_reads (
    post_id UUID NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

DROP TRIGGER IF EXISTS news_posts_updated_at ON news_posts;
CREATE TRIGGER news_posts_updated_at BEFORE UPDATE ON news_posts
    FOR EACH ROW EXECUTE FUNCTION public.support_set_updated_at();

ALTER TABLE news_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_post_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "news_posts_select_published_audience" ON news_posts;
CREATE POLICY "news_posts_select_published_audience" ON news_posts
    FOR SELECT TO authenticated
    USING (
        is_admin()
        OR (
            published_at IS NOT NULL
            AND (
                audience_role IS NULL
                OR audience_role = '{}'::TEXT[]
                OR EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid() AND p.role = ANY (audience_role)
                )
            )
        )
    );

DROP POLICY IF EXISTS "news_posts_admin_write" ON news_posts;
CREATE POLICY "news_posts_admin_write" ON news_posts
    FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "news_reactions_select_via_post_access" ON news_reactions;
CREATE POLICY "news_reactions_select_via_post_access" ON news_reactions
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "news_reactions_insert_self" ON news_reactions;
CREATE POLICY "news_reactions_insert_self" ON news_reactions
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "news_reactions_delete_self" ON news_reactions;
CREATE POLICY "news_reactions_delete_self" ON news_reactions
    FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "news_post_reads_select_self" ON news_post_reads;
CREATE POLICY "news_post_reads_select_self" ON news_post_reads
    FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "news_post_reads_upsert_self" ON news_post_reads;
CREATE POLICY "news_post_reads_upsert_self" ON news_post_reads
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'contract_ending', 'health_score_low', 'new_project_match',
        'loyalty_tier_up', 'referral_update', 'document_uploaded',
        'system_announcement', 'payment_received', 'course_completed',
        'course_approved', 'course_rejected',
        'support_ticket_assigned', 'support_ticket_replied', 'support_ticket_resolved',
        'news_published'
    ));

COMMIT;
