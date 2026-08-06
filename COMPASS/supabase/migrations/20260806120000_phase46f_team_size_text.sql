-- Phase 46f — „Wielkość zespołu" jako tekst (przedział/opis) zamiast liczby.
-- TCM często zna zespół z grubsza ("5-10", "ok. 20", "cały dział ~50"), a nie co do
-- osoby. Zmiana SMALLINT → TEXT: istniejące liczby castują się bezstratnie ('8'),
-- a formularz zyskuje wolny tekst + szybkie przedziały do wyboru.
-- team_externals zostaje liczbą — zmiana dotyczy tylko „Wielkość zespołu".

ALTER TABLE tech_interview_cards
    DROP CONSTRAINT IF EXISTS tech_interview_cards_team_size_check;

ALTER TABLE tech_interview_cards
    ALTER COLUMN team_size TYPE TEXT USING team_size::text;

-- Krótki opis/przedział — twardy limit długości chroni przed przypadkowym wklejeniem.
ALTER TABLE tech_interview_cards
    ADD CONSTRAINT tech_interview_cards_team_size_len_check
    CHECK (team_size IS NULL OR char_length(team_size) <= 40);
