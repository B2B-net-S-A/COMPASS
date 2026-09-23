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

### Zewnętrzny check w Grafanie

`node ops/academy/grafana-schedule-check.mjs` wypisuje samodzielny skrypt k6 do wklejenia w **Grafana Cloud → Testing & synthetics → Synthetics → Checks → Add new check → Scripted**. Generator osadza tę samą funkcję walidującą co powyższy audyt ręczny; w Grafanie nie trzeba dodawać tokenu GitHub ani sekretu aplikacji. Publiczny GitHub REST zwraca ostatni udany przebieg `schedule` dla workflow `academy-health.yml`, a skrypt sprawdza `main`, zakończenie z sukcesem i wiek najwyżej 30 minut. Błędne HTTP, brak danych, niepoprawny JSON, zbyt duża odpowiedź i niepełne pola dają nieudany `check()` **oraz** wywołują `fail()` z kontrolowanym kodem błędu. Samo `check()` nie kończy testu błędem, a [Synthetic Monitoring nie obsługuje progów k6](https://grafana.com/docs/grafana-cloud/observe-and-act/testing/synthetic-monitoring/create-checks/checks/k6/). [Grafana zaleca jawne `fail()`](https://grafana.com/blog/5-tips-to-write-better-browser-tests-for-performance-testing-and-synthetic-monitoring/) do oznaczenia awarii sondy skryptowej. Skrypt nie loguje treści odpowiedzi ani błędu sieciowego.

Ustaw nazwę `COMPASS Academy scheduled watchdog`, target na URL GitHub REST zapisany w skrypcie, **jedną publiczną sondę**, częstotliwość **600 s** i timeout **20 s**. Najpierw użyj `Test` i sprawdź wynik asercji, `probe_check_success_rate` (1 = aktualny sukces, 0 = brak aktualnego sukcesu) oraz status nieudanej sondy po `fail()` na kontrolowanym błędnym fixture. Reguła alertu powinna oceniać ostatnią wartość `probe_check_success_rate` dla tego checku i traktować brak danych przez ponad 20 minut jako alarm; nie opieraj jej wyłącznie na samym HTTP 200. Jedna sonda co 10 minut to około 4320 uruchomień na 30 dni; przed zapisaniem sprawdź aktualny limit Grafana Cloud. Publiczny limit GitHub API jest współdzielony przez adres IP sondy: HTTP 403/429 ma pozostać widoczną awarią checku, a nie stanem zdrowym. Check działa poza aplikacją, hostem Coolify i harmonogramem GitHub Actions.

Przykładowa reguła Grafana Alerting (po potwierdzeniu etykiet w Explore):

```promql
last_over_time(probe_check_success_rate{job="COMPASS Academy scheduled watchdog",check="Academy scheduled watchdog has a successful run within 30 minutes"}[20m]) < 1
```

Ustaw `No Data` na `Alerting`, żeby brak samej sondy także był widoczny. Reguła i punkt kontaktowy wymagają osobnego testu z kontrolowanym niepowodzeniem; nie zakładaj, że obecne reguły `probe_success` obejmują asercje tego skryptu.

Ten check ocenia **ostatni udany** zaplanowany przebieg; pojedynczą późniejszą awarię workflow nadal pokazuje sam GitHub Actions, a check przechodzi w stan błędu, jeśli przez 30 minut nie ma kolejnego sukcesu. Samo zapisanie checku daje sygnał w Grafanie, lecz **nie dowodzi dostarczenia alarmu**. Regułę alertu dla nieudanego `probe_check_success_rate`, punkt kontaktowy i politykę powiadomień należy włączyć dopiero dla wskazanego dyżurnego i potwierdzić kontrolowanym testem doręczenia. Nie przypisywać automatycznie odbiorcy z istniejących reguł innych produktów.

Odbiór: udany ręczny przebieg na wdrożonym SHA, stan panelu, testy brakujących/nieudanych heartbeatów i odmów dostępu. Nie wymuszamy awarii na produkcji. Ten monitor nie stanowi dowodu odtworzenia kopii bazy/Storage ani pełnego przejścia szkolenia.
