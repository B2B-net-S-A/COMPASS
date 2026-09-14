# Tablica spraw: Administracja i Marketing

Tablica działa w `/internal/people?tab=sprawy` i `/admin/inbox`. Parametr `board=marketing` otwiera Marketing, `board=administration` Administrację. Bez parametru pokazuje oba obszary. To widoki tych samych spraw, z dotychczasowymi uprawnieniami obsługi.

- Aktywne: otwarte, w trakcie, oczekujące i rozwiązane w ostatnich 14 dniach. Archiwum: wszystkie rozwiązane i zamknięte. Archiwizacja jest filtrem; nie usuwa ani nie zmienia historii.
- Wyszukiwarka, osoba, typ, priorytet, klient, szybkie filtry i sortowanie zapisują się w URL. Zamknięcie panelu bocznego zachowuje tablicę i jej przewinięcie.
- Obszar jest osobnym polem od typu sprawy. Typy obejmują m.in. Grafikę, Publikację, Wydarzenie i Kampanię. Istniejącą sprawę można przenieść do Marketingu w edytorze, zachowując jej typ.
- Planowany termin jest datą do końca dnia w strefie Europe/Warsaw. W Administracji bez niego wyświetlane jest dotychczasowe SLA; w Marketingu „Ustal termin”. Zmiana priorytetu nie przesuwa istniejącego SLA. Zakończone karty pokazują datę zakończenia, nigdy zaległość.
- Oczekuje: pole „Na kogo / na co czekamy” i data ponownego kontaktu. Filtr „Do ponowienia” obejmuje niezakończone sprawy z datą dziś lub wcześniej.
- Panel i pełna strona pozwalają edytować tytuł, opis, obszar, typ, właściciela, priorytet, termin, oczekiwanie, checklistę i linki. Nowa sprawa ma zwijane dodatkowe dane kontaktowe. Helpdesk zachowuje własną obsługę i nazwy statusów.
- Sortowanie określa kolejność w kolumnie. Przeciąganie zmienia status między kolumnami; nie zapisuje ręcznej kolejności w jednej kolumnie.

## Zapis i weryfikacja

Migracja `inbox_workspace_usability` dodaje pola i funkcję `update_inbox_workspace`. Funkcja działa jako SECURITY INVOKER, z istniejącym RLS i jawnym sprawdzeniem uprawnień. Zmiana sprawy i metadanych jest atomowa; wymagany jest aktualny `updated_at`. Materiały dopuszczają wyłącznie linki HTTP(S), maksymalnie 30; checklista maksymalnie 50 punktów.

Zmiana wymaga zaaplikowania migracji przed wdrożeniem aplikacji. Na produkcji zastosowano ją przez Supabase MCP, wersja `20260914100826`. Nie dokonuje automatycznej klasyfikacji historycznych spraw na podstawie tytułów; zachowuje istniejący Marketing.

Testy jednostkowe: `lib/inbox/__tests__/workspace.test.ts`, testy komponentów w `components/inbox/__tests__` i `lib/actions/__tests__/support-inbox.test.ts`. Test SQL `supabase/tests/inbox_workspace_smoke.sql` uruchamia zapis i odrzucenia w transakcji zakończonej ROLLBACK; wymaga połączenia administracyjnego i istniejącego profilu administratora. Nie wysyła wiadomości ani nie pozostawia danych testowych.
