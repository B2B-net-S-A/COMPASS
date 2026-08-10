-- Phase 49 — edytowalny tytuł karty rozmowy (Mapa technologiczna).
-- Do tej pory nagłówek rozmowy był wyłącznie wyliczany („Rozmowa: {konsultant}"),
-- więc importowane, ubogie nazwiska („wasilewski") stawały się nieedytowalnym
-- tytułem. Kolumna jest OPCJONALNA — puste pole zostawia dotychczasowy tytuł
-- domyślny (cardDisplayTitle w lib/types/tech-map.ts), a nie pusty nagłówek.
-- Limit odzwierciedlony w app-layer stałą CARD_TITLE_MAX; walidacja client-side
-- łapie przekroczenie, zanim CHECK zwróci w prod zamaskowany błąd (lekcja 46g).

ALTER TABLE tech_interview_cards
    ADD COLUMN IF NOT EXISTS title TEXT;

COMMENT ON COLUMN tech_interview_cards.title IS
    'Opcjonalny tytuł rozmowy nadany przez TCM. NULL = tytuł domyślny „Rozmowa: {konsultant}".';

-- Pusty string traktujemy jak brak tytułu (akcja zapisuje trim() || null) — CHECK
-- pilnuje, żeby żadna inna ścieżka nie wstawiła '' i nie zrobiła pustego nagłówka.
ALTER TABLE tech_interview_cards
    DROP CONSTRAINT IF EXISTS tech_interview_cards_title_len_check;

ALTER TABLE tech_interview_cards
    ADD CONSTRAINT tech_interview_cards_title_len_check
    CHECK (title IS NULL OR char_length(btrim(title)) BETWEEN 1 AND 120);
