-- ============================================================
-- Phase H3.3 — Web Push Notifications
-- Date: 2026-05-08
--
-- Tabela `push_subscriptions` przechowuje per-device PushSubscription:
--   - endpoint (URL, unique per device)
--   - p256dh (key)
--   - auth (key)
-- Dane do encrypt + send via web-push library z VAPID keys.
--
-- Multi-device support: jeden user może mieć wiele subscriptions (laptop, mobile).
-- Cleanup: gdy push fail z 410 Gone → delete row (odsubskrybowany).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_last_used ON push_subscriptions(last_used_at);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_sub_self_or_admin" ON push_subscriptions;
CREATE POLICY "push_sub_self_or_admin" ON push_subscriptions
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

COMMIT;
