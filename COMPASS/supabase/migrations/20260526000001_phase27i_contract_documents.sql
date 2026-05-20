-- ============================================================
-- Phase 27i — Per-employee contract documents (umowa + aneksy)
-- Date: 2026-05-26
--
-- Depends on:
--   - profiles (id)
--   - is_finanse_or_admin() (Phase 19b)
--
-- Adds:
--   1. Table user_contract_documents: many files per employee, each with a
--      doc_type (umowa/aneks/inne), free description, and signing date.
--   2. RLS: finanse + admin only (the whole "Stawki i Umowy" module is finanse+admin).
--   3. Private storage bucket 'contract-documents' (folder = {user_id}/) + storage RLS.
--
-- Files are uploaded/downloaded via server actions using the service-role client
-- (authz enforced in the action); storage RLS is defense-in-depth.
-- ============================================================

BEGIN;

-- ─── 1. Table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_contract_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    doc_type        TEXT NOT NULL DEFAULT 'umowa' CHECK (doc_type IN ('umowa', 'aneks', 'inne')),
    description     TEXT,
    signed_date     DATE,
    file_path       TEXT NOT NULL,
    file_name       TEXT NOT NULL,
    file_size_bytes INTEGER CHECK (file_size_bytes IS NULL OR (file_size_bytes > 0 AND file_size_bytes <= 10485760)),
    file_mime       TEXT,
    uploaded_by     UUID NOT NULL REFERENCES profiles(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_contract_documents IS
    'Phase 27i. Per-employee contract documents (umowa/aneks/inne) with description + signing date. Finanse + admin only.';

CREATE INDEX IF NOT EXISTS user_contract_documents_by_user
    ON user_contract_documents(user_id, signed_date DESC NULLS LAST, created_at DESC);

-- ─── 2. RLS: finanse + admin only ──────────────────────────────────────────
ALTER TABLE user_contract_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contract_docs_select_finanse_admin" ON user_contract_documents;
CREATE POLICY "contract_docs_select_finanse_admin" ON user_contract_documents
    FOR SELECT TO authenticated USING (is_finanse_or_admin());

DROP POLICY IF EXISTS "contract_docs_insert_finanse_admin" ON user_contract_documents;
CREATE POLICY "contract_docs_insert_finanse_admin" ON user_contract_documents
    FOR INSERT TO authenticated WITH CHECK (is_finanse_or_admin());

DROP POLICY IF EXISTS "contract_docs_update_finanse_admin" ON user_contract_documents;
CREATE POLICY "contract_docs_update_finanse_admin" ON user_contract_documents
    FOR UPDATE TO authenticated USING (is_finanse_or_admin()) WITH CHECK (is_finanse_or_admin());

DROP POLICY IF EXISTS "contract_docs_delete_finanse_admin" ON user_contract_documents;
CREATE POLICY "contract_docs_delete_finanse_admin" ON user_contract_documents
    FOR DELETE TO authenticated USING (is_finanse_or_admin());

-- ─── 3. Storage bucket 'contract-documents' (private) ──────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('contract-documents', 'contract-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — folder pattern: contract-documents/{user_id}/{ts}_{filename}
DROP POLICY IF EXISTS "contract_docs_storage_select" ON storage.objects;
CREATE POLICY "contract_docs_storage_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'contract-documents' AND is_finanse_or_admin());

DROP POLICY IF EXISTS "contract_docs_storage_insert" ON storage.objects;
CREATE POLICY "contract_docs_storage_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'contract-documents' AND is_finanse_or_admin());

DROP POLICY IF EXISTS "contract_docs_storage_delete" ON storage.objects;
CREATE POLICY "contract_docs_storage_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'contract-documents' AND is_finanse_or_admin());

COMMIT;
