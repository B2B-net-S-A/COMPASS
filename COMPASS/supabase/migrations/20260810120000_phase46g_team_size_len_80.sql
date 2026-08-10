-- Phase 46g — „Wielkość zespołu": limit tekstu 40 → 80 znaków.
-- 46f zmieniło SMALLINT → TEXT z limitem 40, ale pole zachęca do opisu
-- ("np. 5-10, ok. 20, cały dział ~50"), a naturalne zdanie łatwo przekracza 40
-- ("cały dział IT, ok. 50 osób w kilku zespołach" = 46). Przy przekroczeniu INSERT
-- padał na CHECK, a Next.js maskował błąd w prod jako generyczny „Server Components
-- render" — TCM widział kryptyczny komunikat zamiast „za długi tekst".
-- 80 mieści każdy realny opis, wciąż chroniąc przed wklejeniem akapitu.
-- Rozszerzenie CHECK jest bezpieczne: istniejące wartości były ≤40, więc ≤80 trzyma.
-- Limit odzwierciedlony w app-layer stałą TEAM_SIZE_MAX (lib/types/tech-map.ts).

ALTER TABLE tech_interview_cards
    DROP CONSTRAINT IF EXISTS tech_interview_cards_team_size_len_check;

ALTER TABLE tech_interview_cards
    ADD CONSTRAINT tech_interview_cards_team_size_len_check
    CHECK (team_size IS NULL OR char_length(team_size) <= 80);
