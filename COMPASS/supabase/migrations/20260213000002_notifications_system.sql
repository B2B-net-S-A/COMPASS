-- Notifications System for M1 Dashboard
-- This table stores system notifications for users
-- Used in: Dashboard, TopBar, Notification Center
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Notification content (bilingual support)
    type TEXT NOT NULL CHECK (
        type IN (
            'contract_ending',
            -- Kontrakt kończy się
            'health_score_low',
            -- Niski Health Score
            'new_project_match',
            -- Nowy dopasowany projekt
            'loyalty_tier_up',
            -- Awans w tiery lojalnościowym
            'referral_update',
            -- Update polecenia
            'document_uploaded',
            -- Nowy dokument
            'system_announcement',
            -- Ogłoszenie systemowe
            'payment_received' -- Płatność otrzymana
        )
    ),
    title_pl TEXT NOT NULL,
    title_en TEXT NOT NULL,
    body_pl TEXT,
    body_en TEXT,
    -- Metadata
    action_url TEXT,
    -- Link do akcji (np. /projects/123)
    is_read BOOLEAN DEFAULT FALSE,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ -- Auto-expire old notifications
);
-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- RLS Policies
-- Users can view their own notifications
CREATE POLICY "Users can view own notifications" ON notifications FOR
SELECT TO authenticated USING (auth.uid() = user_id);
-- System can insert notifications (via service role)
CREATE POLICY "Service role can insert notifications" ON notifications FOR
INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications" ON notifications FOR
UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
-- Admins can manage all notifications
CREATE POLICY "Admins can manage all notifications" ON notifications FOR ALL TO authenticated USING (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
    )
) WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
    )
);
-- Function to auto-expire old notifications (run via cron)
CREATE OR REPLACE FUNCTION expire_old_notifications() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
DELETE FROM notifications
WHERE expires_at < NOW()
    OR (
        created_at < NOW() - INTERVAL '90 days'
        AND is_read = TRUE
    );
END;
$$;
-- Helper function to create notification
CREATE OR REPLACE FUNCTION create_notification(
        p_user_id UUID,
        p_type TEXT,
        p_title_pl TEXT,
        p_title_en TEXT,
        p_body_pl TEXT DEFAULT NULL,
        p_body_en TEXT DEFAULT NULL,
        p_action_url TEXT DEFAULT NULL,
        p_priority TEXT DEFAULT 'normal'
    ) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_notification_id UUID;
BEGIN
INSERT INTO notifications (
        user_id,
        type,
        title_pl,
        title_en,
        body_pl,
        body_en,
        action_url,
        priority
    )
VALUES (
        p_user_id,
        p_type,
        p_title_pl,
        p_title_en,
        p_body_pl,
        p_body_en,
        p_action_url,
        p_priority
    )
RETURNING id INTO v_notification_id;
RETURN v_notification_id;
END;
$$;
-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_notification TO authenticated;
GRANT EXECUTE ON FUNCTION expire_old_notifications TO authenticated;
-- Sample notifications for testing (optional - comment out if not needed)
-- INSERT INTO notifications (user_id, type, title_pl, title_en, body_pl, body_en, action_url, priority)
-- SELECT 
--     id,
--     'new_project_match',
--     'Nowy projekt dopasowany do Twojego profilu!',
--     'New project matched to your profile!',
--     'Senior Java Developer w Warszawie - sprawdź szczegóły',
--     'Senior Java Developer in Warsaw - check details',
--     '/projects',
--     'normal'
-- FROM auth.users
-- LIMIT 1;
COMMENT ON TABLE notifications IS 'System notifications for user dashboard and notification center';
COMMENT ON COLUMN notifications.type IS 'Type of notification for filtering and icon selection';
COMMENT ON COLUMN notifications.priority IS 'Priority level affects visual styling and email alerts';