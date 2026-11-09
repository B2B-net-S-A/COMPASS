# Akademia: migracje do zastosowania

Kolejka plików SQL Akademii. Sesje budujące tylko dopisują tu pliki, a stosuje je właściciel. Bo każdy merge jedzie na produkcję bez stagingu, a `supabase db push` próbowałby zaaplikować od nowa prawie cały katalog (rejestr i pliki są rozjechane, patrz `CLAUDE.md`).

## Rytm

1. Okno dzienne właściciela o stałej porze. Poza oknem nikt nie stosuje SQL, więc wiadomo, kiedy baza mogła się zmienić.
2. Pliki idą po kolei, od najniższego numeru w tabeli. Następny dopiero po udanym poprzednim.
3. Wyłącznie przez MCP `apply_migration` z wersją równą prefiksowi pliku. Nigdy `supabase db push`.
4. Migracja kończy się blokiem `DO $$` z `RAISE EXCEPTION`. Gdy samosprawdzenie padnie, transakcja się cofa, a kolejka staje do wyjaśnienia przyczyny.
5. Po zastosowaniu zmień „Stan” na datę i dopisz wersję z rejestru.

## Kod idzie przed SQL

Kod trafia na produkcję wcześniej niż jego migracja, więc:

- Nowa akcja obsługuje brak obiektu komunikatem „czeka na migrację” (`lib/academy/migration-contract.ts`). Liczą się kody `42P01`, `42703`, `42883` oraz `PGRST202`, `PGRST204`, `PGRST205`, bo PostgREST zgłasza brak tabeli, kolumny albo funkcji własnym kodem, zanim zapytanie dojdzie do Postgresa.
- Kanał wyjścia przy braku obiektu nie wysyła niczego. Brak kolejki oznacza brak wiadomości i zdarzenie w Sentry.
- Reszta aplikacji działa bez zmian niezależnie od tego, czy plik już zastosowano.

## Cofanie

Każdy wiersz ma w kolumnie „Cofnięcie” jedno z dwóch:

- ścieżkę skryptu: `supabase/rollbacks/<ta sama nazwa pliku>` (katalog względem `COMPASS/`, poza `supabase/migrations`, żeby skrypt nigdy nie wyglądał na migrację),
- albo dosłowną notkę: `nieodwracalne, cofamy PITR`.

Test `lib/academy/__tests__/migration-contract.test.ts` pilnuje, że każdy wiersz ma plik, końcowe samosprawdzenie, cofnięcie i właściwą kolejność.

## Kolejka

| Lp. | Plik | PR | Cofnięcie | Stan |
|---|---|---|---|---|
| 1 | `20261109021500_academy_outbox.sql` | B0.2 | `supabase/rollbacks/20261109021500_academy_outbox.sql` | czeka |
