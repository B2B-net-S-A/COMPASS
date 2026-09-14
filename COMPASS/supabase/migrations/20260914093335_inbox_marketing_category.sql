-- Marketing shares the existing inbox workflow and permissions. The inbox_
-- prefix is recognized by is_inbox_category() and excluded from helpdesk.
-- Existing tickets keep their categories; classification is explicit on create.
INSERT INTO public.support_categories (slug, name_pl, name_en, icon, sort_order)
VALUES ('inbox_marketing', 'Marketing', 'Marketing', 'Megaphone', 107)
ON CONFLICT (slug) DO NOTHING;
