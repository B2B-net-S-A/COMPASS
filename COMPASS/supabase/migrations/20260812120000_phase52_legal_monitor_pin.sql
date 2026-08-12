-- Phase 52 — Monitoring prawny: przypinanie wpisów na górę skrzynki.
--
-- Phase 51 ułożyła skrzynkę wg dnia otrzymania, więc wpis, który uznaliśmy za
-- ważny, po kilku dniach schodzi w dół razem ze swoim dniem. Pinezka wyjmuje go
-- z tego porządku i trzyma na górze, niezależnie od tego, kiedy przyszedł
-- i jaki ma status przeglądu.
--
-- Pinezka jest WSPÓLNA dla całego zespołu, nie prywatna — reszta stanu wpisu
-- (status, notatka, termin, osoba odpowiedzialna) też jest wspólna, a moduł
-- obsługuje kilka osób pracujących na jednej skrzynce. Prywatne zakładki
-- wymagałyby tabeli łączącej (item × user); nie ma na to potrzeby.
--
-- Pinezka jest ORTOGONALNA do statusu: „Do reakcji" to stan procesu (ma termin,
-- osobę i budzi crona), a przypięcie to „chcemy mieć to pod ręką". Można więc
-- przypiąć wpis przejrzany, i przegląd pinezki nie zdejmuje.

alter table public.legal_monitor_items
    -- Kiedy przypięto; NULL = nieprzypięty. Timestamp, nie boolean — daje
    -- kolejność w sekcji przypiętych (ostatnio przypięte na górze).
    add column if not exists pinned_at timestamptz,
    -- Kto przypiął (widoczne w panelu szczegółu, żeby wiadomo było, czyja to
    -- pinezka). ON DELETE SET NULL — usunięcie konta nie odpina wpisu.
    add column if not exists pinned_by uuid references public.profiles(id) on delete set null;

comment on column public.legal_monitor_items.pinned_at is
    'Phase 52: kiedy wpis przypięto na górę skrzynki. NULL = nieprzypięty.';
comment on column public.legal_monitor_items.pinned_by is
    'Phase 52: kto przypiął; NULL po usunięciu konta (wpis zostaje przypięty).';

-- Przypiętych są jednostki, więc indeks partial jest mały i wysoce selektywny.
create index if not exists legal_monitor_items_pinned_idx
    on public.legal_monitor_items (pinned_at desc)
    where pinned_at is not null;

-- RLS bez zmian: SELECT ma has_legal_monitor_read() (finanse+admin+grant),
-- UPDATE is_finanse_or_admin(). Polityki są wierszowe, więc to warstwa aplikacji
-- pilnuje, że moduł rusza wyłącznie kolumny przeglądu — teraz plus te dwie.
