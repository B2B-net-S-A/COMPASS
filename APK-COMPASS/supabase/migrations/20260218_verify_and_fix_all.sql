-- ============================================================
-- ZBIORCZY SKRYPT WERYFIKACJI I NAPRAWY - Qualrix / B2B.net
-- Data: 2026-02-18
-- Opis: Sprawdza i tworzy brakujące tabele, indeksy, polityki
--        RLS oraz Storage buckety wymagane przez aplikację.
--
-- BEZPIECZNY DO WIELOKROTNEGO URUCHAMIANIA
-- (wszystkie operacje używają IF NOT EXISTS / DO $$ ... $$)
-- ============================================================

-- ============================================================
-- 1. TABELE BAZOWE (profiles musi istnieć — zakładamy że tak)
-- ============================================================

-- 1a. benefit_declarations (odpytywana przez getCentralaData)
CREATE TABLE IF NOT EXISTS benefit_declarations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    benefit_type TEXT NOT NULL CHECK (benefit_type IN ('medical', 'sport')),
    variant_name TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMPTZ
);

ALTER TABLE benefit_declarations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'benefit_declarations' AND policyname = 'Users can view own benefit declarations') THEN
        CREATE POLICY "Users can view own benefit declarations" ON benefit_declarations
            FOR SELECT USING (auth.uid() = profile_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'benefit_declarations' AND policyname = 'Users can insert own benefit declarations') THEN
        CREATE POLICY "Users can insert own benefit declarations" ON benefit_declarations
            FOR INSERT WITH CHECK (auth.uid() = profile_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'benefit_declarations' AND policyname = 'Admins can manage all benefit declarations') THEN
        CREATE POLICY "Admins can manage all benefit declarations" ON benefit_declarations
            FOR ALL USING (
                (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'administrator', 'centrala')
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_benefit_declarations_profile_id ON benefit_declarations(profile_id);
CREATE INDEX IF NOT EXISTS idx_benefit_declarations_status ON benefit_declarations(status);
CREATE INDEX IF NOT EXISTS idx_benefit_declarations_benefit_type ON benefit_declarations(benefit_type);
CREATE INDEX IF NOT EXISTS idx_benefit_declarations_created_at ON benefit_declarations(created_at DESC);

-- ============================================================
-- 1b. equipment_requests (odpytywana przez getCentralaData)
--     UWAGA: Kod odpytuje "equipment_requests" (bez prefixu centrala_)
--     ale dotąd istniała tylko "centrala_equipment_requests"
-- ============================================================

CREATE TABLE IF NOT EXISTS equipment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    status TEXT NOT NULL DEFAULT 'w_toku' CHECK (status IN ('w_toku', 'dostarczono', 'odrzucony')),
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE equipment_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_requests' AND policyname = 'Users can view own equipment requests') THEN
        CREATE POLICY "Users can view own equipment requests" ON equipment_requests
            FOR SELECT USING (
                auth.uid() = profile_id
                OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'administrator', 'centrala')
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_requests' AND policyname = 'Users can insert own equipment requests') THEN
        CREATE POLICY "Users can insert own equipment requests" ON equipment_requests
            FOR INSERT WITH CHECK (auth.uid() = profile_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_requests' AND policyname = 'Admins can manage all equipment requests') THEN
        CREATE POLICY "Admins can manage all equipment requests" ON equipment_requests
            FOR ALL USING (
                (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'administrator', 'centrala')
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_equipment_requests_profile_id ON equipment_requests(profile_id);
CREATE INDEX IF NOT EXISTS idx_equipment_requests_status ON equipment_requests(status);
CREATE INDEX IF NOT EXISTS idx_equipment_requests_created_at ON equipment_requests(created_at DESC);

-- ============================================================
-- 1c. invoices (odpytywana przez getCentralaData / BillingSection)
-- ============================================================

CREATE TABLE IF NOT EXISTS invoices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    consultant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency TEXT DEFAULT 'PLN',
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    period_month INTEGER,
    period_year INTEGER,
    file_url TEXT,
    file_name TEXT,
    status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'verified', 'approved', 'paid', 'rejected')),
    notes TEXT,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoices' AND policyname = 'Consultants can view own invoices') THEN
        CREATE POLICY "Consultants can view own invoices" ON invoices
            FOR SELECT USING (auth.uid() = consultant_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoices' AND policyname = 'Consultants can insert own invoices') THEN
        CREATE POLICY "Consultants can insert own invoices" ON invoices
            FOR INSERT WITH CHECK (auth.uid() = consultant_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoices' AND policyname = 'Consultants can update own submitted invoices') THEN
        CREATE POLICY "Consultants can update own submitted invoices" ON invoices
            FOR UPDATE USING (auth.uid() = consultant_id AND status = 'submitted')
            WITH CHECK (auth.uid() = consultant_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoices' AND policyname = 'Admins can view all invoices') THEN
        CREATE POLICY "Admins can view all invoices" ON invoices
            FOR SELECT USING (
                EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('administrator', 'admin', 'centrala'))
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoices' AND policyname = 'Admins can update all invoices') THEN
        CREATE POLICY "Admins can update all invoices" ON invoices
            FOR UPDATE USING (
                EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('administrator', 'admin', 'centrala'))
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_consultant ON invoices(consultant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_period ON invoices(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at DESC);

-- ============================================================
-- 1d. app_documents + document_versions (system dokumentów)
-- ============================================================

CREATE TABLE IF NOT EXISTS app_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (
        category IN ('contract', 'invoice', 'certificate', 'onboarding', 'benefit', 'regulation', 'other')
    ),
    title TEXT NOT NULL,
    current_status TEXT NOT NULL DEFAULT 'active' CHECK (
        current_status IN ('active', 'archived', 'pending_signature', 'signed')
    ),
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_archived BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES app_documents(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT,
    uploaded_by UUID NOT NULL REFERENCES profiles(id),
    change_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE app_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'app_documents' AND policyname = 'Users can view own documents') THEN
        CREATE POLICY "Users can view own documents" ON app_documents
            FOR SELECT USING (
                auth.uid() = owner_id
                OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
            );
    END IF;
END $$;

-- Polityka: publiczne dokumenty widoczne dla wszystkich zalogowanych
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'app_documents' AND policyname = 'Public documents visible to all') THEN
        CREATE POLICY "Public documents visible to all" ON app_documents
            FOR SELECT USING (is_public = true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'app_documents' AND policyname = 'Users can insert own documents') THEN
        CREATE POLICY "Users can insert own documents" ON app_documents
            FOR INSERT WITH CHECK (auth.uid() = owner_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'app_documents' AND policyname = 'Owners or admins can update documents') THEN
        CREATE POLICY "Owners or admins can update documents" ON app_documents
            FOR UPDATE USING (
                auth.uid() = owner_id
                OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'document_versions' AND policyname = 'Users can view own document versions') THEN
        CREATE POLICY "Users can view own document versions" ON document_versions
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM app_documents
                    WHERE app_documents.id = document_versions.document_id
                    AND (app_documents.owner_id = auth.uid()
                         OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
                )
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'document_versions' AND policyname = 'Users can insert own versions') THEN
        CREATE POLICY "Users can insert own versions" ON document_versions
            FOR INSERT WITH CHECK (
                EXISTS (
                    SELECT 1 FROM app_documents
                    WHERE app_documents.id = document_versions.document_id
                    AND app_documents.owner_id = auth.uid()
                )
            );
    END IF;
END $$;

-- Wersje publicznych dokumentów widoczne dla wszystkich
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'document_versions' AND policyname = 'Public document versions visible to all') THEN
        CREATE POLICY "Public document versions visible to all" ON document_versions
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM app_documents
                    WHERE app_documents.id = document_versions.document_id
                    AND app_documents.is_public = true
                )
            );
    END IF;
