-- ============================================================
-- Phase 9: Remove AI Assistant widget infrastructure
-- ============================================================
--
-- Drops the AI Assistant widget table and the document-search RPC that only
-- the widget consumed. The Compass Assist module (compass_assist_knowledge,
-- match_assist_knowledge RPC, compass_assist_tickets) is intentionally KEPT
-- because the Centrala admin dashboard widget still uses it.
--
-- Other AI infrastructure that stays:
--   - profiles.embedding / projects.embedding (matching)
--   - app_documents.text_content / ai_indexed (used by lib/actions/documents.ts)
--   - process-cv-batch route (CV parsing for recruiters)
--   - compass_assist_knowledge / compass_assist_tickets / match_assist_knowledge
--   - legal_documents row 'ai-notice' (RODO consent for AI tools — kept, content updated)

-- 1. Drop AI Assistant logs (widget feedback tracking)
DROP TABLE IF EXISTS ai_assistant_logs CASCADE;

-- 2. Drop the RPC the widget used to search documents (consultants now go via tickets/chat)
DROP FUNCTION IF EXISTS search_documents_for_ai(text, text, integer);
