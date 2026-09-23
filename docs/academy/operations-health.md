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

`academy-sync` wykonuje przypomnienia, retencję i (po włączeniu) integrację Teams niezależnie. Odpowiedź zawiera `failedOperations` z nazwami nieudanych części oraz `null` zamiast nieznanego licznika; każde niepowodzenie zwraca HTTP 503 i nie zapisuje fałszywie poprawnego heartbeatu. Awaria przypomnień lub retencji nie zatrzymuje pobrania kolejki spotkań i obecności.

Workflow `Academy operations watchdog` jest niezależny od timerów, które obserwuje. Deklaruje harmonogram co 10 minut i pozwala na ręczne uruchomienie stałego odczytu przez istniejący SSH z przypiętym kluczem hosta. Sekret HTTP pozostaje wewnątrz kontenera aplikacji. Wynik zawiera wyłącznie status i kontrolowane kody problemów, bez danych osób, ścieżek plików ani treści audytu. Stan `degraded`, `unhealthy` albo awaria sondy kończą workflow błędem; `degraded` nadal zachowuje poziom `warning` w treści adnotacji. Alarmy są widoczne jako błędny przebieg i adnotacje GitHub Actions; dostarczenie powiadomień GitHub zależy od ustawień odbiorcy. Nie skonfigurowano dodatkowego kanału e-mail/Teams ani personalnej obsady operatora.

Harmonogram GitHub może się opóźnić lub pominąć przebieg — nie jest to gwarancja reakcji w 10 minut. Dnia 23.09.2026 ostatni przebieg `schedule` o 09:52 UTC był po ponad 3,5 godzinach nadal ostatnim, choć ręczny przebieg o 13:27 UTC zakończył się prawidłowo. Operator może sprawdzić tę lukę bez nowego sekretu przez istniejący dostęp `codex-gh`:

```sh
codex-gh api 'repos/B2B-net-S-A/COMPASS/actions/workflows/academy-health.yml/runs?event=schedule&per_page=20' \
  --jq '{workflow_runs: [.workflow_runs[] | {id,event,head_branch,created_at,status,conclusion}]}' \
  | node ops/academy/watchdog-schedule-audit.mjs
```

Polecenie wymaga ręcznego uruchomienia z katalogu repozytorium i uprawnienia do istniejących metadanych Actions. Zwraca błąd przy braku poprawnego przebiegu `schedule` na `main` w ostatnich 30 minutach, przy nieudanym/niedokończonym przebiegu lub przy niepełnym odczycie. Nie jest niezależnym monitorem braku własnego uruchomienia. Do gwarantowanej eskalacji potrzebny jest osobny, niezależny monitor z nazwanym odbiorcą i sprawdzonym dostarczeniem alarmu. Okno ostrzegawcze uwzględnia krótki build/aktualizację; długie przerwanie nadal wymaga kontroli. Monitor nie podejmuje automatycznych restartów, nie omija skanowania i nie zmienia uprawnień.

Odbiór: udany ręczny przebieg na wdrożonym SHA, stan panelu, testy brakujących/nieudanych heartbeatów i odmów dostępu. Nie wymuszamy awarii na produkcji. Ten monitor nie stanowi dowodu odtworzenia kopii bazy/Storage ani pełnego przejścia szkolenia.
