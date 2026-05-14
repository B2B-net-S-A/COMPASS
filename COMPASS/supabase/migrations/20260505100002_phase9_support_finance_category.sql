-- ============================================================
-- Phase 9: Add 'Finanse' category to support_categories
-- ============================================================
--
-- Reason: consultant_assignments only models recruiter / delivery_lead.
-- Finance issues (faktury, rozliczenia, refundacje) get a dedicated ticket
-- category instead of a chat shortcut, since finance is a group inbox
-- (every user with finance role sees all consultants).
--
-- The /support/contacts page has a CTA "Sprawa finansowa? → ticket" pointing
-- at /support/tickets/new?category=finance which relies on this slug existing.

INSERT INTO support_categories (slug, name_pl, name_en, icon, sort_order) VALUES
    ('finance', 'Finanse', 'Finance', 'DollarSign', 5)
ON CONFLICT (slug) DO NOTHING;
