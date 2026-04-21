-- Performance Optimization: Database Indexes
-- Adds indexes to frequently queried columns for faster queries
-- ============================================================
-- PROFILES TABLE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_loyalty_tier ON profiles(loyalty_tier);
CREATE INDEX IF NOT EXISTS idx_profiles_current_status ON profiles(current_status);
-- ============================================================
-- EQUIPMENT REQUESTS INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_equipment_requests_status ON equipment_requests(status);
CREATE INDEX IF NOT EXISTS idx_equipment_requests_created_at ON equipment_requests(created_at DESC);
-- ============================================================
-- BENEFIT DECLARATIONS INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_benefit_declarations_benefit_type ON benefit_declarations(benefit_type);
CREATE INDEX IF NOT EXISTS idx_benefit_declarations_created_at ON benefit_declarations(created_at DESC);
-- ============================================================
-- APP DOCUMENTS INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_app_documents_category ON app_documents(category);
CREATE INDEX IF NOT EXISTS idx_app_documents_archived ON app_documents(is_archived);
CREATE INDEX IF NOT EXISTS idx_app_documents_created_at ON app_documents(created_at DESC);
-- ============================================================
-- DOCUMENT VERSIONS INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_document_versions_document_id ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_version_number ON document_versions(version_number);
-- ============================================================
-- CANDIDATES TABLE INDEXES
CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);
CREATE INDEX IF NOT EXISTS idx_candidates_current_status ON candidates(current_status);
-- PROJECTS TABLE INDEXES
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);