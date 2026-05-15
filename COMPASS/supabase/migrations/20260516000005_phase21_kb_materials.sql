-- ============================================================
-- Phase 21 — Baza wiedzy: edycja kategorii + upload materiałów
-- Date: 2026-05-16
--
-- Adds:
--   support_categories.is_active        — soft-disable kategorii w widoku KB
--   support_category_materials          — standalone pliki per kategoria (PDF/DOCX/...)
--   support_article_attachments         — pliki dołączane do artykułów
--   storage bucket 'support-materials'  — prywatny, signed URL download
--
-- Permission model:
--   SELECT — wszyscy uwierzytelnieni (KB jest publiczne wewnątrz firmy)
--   INSERT/UPDATE/DELETE — is_admin() w DB (super-admin egzekwowany w app-layer
--                          przez requireSuperAdmin() bo DB nie zna SUPER_ADMIN_EMAILS)
--
-- Idempotent.
-- ============================================================

BEGIN;

-- ─── 1. support_categories.is_active ─────────────────────────────────────
ALTER TABLE support_categories
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_support_categories_active
    ON support_categories(is_active, sort_order)
    WHERE is_active = true;

COMMENT ON COLUMN support_categories.is_active IS
    'Phase 21. Soft-disable kategorii w widoku /support/kb. Inbox kanban nie używa tej flagi.';

-- ─── 2. support_category_materials (standalone pliki per kategoria) ──────
CREATE TABLE IF NOT EXISTS support_category_materials (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id  UUID NOT NULL REFERENCES support_categories(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT,
    file_path    TEXT NOT NULL,                            -- support-materials/materials/{category_id}/{ts}_{name}
    file_name    TEXT NOT NULL,                            -- original
    file_size    INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 20971520),  -- 20 MB
    mime_type    TEXT NOT NULL,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    uploaded_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_category_materials_category
    ON support_category_materials(category_id, sort_order);

DROP TRIGGER IF EXISTS support_category_materials_updated_at ON support_category_materials;
CREATE TRIGGER support_category_materials_updated_at BEFORE UPDATE ON support_category_materials
    FOR EACH ROW EXECUTE FUNCTION public.support_set_updated_at();

COMMENT ON TABLE support_category_materials IS
    'Phase 21. Materiały do pobrania powiązane bezpośrednio z kategorią KB (regulaminy, formularze).';

-- ─── 3. support_article_attachments (pliki przypięte do artykułów) ───────
CREATE TABLE IF NOT EXISTS support_article_attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id   UUID NOT NULL REFERENCES support_articles(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    file_path    TEXT NOT NULL,                            -- support-materials/attachments/{article_id}/{ts}_{name}
    file_name    TEXT NOT NULL,
    file_size    INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 20971520),
    mime_type    TEXT NOT NULL,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    uploaded_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_article_attachments_article
    ON support_article_attachments(article_id, sort_order);

DROP TRIGGER IF EXISTS support_article_attachments_updated_at ON support_article_attachments;
CREATE TRIGGER support_article_attachments_updated_at BEFORE UPDATE ON support_article_attachments
    FOR EACH ROW EXECUTE FUNCTION public.support_set_updated_at();

COMMENT ON TABLE support_article_attachments IS
    'Phase 21. Załączniki (PDF/DOCX/...) powiązane z artykułem w bazie wiedzy.';

-- ─── 4. RLS policies ─────────────────────────────────────────────────────
ALTER TABLE support_category_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_article_attachments ENABLE ROW LEVEL SECURITY;

-- Materials: SELECT by everyone authenticated, write by admin (super-admin enforced in app)
DROP POLICY IF EXISTS "category_materials_select_authenticated" ON support_category_materials;
CREATE POLICY "category_materials_select_authenticated" ON support_category_materials
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "category_materials_admin_write" ON support_category_materials;
CREATE POLICY "category_materials_admin_write" ON support_category_materials
    FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Attachments: SELECT if user can read the article, write by admin
DROP POLICY IF EXISTS "article_attachments_select_via_article" ON support_article_attachments;
CREATE POLICY "article_attachments_select_via_article" ON support_article_attachments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM support_articles a
            WHERE a.id = support_article_attachments.article_id
              AND (a.published_at IS NOT NULL OR is_trainer_or_admin())
        )
    );

DROP POLICY IF EXISTS "article_attachments_admin_write" ON support_article_attachments;
CREATE POLICY "article_attachments_admin_write" ON support_article_attachments
    FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ─── 5. Storage bucket: support-materials (private) ──────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-materials', 'support-materials', false)
ON CONFLICT (id) DO NOTHING;

-- SELECT — any authenticated user (KB jest publiczne wewnątrz firmy)
DROP POLICY IF EXISTS "support_materials_storage_select" ON storage.objects;
CREATE POLICY "support_materials_storage_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'support-materials');

-- INSERT/UPDATE/DELETE — admin (app-layer dodatkowo egzekwuje super-admin)
DROP POLICY IF EXISTS "support_materials_storage_insert_admin" ON storage.objects;
CREATE POLICY "support_materials_storage_insert_admin" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'support-materials' AND is_admin());

DROP POLICY IF EXISTS "support_materials_storage_update_admin" ON storage.objects;
CREATE POLICY "support_materials_storage_update_admin" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'support-materials' AND is_admin());

DROP POLICY IF EXISTS "support_materials_storage_delete_admin" ON storage.objects;
CREATE POLICY "support_materials_storage_delete_admin" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'support-materials' AND is_admin());

COMMIT;