END $$;

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_doc_timestamp() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_app_documents_modtime ON app_documents;
CREATE TRIGGER update_app_documents_modtime
    BEFORE UPDATE ON app_documents
    FOR EACH ROW EXECUTE FUNCTION update_doc_timestamp();

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_app_documents_owner ON app_documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_app_documents_category ON app_documents(category);
CREATE INDEX IF NOT EXISTS idx_app_documents_created_at ON app_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_documents_public ON app_documents(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_document_versions_document_id ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_version_number ON document_versions(version_number);

-- Dodaj kolumnę is_public jeśli nie istnieje (starsze wersje tabeli)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_documents' AND column_name = 'is_public'
    ) THEN
        ALTER TABLE app_documents ADD COLUMN is_public BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- ============================================================
-- 1e. consultant_assignments (system przypisań Centrala)
-- ============================================================

CREATE TABLE IF NOT EXISTS consultant_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    assigned_to UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    assignment_type TEXT NOT NULL DEFAULT 'recruiter'
        CHECK (assignment_type IN ('recruiter', 'delivery_lead')),
    assigned_by UUID REFERENCES profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(consultant_id, assigned_to, assignment_type)
);

ALTER TABLE consultant_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'consultant_assignments' AND policyname = 'Admins manage all assignments') THEN
        CREATE POLICY "Admins manage all assignments" ON consultant_assignments
            FOR ALL USING (
                EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('administrator', 'admin'))
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'consultant_assignments' AND policyname = 'Centrala users read own assignments') THEN
        CREATE POLICY "Centrala users read own assignments" ON consultant_assignments
            FOR SELECT USING (assigned_to = auth.uid());
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_consultant_assignments_consultant ON consultant_assignments(consultant_id);
CREATE INDEX IF NOT EXISTS idx_consultant_assignments_assigned_to ON consultant_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_consultant_assignments_type ON consultant_assignments(assignment_type);

-- ============================================================
-- 1f. system_settings (używane do powiadomień email)
-- ============================================================

CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_by UUID REFERENCES profiles(id)
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'Admins can manage system settings') THEN
        CREATE POLICY "Admins can manage system settings" ON system_settings
            FOR ALL USING (
                (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'administrator', 'centrala')
            );
    END IF;
END $$;

