-- ============================================================
-- Phase A1.2 — Course Certificates
-- Date: 2026-05-08
--
-- Dodaje do course_enrollments:
--   - certificate_issued_at: TIMESTAMPTZ (kiedy certyfikat wygenerowany pierwszy raz)
--   - certificate_hash: TEXT (sha256 fingerprint, stem dla publicznej weryfikacji)
--
-- Idempotent: ADD COLUMN IF NOT EXISTS guarded.
-- ============================================================

BEGIN;

ALTER TABLE course_enrollments
    ADD COLUMN IF NOT EXISTS certificate_issued_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS certificate_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_course_enrollments_cert_hash
    ON course_enrollments(certificate_hash)
    WHERE certificate_hash IS NOT NULL;

COMMENT ON COLUMN course_enrollments.certificate_issued_at IS
    'A1.2: Timestamp wystawienia certyfikatu PDF (jednorazowo przy pierwszym pobraniu).';
COMMENT ON COLUMN course_enrollments.certificate_hash IS
    'A1.2: SHA-256 hash deterministyczny — fingerprint do publicznej weryfikacji certyfikatu.';

COMMIT;
