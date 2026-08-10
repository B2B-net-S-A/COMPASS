-- Phase 50b — źródło PRASA w monitoringu prawnym.
--
-- Artur wskazał dodatkowe strony do obserwowania: prawo.pl,
-- porozmawiajmyopodatkach.pl, newsletter pl.andersen.com, estonskicit.com.
-- Samo ICH CZYTANIE jest po stronie pipeline'u (zadanie cykliczne AI), ale
-- `source` ma sztywny CHECK — bez tej wartości każdy taki wpis odbiłby się od
-- constraintu przy INSERT. Rozszerzenie CHECK jest bezpieczne (istniejące
-- wartości pozostają dozwolone).
--
-- PRASA = pozycje, których pierwotnym źródłem jest omówienie/komentarz, a nie
-- rejestr urzędowy. Gdy pipeline dociera do samego orzeczenia czy interpretacji,
-- nadal używa kodu właściwego rejestru (SN / NSA_WSA / EUREKA / ZUS), a prasę
-- podaje w `source_label` — tak jak robi to dziś („TK — Trybunał Konstytucyjny / prasa").

alter table public.legal_monitor_items drop constraint if exists legal_monitor_items_source_check;
alter table public.legal_monitor_items add constraint legal_monitor_items_source_check check (
    source = any (array['GIP','EUREKA','SN','NSA_WSA','ZUS','SEJM_RCL','TK','PRASA']::text[])
);

comment on column public.legal_monitor_items.source is
    'Kod źródła. PRASA (Phase 50b) = prasa i komentarze branżowe (prawo.pl, '
    'porozmawiajmyopodatkach.pl, newsletter Andersen, estonskicit.com) — pozycje, '
    'ktorych pierwotnym zrodlem jest omowienie, a nie rejestr urzedowy.';