INSERT INTO system_settings (key, value, description)
VALUES ('notification_email', 'biurko2015@gmail.com', 'Email address for equipment and benefit request notifications')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. STORAGE BUCKETY
-- ============================================================

-- 2a. Bucket "documents" (CV, specs, app-docs, public/)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- 2b. Bucket "invoices" (skany faktur)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

-- 2c. Bucket "chat-attachments" (załączniki czatu)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. STORAGE POLICIES — bucket "documents"
-- ============================================================

-- 3a. Folder "public/" — dostęp dla wszystkich zalogowanych (odczyt)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public docs readable by all authenticated') THEN
        CREATE POLICY "Public docs readable by all authenticated" ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'documents'
                AND (storage.foldername(name))[1] = 'public'
            );
    END IF;
END $$;

-- 3b. Folder "public/" — upload przez admina/centrala
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Admins can upload public docs') THEN
        CREATE POLICY "Admins can upload public docs" ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'documents'
                AND (storage.foldername(name))[1] = 'public'
                AND EXISTS (
                    SELECT 1 FROM profiles
                    WHERE id = auth.uid()
                    AND role IN ('admin', 'administrator', 'centrala')
                )
            );
    END IF;
END $$;

-- 3c. Folder "app-docs/{user_id}/" — upload własnych dokumentów
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can upload own app-docs') THEN
        CREATE POLICY "Users can upload own app-docs" ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'documents'
                AND (storage.foldername(name))[1] = 'app-docs'
                AND (storage.foldername(name))[2] = auth.uid()::text
            );
    END IF;
END $$;

-- 3d. Folder "app-docs/{user_id}/" — odczyt własnych dokumentów
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can read own app-docs') THEN
        CREATE POLICY "Users can read own app-docs" ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'documents'
                AND (storage.foldername(name))[1] = 'app-docs'
                AND (storage.foldername(name))[2] = auth.uid()::text
            );
    END IF;
END $$;

-- 3e. Admin widzi wszystko w app-docs
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Admins can read all app-docs') THEN
        CREATE POLICY "Admins can read all app-docs" ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'documents'
                AND (storage.foldername(name))[1] = 'app-docs'
                AND EXISTS (
                    SELECT 1 FROM profiles
                    WHERE id = auth.uid() AND role IN ('admin', 'administrator', 'centrala')
                )
            );
    END IF;
END $$;

-- ============================================================
-- 4. STORAGE POLICIES — bucket "invoices"
-- ============================================================

-- 4a. Konsultant upload własnych faktur
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Consultants can upload own invoices') THEN
        CREATE POLICY "Consultants can upload own invoices" ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'invoices'
                AND (storage.foldername(name))[1] = auth.uid()::text
            );
    END IF;
END $$;

-- 4b. Konsultant odczyt własnych faktur
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Consultants can read own invoices') THEN
        CREATE POLICY "Consultants can read own invoices" ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'invoices'
                AND (storage.foldername(name))[1] = auth.uid()::text
            );
    END IF;
END $$;

-- 4c. Admin odczyt wszystkich faktur
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Admins can read all invoices storage') THEN
        CREATE POLICY "Admins can read all invoices storage" ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'invoices'
                AND EXISTS (
                    SELECT 1 FROM profiles
                    WHERE id = auth.uid() AND role IN ('admin', 'administrator', 'centrala')
                )
            );
    END IF;
END $$;

-- ============================================================
-- 5. WERYFIKACJA — wyświetl stan tabel
-- ============================================================

DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'profiles',
        'benefit_declarations',
        'equipment_requests',
        'invoices',
        'app_documents',
        'document_versions',
        'consultant_assignments',
        'system_settings',
        'centrala_benefit_declarations',
        'centrala_equipment_requests',
        'centrala_invoices',
        'centrala_referrals'
    ];
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'WERYFIKACJA TABEL - Qualrix / B2B.net';
    RAISE NOTICE '============================================';
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            RAISE NOTICE '  ✓ % — ISTNIEJE', tbl;
        ELSE
            RAISE NOTICE '  ✗ % — BRAKUJE!', tbl;
        END IF;
    END LOOP;
    RAISE NOTICE '============================================';
    RAISE NOTICE 'WERYFIKACJA STORAGE BUCKETÓW';
    RAISE NOTICE '============================================';
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'documents') THEN
        RAISE NOTICE '  ✓ documents — ISTNIEJE';
    ELSE
        RAISE NOTICE '  ✗ documents — BRAKUJE!';
    END IF;
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'invoices') THEN
        RAISE NOTICE '  ✓ invoices — ISTNIEJE';
    ELSE
        RAISE NOTICE '  ✗ invoices — BRAKUJE!';
    END IF;
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'chat-attachments') THEN
        RAISE NOTICE '  ✓ chat-attachments — ISTNIEJE';
    ELSE
        RAISE NOTICE '  ✗ chat-attachments — BRAKUJE!';
    END IF;
    RAISE NOTICE '============================================';
    RAISE NOTICE 'GOTOWE! Skrypt zakończył pracę.';
    RAISE NOTICE '============================================';
END $$;
