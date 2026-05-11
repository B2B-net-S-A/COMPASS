-- Phase: bug cleanup
-- Default `employment_type` na 'b2b' (firma B2B Network — wszyscy pracownicy są B2B).
-- Wcześniejszy default 'uop' był legacy ze szablonu — niezgodny z realiami firmy.
-- NIE zmieniamy istniejących rekordów: admin sam ustawi w UI per user jeśli trzeba.

ALTER TABLE public.profiles
    ALTER COLUMN employment_type SET DEFAULT 'b2b';
