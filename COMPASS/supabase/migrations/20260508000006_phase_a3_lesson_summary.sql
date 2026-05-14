-- ============================================================
-- Phase A3.2 — AI Lesson Summarizer
-- Date: 2026-05-08
--
-- Dodaje do course_lessons:
--   - ai_summary: TEXT (3-bullet TL;DR generowane przez Claude Haiku, cachowane)
--   - ai_summary_generated_at: TIMESTAMPTZ
--
-- Cachujemy bo content lekcji rzadko się zmienia. Regeneracja: tylko gdy autor
-- jawnie kliknie "regeneruj" lub gdy content_md się zmieni (TODO: trigger w przyszłości).
-- ============================================================

BEGIN;

ALTER TABLE course_lessons
    ADD COLUMN IF NOT EXISTS ai_summary TEXT,
    ADD COLUMN IF NOT EXISTS ai_summary_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN course_lessons.ai_summary IS
    'A3.2: AI-generated 3-bullet TL;DR + key takeaways (Claude Haiku, cached).';
COMMENT ON COLUMN course_lessons.ai_summary_generated_at IS
    'A3.2: Timestamp ostatniej generacji summary. NULL = nigdy nie wygenerowane.';

COMMIT;
