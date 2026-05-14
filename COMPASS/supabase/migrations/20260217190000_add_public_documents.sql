-- Add is_public column to app_documents
ALTER TABLE app_documents
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
-- Update RLS policies to allow public read access
DROP POLICY IF EXISTS "Enable read access for all users" ON app_documents;
-- Drop if exists to avoid conflict/confusion with old policies
-- Actually, let's refine the existing policy "Users can view own documents"
-- 1. SELECT Policy (Read)
-- Users can see their own documents OR public documents OR if they are admins
DROP POLICY IF EXISTS "Users can view own documents" ON app_documents;
CREATE POLICY "Users can view own or public documents" ON app_documents FOR
SELECT USING (
        auth.uid() = owner_id
        OR is_public = true
        OR (
            SELECT role
            FROM profiles
            WHERE id = auth.uid()
        ) IN ('admin', 'administrator', 'centrala')
    );
-- Users can view versions of visible documents
DROP POLICY IF EXISTS "Users can view own document versions" ON document_versions;
CREATE POLICY "Users can view accessible document versions" ON document_versions FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM app_documents
            WHERE app_documents.id = document_versions.document_id
                AND (
                    app_documents.owner_id = auth.uid()
                    OR app_documents.is_public = true
                    OR (
                        SELECT role
                        FROM profiles
                        WHERE id = auth.uid()
                    ) IN ('admin', 'administrator', 'centrala')
                )
        )
    );
-- 2. INSERT/UPDATE/DELETE Policy (Write)
-- Admins/Centrala can manage public documents
-- Owners can manage their own documents (unchanged mostly, but explicit for public)
-- Insert: Users can upload their own. Admins/Centrala can upload public (or any, technically).
DROP POLICY IF EXISTS "Users can insert own documents" ON app_documents;
CREATE POLICY "Users and Admins can insert documents" ON app_documents FOR
INSERT WITH CHECK (
        auth.uid() = owner_id
        OR (
            (
                SELECT role
                FROM profiles
                WHERE id = auth.uid()
            ) IN ('admin', 'administrator', 'centrala')
        )
    );
-- Update: Owner or Admin
DROP POLICY IF EXISTS "Owners or admins can update documents" ON app_documents;
CREATE POLICY "Owners or admins can update documents" ON app_documents FOR
UPDATE USING (
        auth.uid() = owner_id
        OR (
            SELECT role
            FROM profiles
            WHERE id = auth.uid()
        ) IN ('admin', 'administrator', 'centrala')
    );
-- Delete: Owner or Admin (Enable Delete)
CREATE POLICY "Owners or admins can delete documents" ON app_documents FOR DELETE USING (
    auth.uid() = owner_id
    OR (
        SELECT role
        FROM profiles
        WHERE id = auth.uid()
    ) IN ('admin', 'administrator', 'centrala')
);
-- Also allow deleting versions (cascades usually handle this, but for explicit RLS)
CREATE POLICY "Owners or admins can delete versions" ON document_versions FOR DELETE USING (
    EXISTS (
        SELECT 1
        FROM app_documents
        WHERE app_documents.id = document_versions.document_id
            AND (
                app_documents.owner_id = auth.uid()
                OR (
                    SELECT role
                    FROM profiles
                    WHERE id = auth.uid()
                ) IN ('admin', 'administrator', 'centrala')
            )
    )
);