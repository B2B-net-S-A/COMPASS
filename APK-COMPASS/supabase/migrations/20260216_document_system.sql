-- Migration for professional Document Management System
-- Part of Unified Document Management (M7)
-- 1. App Documents (Master Record)
CREATE TABLE IF NOT EXISTS app_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (
        category IN (
            'contract',
            'invoice',
            'certificate',
            'onboarding',
            'benefit',
            'regulation',
            'other'
        )
    ),
    title TEXT NOT NULL,
    current_status TEXT NOT NULL DEFAULT 'active' CHECK (
        current_status IN (
            'active',
            'archived',
            'pending_signature',
            'signed'
        )
    ),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_archived BOOLEAN DEFAULT FALSE
);
-- 2. Document Versions (File Records)
CREATE TABLE IF NOT EXISTS document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES app_documents(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT,
    -- in bytes
    uploaded_by UUID NOT NULL REFERENCES profiles(id),
    change_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- RLS Policies
ALTER TABLE app_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
-- Select: Users see their own, admins see all
CREATE POLICY "Users can view own documents" ON app_documents FOR
SELECT USING (
        auth.uid() = owner_id
        OR (
            SELECT role
            FROM profiles
            WHERE id = auth.uid()
        ) = 'admin'
    );
CREATE POLICY "Users can view own document versions" ON document_versions FOR
SELECT USING (
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
                    ) = 'admin'
                )
        )
    );
-- Insert: Users can upload their own
CREATE POLICY "Users can insert own documents" ON app_documents FOR
INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can insert own versions" ON document_versions FOR
INSERT WITH CHECK (
        EXISTS (
            SELECT 1
            FROM app_documents
            WHERE app_documents.id = document_versions.document_id
                AND app_documents.owner_id = auth.uid()
        )
    );
-- Update/Archive: Owner or Admin
CREATE POLICY "Owners or admins can update documents" ON app_documents FOR
UPDATE USING (
        auth.uid() = owner_id
        OR (
            SELECT role
            FROM profiles
            WHERE id = auth.uid()
        ) = 'admin'
    );
-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_doc_timestamp() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now();
RETURN NEW;
END;
$$ language 'plpgsql';
CREATE TRIGGER update_app_documents_modtime BEFORE
UPDATE ON app_documents FOR EACH ROW EXECUTE FUNCTION update_doc_timestamp();