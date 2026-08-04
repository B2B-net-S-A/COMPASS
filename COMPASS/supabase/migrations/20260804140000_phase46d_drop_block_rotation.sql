-- ============================================================================
-- Phase 46d — Mapa technologiczna: rezygnacja z rotacji bloków (jedna karta)
-- Date: 2026-08-04
-- Depends on: phase46b (tech_interview_cards.block, tech_block_assignments)
-- What / dlaczego:
--   Decyzja Artura 2026-08-04: karta wypełniana ZA JEDNYM ZAMACHEM (technologie,
--   projekt/pion, poszukiwane kompetencje, zadowolenie + reszta jako opcjonalne),
--   bez dzielenia na bloki B/C/D. Rotacja („kto ma jaki blok w kwartale") okazała
--   się nadmiarowa wobec realnego procesu (komplet raz, potem lekkie telefony
--   aktualizacyjne). Usuwamy:
--     - tech_interview_cards.block (kolumna NOT NULL CHECK B/C/D — bez sensu, gdy
--       jedna karta pokrywa wszystko),
--     - tech_block_assignments (cała tabela przydziałów + jej indeks/trigger).
--   Bezpieczne: 0 realnych kart na prodzie; jedyne wiersze przydziałów to
--   640 auto-B wygenerowanych testowo przy weryfikacji Etapu 2.
-- ============================================================================

BEGIN;

-- Indeksy zależne od block (WHERE hiring ... nie zależy od block; drop tylko block).
DROP INDEX IF EXISTS idx_tech_cards_client_hiring;
ALTER TABLE tech_interview_cards DROP COLUMN IF EXISTS block;
-- Odtworzenie indeksu popytu bez odwołania do block (był: WHERE hiring AND NOT draft).
CREATE INDEX IF NOT EXISTS idx_tech_cards_client_hiring
    ON tech_interview_cards (client_id) WHERE hiring = TRUE AND is_draft = FALSE;

DROP TABLE IF EXISTS tech_block_assignments;

COMMIT;
