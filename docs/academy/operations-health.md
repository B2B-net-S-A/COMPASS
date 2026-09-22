# Nadzór nad zadaniami Akademii

Panel administratora `/admin/learning/integrations` pokazuje ostatni zakończony przebieg skanowania i synchronizacji, stan kolejek, rezerwację przestrzeni oraz datę sygnatur ClamAV. Stan pochodzi z systemowych heartbeatów (`user_id IS NULL`) i agregatów bazy; formularze użytkowników nie mogą podrobić pomyślnego wykonania. Błąd odczytu nie jest prezentowany jako pusta kolejka. Odczyt nie skanuje plików, nie wykonuje Graph, nie wysyła powiadomień ani nie zmienia danych.

| Sygnał | Ocena | Odpowiedzialność |
| --- | --- | --- |
| Brak zakończonego przebiegu, najnowszy nieudany lub starszy niż 15 min | Wymagana interwencja | Operator: jednostki systemd, blokada konserwacji, aplikacja i połączenie z bazą |
| Poprawny przebieg starszy niż 5 min | Ostrzeżenie | Operator: czy trwa wdrożenie/aktualizacja skanera |
| Wyczerpane próby lub zadanie ponad 30 min po terminie wykonania | Wymagana interwencja | Administrator: sprawdzenie kolejki; operator: przyczyna błędu przed ponowieniem |
| Gotowość skanera niepotwierdzona | Ostrzeżenie; brak udanego workera przechodzi w alarm | Operator: aktualizacja, sieć prywatna i daemon |
| Sygnatury co najmniej 24 h | Ostrzeżenie | Operator: aktualizacja; po 48 h skanowanie jest blokowane |
| Rezerwacja autora co najmniej 80% z 10 GB | Ostrzeżenie | Administrator: dalsze postępowanie, bez niezatwierdzonego usuwania |
| Nieaktywne/niewłączone timery lub dysk hosta poniżej 5 GiB/10% | Wymagana interwencja w watchdogu | Operator techniczny |

`GET /api/cron/academy-health` wymaga istniejącego sekretu crona. Zwraca 503 dla krytycznego stanu lub błędu odczytu; 200 z jawnym `degraded` dla ostrzeżenia. Nie zmienia kontraktu publicznego `/api/health`. Funkcja agregująca jest dostępna wyłącznie roli technicznej; panel tworzy klienta technicznego dopiero po sprawdzeniu aktywnego administratora Akademii.

Workflow `Academy operations watchdog` jest niezależny od timerów, które obserwuje. Co 10 minut i ręcznie wykonuje stały odczyt przez istniejący SSH z przypiętym kluczem hosta. Sekret HTTP pozostaje wewnątrz kontenera aplikacji. Wynik zawiera wyłącznie status i kontrolowane kody problemów, bez danych osób, ścieżek plików ani treści audytu. Awaria sondy kończy workflow błędem, nie pominięciem. Alarmy są widoczne jako błędny przebieg i adnotacje GitHub Actions; dostarczenie powiadomień GitHub zależy od ustawień odbiorcy. Nie skonfigurowano dodatkowego kanału e-mail/Teams ani personalnej obsady operatora.

Harmonogram GitHub może się opóźnić — nie jest to gwarancja reakcji w 10 minut. Okno ostrzegawcze uwzględnia krótki build/aktualizację; długie przerwanie nadal wymaga kontroli. Monitor nie podejmuje automatycznych restartów, nie omija skanowania i nie zmienia uprawnień.

Odbiór: udany ręczny przebieg na wdrożonym SHA, stan panelu, testy brakujących/nieudanych heartbeatów i odmów dostępu. Nie wymuszamy awarii na produkcji. Ten monitor nie stanowi dowodu odtworzenia kopii bazy/Storage ani pełnego przejścia szkolenia.
