-- Offboarding inbox category
--
-- Replaces the consultant-facing exit-interview survey: when TCM/admin starts an
-- offboarding, the system files a ticket "[Name] Offboarding" into the Inbox
-- Kanban (Moduł Obsługi Zgłoszeń). This seeds the dedicated category for it.
--
-- Idempotent: ON CONFLICT (slug) DO NOTHING. is_inbox_category() recognizes it
-- automatically via the slug LIKE 'inbox_%' rule (no helper change needed).

INSERT INTO support_categories (slug, name_pl, name_en, icon, sort_order) VALUES
    ('inbox_offboarding', 'Offboarding', 'Offboarding', 'LogOut', 104)
ON CONFLICT (slug) DO NOTHING;
